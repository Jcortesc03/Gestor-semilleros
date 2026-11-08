import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import { DOCUMENT_STORAGE, STORAGE_UNAVAILABLE, type DocumentStorage } from '../../documents';
import { DeliveryDispatcher, NotificationDeliveryService, type DeliverySummary } from '../../integrations';
import type { AudienceDto, CreateAnnouncementDto, ListAnnouncementsQuery } from '../dtos/announcement.dto';
import {
  announcementSelect,
  toAnnouncementResponse,
  type AnnouncementResponseDto,
} from '../dtos/announcement-response.dto';
import { inspectAttachments, type IncomingFile } from '../models/announcement-attachments';
import { renderAnnouncementMessage } from '../models/announcement-message';
import { canPublishKind, canPublishTo } from '../models/publish-scope';
import { AudienceService } from './audience.service';

export const ANNOUNCEMENT_NOT_FOUND = 'Novedad no encontrada.';
export const ATTACHMENT_NOT_FOUND = 'Archivo adjunto no encontrado.';
export const FORBIDDEN_MESSAGE = 'No tienes permisos para realizar esta acción.';

export interface CreatedAnnouncementDto extends AnnouncementResponseDto {
  /** Copias encoladas por correo y WhatsApp según las preferencias de los destinatarios. */
  queuedDeliveries: number;
}

export interface AttachmentDownload {
  stream: Readable;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audiences: AudienceService,
    private readonly deliveries: NotificationDeliveryService,
    private readonly dispatcher: DeliveryDispatcher,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
  ) {}

  async create(user: AuthUser, dto: CreateAnnouncementDto, files: readonly IncomingFile[] = []): Promise<CreatedAnnouncementDto> {
    await this.assertTargetsExist(dto.audiences);
    const scope = await this.audiences.publishScope(user);
    if (!canPublishKind(scope, dto.kind) || !dto.audiences.every((a) => canPublishTo(scope, a))) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    const inspected = inspectAttachments(dto.kind, files);
    if (!inspected.ok) throw new BadRequestException({ message: 'Datos inválidos.', errors: inspected.errors });
    const attachments = inspected.value;
    if (attachments.length > 0 && !this.storage.isConfigured()) throw new ServiceUnavailableException(STORAGE_UNAVAILABLE);

    const recipientIds = (await this.audiences.recipientIds(dto.audiences)).filter((id) => id !== user.id);
    const { subject, body } = renderAnnouncementMessage({ ...dto, authorName: user.fullName, attachmentsCount: attachments.length });

    const announcementId = randomUUID();
    const publishedAt = new Date();
    const stored = attachments.map((a) => ({ ...a, storageKey: `announcements/${announcementId}/${randomUUID()}` }));
    await this.uploadAll(stored);

    let result: { row: Awaited<ReturnType<AnnouncementsService['findVisible']>>; queued: number };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.announcement.create({
          data: {
            id: announcementId,
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
            attachments: {
              // createdAt explícito y creciente: conserva el orden de subida en las respuestas.
              create: stored.map((a, index) => ({
                createdAt: new Date(publishedAt.getTime() + index),
                fileName: a.fileName,
                format: a.format,
                mimeType: a.mimeType,
                sizeBytes: a.buffer.length,
                storageKey: a.storageKey,
              })),
            },
          },
          select: announcementSelect,
        });
        const count = await this.deliveries.enqueue(
          { source: { announcementId: created.id }, kind: dto.kind, subject, body, recipientIds },
          tx,
        );
        return { row: created, queued: count };
      });
    } catch (error) {
      await this.removeObjects(stored.map((a) => a.storageKey));
      throw error;
    }
    const { row, queued } = result;

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

  /** Abre el adjunto de una novedad visible para el usuario (404 si no lo es, está eliminada o no le pertenece). */
  async downloadAttachment(user: AuthUser, id: string, attachmentId: string): Promise<AttachmentDownload> {
    const where = await this.audiences.visibleWhere(user);
    const attachment = await this.prisma.announcementAttachment.findFirst({
      where: { id: attachmentId, announcementId: id, announcement: { AND: [where, { id }] } },
    });
    if (!attachment) throw new NotFoundException(ATTACHMENT_NOT_FOUND);
    if (!this.storage.isConfigured()) throw new ServiceUnavailableException(STORAGE_UNAVAILABLE);
    try {
      const stream = await this.storage.get(attachment.storageKey);
      return { stream, fileName: attachment.fileName, mimeType: attachment.mimeType, sizeBytes: Number(attachment.sizeBytes) };
    } catch (error) {
      this.logger.error(`No se pudo leer el objeto del almacenamiento: ${String(error)}`);
      throw new ServiceUnavailableException(STORAGE_UNAVAILABLE);
    }
  }

  /** Sube todos los archivos; si alguno falla, borra los ya subidos y responde 503 (no se crea nada). */
  private async uploadAll(files: readonly { storageKey: string; buffer: Buffer; mimeType: string }[]): Promise<void> {
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        await this.storage.put(file.storageKey, file.buffer, file.mimeType);
        uploaded.push(file.storageKey);
      }
    } catch (error) {
      this.logger.error(`No se pudo guardar el objeto en el almacenamiento: ${String(error)}`);
      await this.removeObjects(uploaded);
      throw new ServiceUnavailableException(STORAGE_UNAVAILABLE);
    }
  }

  private async removeObjects(keys: readonly string[]): Promise<void> {
    await Promise.all(
      keys.map((key) =>
        this.storage.remove(key).catch((error: unknown) => {
          this.logger.warn(`Objeto huérfano ${key}: ${String(error)}`);
        }),
      ),
    );
  }

  /** Eliminación lógica por el autor o el administrador; cancela las copias pendientes. */
  async remove(user: AuthUser, id: string): Promise<void> {
    const row = await this.findVisible(user, id);
    this.assertOwnerOrAdmin(user, row.author.id);
    await this.prisma.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.deliveries.cancel({ announcementId: id });
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
