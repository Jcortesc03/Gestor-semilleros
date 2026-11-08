import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../../config/env';
import { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../auth';
import { DeliveryDispatcher, NotificationDeliveryService, TeamsMeetingsService } from '../../integrations';
import { hasInstitutionalAuthority, isTutor, ProjectAccessService } from '../../projects';
import type { ChangeMeetingStatusDto, CreateMeetingDto, ListMeetingsQuery, RecordingDto } from '../dtos/meeting.dto';
import { meetingSelect, toMeetingResponse, type MeetingResponseDto } from '../dtos/meeting-response.dto';
import {
  cancellationMessage,
  invitationMessage,
  REMINDER_OFFSETS,
  reminderMessage,
  teamsEventBody,
  type MeetingInfo,
} from '../models/meeting-messages';
import { canChangeStatus, meetingEndsAt, STATUS_LABELS } from '../models/meeting-status';

export const MEETING_NOT_FOUND = 'Reunión no encontrada.';
export const JOIN_URL_REQUIRED = 'Con una cuenta personal de Microsoft debes indicar el enlace de la reunión.';
export const JOIN_URL_NOT_ALLOWED = 'Con una cuenta laboral o educativa el enlace lo genera Microsoft Teams; no envíes joinUrl.';
export const FORBIDDEN_MESSAGE = 'No tienes permisos para realizar esta acción.';

type Tx = Prisma.TransactionClient;

/**
 * Reuniones con Microsoft Teams (ADR 0007): al crearla se agenda en el calendario de la cuenta
 * vinculada del organizador; los participantes reciben la invitación y recordatorios (24 h y 1 h).
 */
@Injectable()
export class MeetingsService {
  private readonly logger = new Logger('Meetings');
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
    private readonly teams: TeamsMeetingsService,
    private readonly deliveries: NotificationDeliveryService,
    private readonly dispatcher: DeliveryDispatcher,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.timeZone = env.meetingsTimeZone;
  }

  async create(user: AuthUser, dto: CreateMeetingDto): Promise<MeetingResponseDto> {
    const project = dto.projectId ? await this.assertCanScheduleFor(user, dto.projectId) : null;
    const participants = await this.loadParticipants(user, dto.participantIds, project?.id ?? null);

    // ADR 0014: el enlace lo genera Teams (cuenta laboral o educativa) o lo indica el organizador (personal).
    const accountType = await this.teams.accountTypeOf(user.id);
    if (accountType === 'WORK_OR_SCHOOL' && dto.joinUrl !== null) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: [JOIN_URL_NOT_ALLOWED] });
    }
    if (accountType === 'PERSONAL' && dto.joinUrl === null) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: [JOIN_URL_REQUIRED] });
    }

    const info: MeetingInfo = {
      reason: dto.reason,
      startsAt: dto.startsAt,
      durationMinutes: dto.durationMinutes,
      organizerName: user.fullName,
      // Con cuenta personal el enlace ya se conoce y va en el cuerpo del evento.
      joinUrl: accountType === 'PERSONAL' ? dto.joinUrl : null,
      projectTitle: project?.title ?? null,
    };

    // 1) Teams primero: si falla, no se crea nada local (409/422/502/503).
    const event = await this.teams.create(user.id, {
      subject: dto.reason,
      body: teamsEventBody(info),
      startsAt: dto.startsAt,
      durationMinutes: dto.durationMinutes,
      attendees: participants.map((p) => ({ email: p.email, name: p.fullName })),
      joinUrl: accountType === 'PERSONAL' ? dto.joinUrl : null,
    });
    info.joinUrl = event.joinUrl; // personal: es el mismo enlace del organizador

    // 2) Registro local + avisos en una transacción; si falla, se cancela el evento de Teams.
    let meetingId: string;
    try {
      meetingId = await this.prisma.$transaction(async (tx) => {
        const meeting = await tx.meeting.create({
          data: {
            organizerId: user.id,
            projectId: project?.id ?? null,
            reason: dto.reason,
            startsAt: dto.startsAt,
            durationMinutes: dto.durationMinutes,
            externalId: event.eventId,
            joinUrl: event.joinUrl,
            participants: { create: participants.map((p) => ({ userId: p.id })) },
          },
          select: { id: true },
        });
        await this.scheduleNotices(tx, meeting.id, user.id, participants.map((p) => p.id), info);
        return meeting.id;
      });
    } catch (error) {
      await this.teams.cancel(user.id, event.eventId, 'No se pudo registrar la reunión en el Gestor de Semilleros.');
      throw error;
    }

    this.dispatcher.kick();
    return this.get(user, meetingId);
  }

  async list(user: AuthUser, query: ListMeetingsQuery): Promise<MeetingResponseDto[]> {
    await this.syncStatuses();
    const rows = await this.prisma.meeting.findMany({
      where: {
        AND: [
          this.visibleWhere(user),
          ...(query.status ? [{ status: query.status }] : []),
          ...(query.from ? [{ startsAt: { gte: query.from } }] : []),
          ...(query.to ? [{ startsAt: { lte: query.to } }] : []),
        ],
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: query.limit,
      select: meetingSelect,
    });
    return rows.map(toMeetingResponse);
  }

  async get(user: AuthUser, id: string): Promise<MeetingResponseDto> {
    await this.syncStatuses();
    return toMeetingResponse(await this.findVisible(user, id));
  }

  /** Cambio manual de estado por el organizador o el administrador. */
  async changeStatus(
    user: AuthUser,
    id: string,
    dto: ChangeMeetingStatusDto,
  ): Promise<MeetingResponseDto & { teamsSynced?: boolean }> {
    await this.syncStatuses();
    const meeting = await this.findVisible(user, id);
    this.assertOrganizerOrAdmin(user, meeting.organizer.id);
    if (!canChangeStatus(meeting.status, dto.status)) {
      throw new ConflictException(
        `No se puede pasar una reunión de ${STATUS_LABELS[meeting.status]} a ${STATUS_LABELS[dto.status]}.`,
      );
    }

    if (dto.status !== 'CANCELLED') {
      await this.prisma.meeting.update({ where: { id }, data: { status: dto.status } });
      return this.get(user, id);
    }

    // Cancelación: en Teams (avisa a los invitados en su calendario), recordatorios fuera y aviso propio.
    const teamsSynced = meeting.externalId
      ? await this.teams.cancel(meeting.organizer.id, meeting.externalId, dto.comment ?? 'Reunión cancelada.')
      : true;
    const info = this.infoOf(meeting);
    await this.prisma.$transaction(async (tx) => {
      await tx.meeting.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      await this.deliveries.cancel({ meetingId: id }, 'Reunión cancelada.', tx);
      const { subject, body } = cancellationMessage(info, this.timeZone, dto.comment);
      await this.deliveries.enqueue(
        {
          source: { meetingId: id, purpose: 'MEETING_CANCELLATION' },
          kind: 'MEETING',
          subject,
          body,
          recipientIds: meeting.participants.map((p) => p.user.id),
          expiresAt: meetingEndsAt(meeting.startsAt, meeting.durationMinutes),
        },
        tx,
      );
    });
    this.dispatcher.kick();
    if (!teamsSynced) this.logger.warn(`La reunión ${id} se canceló localmente, pero no en Teams.`);
    return { ...(await this.get(user, id)), teamsSynced };
  }

  /** Enlace de evidencia de la grabación (opcional; null lo borra). */
  async setRecording(user: AuthUser, id: string, dto: RecordingDto): Promise<MeetingResponseDto> {
    const meeting = await this.findVisible(user, id);
    this.assertOrganizerOrAdmin(user, meeting.organizer.id);
    if (meeting.status === 'CANCELLED') {
      throw new ConflictException('No se puede registrar la grabación de una reunión cancelada.');
    }
    await this.prisma.meeting.update({ where: { id }, data: { recordingUrl: dto.recordingUrl } });
    return this.get(user, id);
  }

  /**
   * Aplica los cambios automáticos por horario (programada → en proceso → finalizada).
   * Se ejecuta antes de cada lectura; es una sola consulta por transición sobre filas indexadas.
   */
  async syncStatuses(): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE meetings SET status = 'FINISHED', updated_at = now()
      WHERE status IN ('SCHEDULED', 'IN_PROGRESS') AND deleted_at IS NULL
        AND starts_at + make_interval(mins => duration_minutes) <= now()`;
    await this.prisma.$executeRaw`
      UPDATE meetings SET status = 'IN_PROGRESS', updated_at = now()
      WHERE status = 'SCHEDULED' AND deleted_at IS NULL AND starts_at <= now()`;
  }

  // ─── Reglas ──────────────────────────────────────────────────────────────

  /**
   * RN-73 y ADR 0010 §10: agenda reuniones de un proyecto el administrador, un tutor activo,
   * el decano vigente de una facultad del proyecto o el encargado de su área.
   */
  private async assertCanScheduleFor(user: AuthUser, projectId: string): Promise<{ id: string; title: string }> {
    const access = await this.projectAccess.resolve(user, projectId);
    if (!access.isAdmin && !isTutor(access) && !hasInstitutionalAuthority(access)) throw new ForbiddenException(FORBIDDEN_MESSAGE);
    return this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true, title: true } });
  }

  /** Participantes activos (sin el organizador); con proyecto, deben ser miembros activos de él (P-18). */
  private async loadParticipants(user: AuthUser, ids: readonly string[], projectId: string | null) {
    const wanted = ids.filter((id) => id !== user.id);
    if (wanted.length === 0) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: ['Indica al menos un participante distinto del organizador.'] });
    }
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: wanted },
        status: 'ACTIVE',
        ...(projectId ? { memberships: { some: { projectId, status: 'ACTIVE' } } } : {}),
      },
      select: { id: true, fullName: true, email: true },
    });
    if (users.length !== wanted.length) {
      const error = projectId
        ? 'Todos los participantes deben ser usuarios activos y miembros activos del proyecto.'
        : 'Alguno de los participantes no existe o no está activo.';
      throw new BadRequestException({ message: 'Datos inválidos.', errors: [error] });
    }
    return wanted.map((id) => users.find((u) => u.id === id)!);
  }

  /** Invitación ya y recordatorios 24 h y 1 h antes (los que aún estén en el futuro). */
  private async scheduleNotices(tx: Tx, meetingId: string, organizerId: string, participantIds: string[], info: MeetingInfo) {
    const invitation = invitationMessage(info, this.timeZone);
    await this.deliveries.enqueue(
      {
        source: { meetingId, purpose: 'MEETING_INVITATION' },
        kind: 'MEETING',
        ...invitation,
        recipientIds: participantIds,
        expiresAt: info.startsAt,
      },
      tx,
    );
    for (const { minutes, label } of REMINDER_OFFSETS) {
      const scheduledFor = new Date(info.startsAt.getTime() - minutes * 60_000);
      if (scheduledFor <= new Date()) continue;
      await this.deliveries.enqueue(
        {
          source: { meetingId, purpose: 'MEETING_REMINDER' },
          kind: 'MEETING',
          ...reminderMessage(info, this.timeZone, label),
          recipientIds: [...participantIds, organizerId],
          scheduledFor,
          expiresAt: info.startsAt,
        },
        tx,
      );
    }
  }

  private visibleWhere(user: AuthUser): Prisma.MeetingWhereInput {
    if (user.roles.includes('ADMIN')) return { deletedAt: null };
    return {
      deletedAt: null,
      OR: [{ organizerId: user.id }, { participants: { some: { userId: user.id } } }],
      // Las reuniones de proyectos eliminados quedan ocultas con ellos (RN de eliminación lógica).
      AND: [{ OR: [{ projectId: null }, { project: { deletedAt: null } }] }],
    };
  }

  private async findVisible(user: AuthUser, id: string) {
    const row = await this.prisma.meeting.findFirst({ where: { AND: [this.visibleWhere(user), { id }] }, select: meetingSelect });
    if (!row) throw new NotFoundException(MEETING_NOT_FOUND);
    return row;
  }

  private assertOrganizerOrAdmin(user: AuthUser, organizerId: string): void {
    if (organizerId !== user.id && !user.roles.includes('ADMIN')) throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }

  private infoOf(meeting: Awaited<ReturnType<MeetingsService['findVisible']>>): MeetingInfo {
    return {
      reason: meeting.reason,
      startsAt: meeting.startsAt,
      durationMinutes: meeting.durationMinutes,
      organizerName: meeting.organizer.fullName,
      joinUrl: meeting.joinUrl,
      projectTitle: meeting.project?.title ?? null,
    };
  }
}
