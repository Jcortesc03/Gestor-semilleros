import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import { can, type ProjectAccess } from '../../projects';
import type {
  ApprovalDto,
  AssigneeDto,
  AttachmentLinkDto,
  CreateActivityDto,
  UpdateActivityDto,
} from '../dtos/activity.dto';
import type { ActivityResponseDto } from '../dtos/board-response.dto';
import { WorkAccessService } from './work-access.service';

const userRef = { select: { id: true, fullName: true } } as const;
const activityInclude = {
  author: userRef,
  approvedBy: userRef,
  assignees: { select: { user: userRef }, orderBy: { assignedAt: 'asc' } },
  attachments: { include: { createdBy: userRef }, orderBy: { createdAt: 'asc' } },
} as const;
type ActivityRecord = Prisma.ActivityGetPayload<{ include: typeof activityInclude }>;

const toResponse = (a: ActivityRecord): ActivityResponseDto => ({
  id: a.id,
  boardId: a.boardId,
  title: a.title,
  description: a.description,
  progressStatus: a.progressStatus,
  result: a.result,
  approvalStatus: a.approvalStatus,
  approvedBy: a.approvedBy,
  approvedAt: a.approvedAt?.toISOString() ?? null,
  author: a.author,
  assignees: a.assignees.map((x) => x.user),
  attachments: a.attachments.map((t) => ({
    id: t.id,
    kind: t.kind,
    url: t.url,
    documentId: t.documentId,
    createdBy: t.createdBy,
    createdAt: t.createdAt.toISOString(),
  })),
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

/** Estados de progreso que puede fijar un estudiante encargado (P-13). */
const ASSIGNEE_PROGRESS = new Set(['PENDING', 'IN_PROGRESS', 'DONE']);

/**
 * Actividades de un tablero.
 * - Tutores, líder y admin: crear, editar, eliminar y gestionar encargados (P-09, RN-47).
 * - Encargados: cambiar el progreso (sin cancelar) y gestionar enlaces adjuntos (P-13).
 * - Tutores y admin: aprobar y fijar el resultado (RN-49); solo con progreso DONE (ADR 0010, sec. 5).
 */
@Injectable()
export class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly work: WorkAccessService,
  ) {}

  async create(user: AuthUser, boardId: string, dto: CreateActivityDto): Promise<ActivityResponseDto> {
    const { access } = await this.work.board(user, boardId);
    this.assert(can.manageActivities(access));
    const activity = await this.prisma.activity.create({
      data: { ...dto, boardId, authorId: user.id },
      include: activityInclude,
    });
    return toResponse(activity);
  }

  async list(user: AuthUser, boardId: string): Promise<ActivityResponseDto[]> {
    await this.work.board(user, boardId);
    const activities = await this.prisma.activity.findMany({
      where: { boardId, deletedAt: null },
      include: activityInclude,
      orderBy: { createdAt: 'asc' },
    });
    return activities.map(toResponse);
  }

  async get(user: AuthUser, activityId: string): Promise<ActivityResponseDto> {
    await this.work.activity(user, activityId);
    return this.load(activityId);
  }

  async update(user: AuthUser, activityId: string, dto: UpdateActivityDto): Promise<ActivityResponseDto> {
    const { access, isAssignee } = await this.work.activity(user, activityId);
    const manager = can.manageActivities(access);

    if (dto.title !== undefined || dto.description !== undefined) this.assert(manager);
    if (dto.result !== undefined) this.assert(can.review(access));
    if (dto.progressStatus !== undefined) {
      const allowedForAssignee = isAssignee && ASSIGNEE_PROGRESS.has(dto.progressStatus);
      this.assert(manager || allowedForAssignee);
    }

    const data: Prisma.ActivityUncheckedUpdateInput = { ...dto };
    if (dto.progressStatus !== undefined && dto.progressStatus !== 'DONE') {
      // Salir de DONE reinicia la aprobación en la misma escritura (ADR 0010, sec. 5).
      const current = await this.prisma.activity.findUniqueOrThrow({
        where: { id: activityId },
        select: { approvalStatus: true },
      });
      if (current.approvalStatus !== 'PENDING') {
        data.approvalStatus = 'PENDING';
        data.approvedById = null;
        data.approvedAt = null;
      }
    }
    await this.prisma.activity.update({ where: { id: activityId }, data });
    return this.load(activityId);
  }

  /** Registra la aprobación del tutor (solo el estado actual, P-12). PENDING la reinicia. */
  async review(user: AuthUser, activityId: string, dto: ApprovalDto): Promise<ActivityResponseDto> {
    const { access } = await this.work.activity(user, activityId);
    this.assert(can.review(access));
    const pending = dto.status === 'PENDING';
    if (!pending) {
      const current = await this.prisma.activity.findUniqueOrThrow({
        where: { id: activityId },
        select: { progressStatus: true },
      });
      if (current.progressStatus !== 'DONE') {
        throw new ConflictException('Solo se puede aprobar o rechazar una actividad con progreso Terminada (DONE).');
      }
    }
    await this.prisma.activity.update({
      where: { id: activityId },
      data: {
        approvalStatus: dto.status,
        approvedById: pending ? null : user.id,
        approvedAt: pending ? null : new Date(),
      },
    });
    return this.load(activityId);
  }

  async remove(user: AuthUser, activityId: string): Promise<void> {
    const { access } = await this.work.activity(user, activityId);
    this.assert(can.manageActivities(access));
    await this.prisma.activity.update({ where: { id: activityId }, data: { deletedAt: new Date() } });
  }

  // ─── Encargados ─────────────────────────────────────────────

  async addAssignee(user: AuthUser, activityId: string, dto: AssigneeDto): Promise<ActivityResponseDto> {
    const { access, projectId } = await this.work.activity(user, activityId);
    this.assert(can.manageActivities(access));
    await this.work.assertMember(projectId, dto.userId, ['STUDENT', 'STUDENT_LEADER'], 'userId');

    const exists = await this.prisma.activityAssignee.count({ where: { activityId, userId: dto.userId } });
    if (exists > 0) throw new ConflictException('El usuario ya es encargado de esta actividad.');
    await this.prisma.activityAssignee.create({ data: { activityId, userId: dto.userId, assignedById: user.id } });
    return this.load(activityId);
  }

  async removeAssignee(user: AuthUser, activityId: string, userId: string): Promise<ActivityResponseDto> {
    const { access } = await this.work.activity(user, activityId);
    this.assert(can.manageActivities(access));
    const { count } = await this.prisma.activityAssignee.deleteMany({ where: { activityId, userId } });
    if (count === 0) throw new NotFoundException('El usuario no es encargado de esta actividad.');
    return this.load(activityId);
  }

  // ─── Adjuntos (enlaces) ─────────────────────────────────────

  async addLink(user: AuthUser, activityId: string, dto: AttachmentLinkDto): Promise<ActivityResponseDto> {
    const { access, isAssignee } = await this.work.activity(user, activityId);
    this.assert(this.canAttach(access, isAssignee));
    await this.prisma.activityAttachment.create({
      data: { activityId, kind: 'LINK', url: dto.url, createdById: user.id },
    });
    return this.load(activityId);
  }

  async removeAttachment(user: AuthUser, activityId: string, attachmentId: string): Promise<ActivityResponseDto> {
    const { access, isAssignee } = await this.work.activity(user, activityId);
    this.assert(this.canAttach(access, isAssignee));
    const { count } = await this.prisma.activityAttachment.deleteMany({ where: { id: attachmentId, activityId } });
    if (count === 0) throw new NotFoundException('Adjunto no encontrado.');
    return this.load(activityId);
  }

  private canAttach(access: ProjectAccess, isAssignee: boolean): boolean {
    return can.manageActivities(access) || isAssignee;
  }

  private assert(allowed: boolean): void {
    this.work.projects.assert(allowed);
  }

  private async load(activityId: string): Promise<ActivityResponseDto> {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId }, include: activityInclude });
    if (!activity) throw new BadRequestException('Actividad no encontrada.');
    return toResponse(activity);
  }
}
