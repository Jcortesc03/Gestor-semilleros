import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import { DeliveryDispatcher, NotificationDeliveryService, type DeliverySummary } from '../../integrations';
import type { AudienceDto, CreateAnnouncementDto, ListAnnouncementsQuery } from '../dtos/announcement.dto';
import {
  announcementSelect,
  toAnnouncementResponse,
  type AnnouncementResponseDto,
} from '../dtos/announcement-response.dto';
import { renderAnnouncementMessage } from '../models/announcement-message';
import { canPublishKind, canPublishTo } from '../models/publish-scope';
import { AudienceService } from './audience.service';

export const ANNOUNCEMENT_NOT_FOUND = 'Novedad no encontrada.';
export const FORBIDDEN_MESSAGE = 'No tienes permisos para realizar esta acción.';

export interface CreatedAnnouncementDto extends AnnouncementResponseDto {
  /** Copias encoladas por correo y WhatsApp según las preferencias de los destinatarios. */
  queuedDeliveries: number;
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audiences: AudienceService,
    private readonly deliveries: NotificationDeliveryService,
    private readonly dispatcher: DeliveryDispatcher,
  ) {}

  async create(user: AuthUser, dto: CreateAnnouncementDto): Promise<CreatedAnnouncementDto> {
    await this.assertTargetsExist(dto.audiences);
    const scope = await this.audiences.publishScope(user);
    if (!canPublishKind(scope, dto.kind) || !dto.audiences.every((a) => canPublishTo(scope, a))) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    const recipientIds = (await this.audiences.recipientIds(dto.audiences)).filter((id) => id !== user.id);
    const { subject, body } = renderAnnouncementMessage({ ...dto, authorName: user.fullName });

    const { row, queued } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.announcement.create({
        data: {
          authorId: user.id,
          kind: dto.kind,
          title: dto.title,
          content: dto.content,
          audiences: {
            create: dto.audiences.map((a) => ({
              audienceType: a.type,
              role: a.type === 'ROLE' ? a.role : null,
              facultyId: a.type === 'FACULTY' ? a.facultyId : null,
              areaId: a.type === 'AREA' ? a.areaId : null,
              projectId: a.type === 'PROJECT' ? a.projectId : null,
            })),
          },
        },
        select: announcementSelect,
      });
      const count = await this.deliveries.enqueue(
        { announcementId: created.id, kind: dto.kind, subject, body, recipientIds },
        tx,
      );
      return { row: created, queued: count };
    });

    if (queued > 0) this.dispatcher.kick();
    return { ...toAnnouncementResponse(row), queuedDeliveries: queued };
  }

  async list(user: AuthUser, query: ListAnnouncementsQuery): Promise<AnnouncementResponseDto[]> {
    const where = await this.audiences.visibleWhere(user);
    const rows = await this.prisma.announcement.findMany({
      where: {
        AND: [
          where,
          { publishedAt: { lte: new Date(), ...(query.before ? { lt: query.before } : {}) } },
          ...(query.kind ? [{ kind: query.kind }] : []),
        ],
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      select: announcementSelect,
    });
    return rows.map(toAnnouncementResponse);
  }

  async get(user: AuthUser, id: string): Promise<AnnouncementResponseDto> {
    return toAnnouncementResponse(await this.findVisible(user, id));
  }

  /** Eliminación lógica por el autor o el administrador; cancela las copias pendientes. */
  async remove(user: AuthUser, id: string): Promise<void> {
    const row = await this.findVisible(user, id);
    this.assertOwnerOrAdmin(user, row.author.id);
    await this.prisma.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.deliveries.cancel(id);
  }

  /** Estado de las copias externas (solo autor o administrador). */
  async deliverySummary(user: AuthUser, id: string): Promise<DeliverySummary> {
    const row = await this.findVisible(user, id);
    this.assertOwnerOrAdmin(user, row.author.id);
    return this.deliveries.summary(id);
  }

  private async findVisible(user: AuthUser, id: string) {
    const where = await this.audiences.visibleWhere(user);
    const row = await this.prisma.announcement.findFirst({ where: { AND: [where, { id }] }, select: announcementSelect });
    if (!row) throw new NotFoundException(ANNOUNCEMENT_NOT_FOUND);
    return row;
  }

  private assertOwnerOrAdmin(user: AuthUser, authorId: string): void {
    if (authorId !== user.id && !user.roles.includes('ADMIN')) throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }

  /** 400 si alguna facultad, área o proyecto indicado no existe (o el proyecto está eliminado). */
  private async assertTargetsExist(audiences: readonly AudienceDto[]): Promise<void> {
    const faculties: string[] = [];
    const areas: string[] = [];
    const projects: string[] = [];
    for (const a of audiences) {
      if (a.type === 'FACULTY') faculties.push(a.facultyId);
      else if (a.type === 'AREA') areas.push(a.areaId);
      else if (a.type === 'PROJECT') projects.push(a.projectId);
    }
    const errors: string[] = [];
    if (faculties.length && (await this.prisma.faculty.count({ where: { id: { in: faculties } } })) !== faculties.length) {
      errors.push('Alguna de las facultades indicadas no existe.');
    }
    if (areas.length && (await this.prisma.area.count({ where: { id: { in: areas } } })) !== areas.length) {
      errors.push('Alguna de las áreas indicadas no existe.');
    }
    if (projects.length && (await this.prisma.project.count({ where: { id: { in: projects }, deletedAt: null } })) !== projects.length) {
      errors.push('Alguno de los proyectos indicados no existe.');
    }
    if (errors.length) throw new BadRequestException({ message: 'Datos inválidos.', errors });
  }
}
