import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../../config/env';
import { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../auth';
import { hasStructuralFilter, type AnalyticsQuery } from '../dtos/analytics-query.dto';
import type { AnalyticsFiltersDto, AnalyticsResponseDto, AnalyticsScopeDto, NamedDto } from '../dtos/analytics-response.dto';
import { buildAnalytics, type DeanInput } from '../models/analytics-aggregation';
import { filteredBoardWhere, filteredProjectWhere, scopeProjectWhere } from '../models/analytics-scope';
import { addDays, daysBetween } from '../models/analytics-time';

const byName = (a: NamedDto, b: NamedDto) => a.name.localeCompare(b.name, 'es');
const OUT_OF_SCOPE = 'El filtro está fuera de tu alcance.';

@Injectable()
export class AnalyticsService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.timeZone = env.meetingsTimeZone;
  }

  /** Alcance del usuario: global (ADMIN) o la suma de áreas asignadas y facultades con decanato vigente. */
  async scope(user: AuthUser, now: Date = new Date()): Promise<AnalyticsScopeDto> {
    if (user.roles.includes('ADMIN')) return { global: true, areas: [], faculties: [] };
    const [areas, faculties] = await Promise.all([
      user.roles.includes('AREA_MANAGER')
        ? this.prisma.area.findMany({ where: { managers: { some: { userId: user.id } } }, select: { id: true, name: true } })
        : [],
      user.roles.includes('DEAN')
        ? this.prisma.faculty.findMany({
            where: { deans: { some: { userId: user.id, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    return { global: false, areas: areas.sort(byName), faculties: faculties.sort(byName) };
  }

  async filters(user: AuthUser, now: Date = new Date()): Promise<AnalyticsFiltersDto> {
    const scope = await this.scope(user, now);
    return { scope, ...(await this.options(scope)) };
  }

  async get(user: AuthUser, query: AnalyticsQuery, now: Date = new Date()): Promise<AnalyticsResponseDto> {
    const scope = await this.scope(user, now);
    await this.assertFilters(scope, query);

    const projectWhere = filteredProjectWhere(scope, query);
    const boardWhere = filteredBoardWhere(scope, query);
    const includeUnlinkedMeetings = scope.global && !hasStructuralFilter(query);

    const [projects, boards, activities, meetings, participants, platformUsers] = await Promise.all([
      this.prisma.project.findMany({
        where: projectWhere,
        select: {
          id: true,
          area: { select: { id: true, name: true } },
          faculties: { select: { faculty: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.board.findMany({
        where: boardWhere,
        select: { id: true, projectId: true, createdAt: true, dueDate: true, progressStatus: true, completedAt: true, responsibleTutorId: true },
      }),
      this.prisma.activity.findMany({
        where: { deletedAt: null, board: boardWhere },
        select: {
          id: true,
          boardId: true,
          createdAt: true,
          description: true,
          progressStatus: true,
          result: true,
          approvalStatus: true,
          completedAt: true,
          assignees: { select: { userId: true } },
          attachments: { select: { kind: true, createdAt: true, document: { select: { format: true, sizeBytes: true } } } },
        },
      }),
      this.prisma.meeting.findMany({
        where: this.meetingWhere(projectWhere, query, includeUnlinkedMeetings),
        select: {
          organizerId: true,
          projectId: true,
          startsAt: true,
          durationMinutes: true,
          status: true,
          recordingUrl: true,
          participants: { select: { userId: true } },
        },
      }),
      this.prisma.projectMember.findMany({
        where: { status: 'ACTIVE', project: projectWhere },
        select: { userId: true },
        distinct: ['userId'],
      }),
      scope.global && !hasStructuralFilter(query)
        ? this.prisma.user.findMany({ select: { status: true, createdAt: true, roles: { select: { role: true } } } })
        : null,
    ]);

    const tutorIds = [...new Set(boards.map((b) => b.responsibleTutorId))];
    const facultyIds = [...new Set(projects.flatMap((p) => p.faculties.map((f) => f.faculty.id)))];
    const [tutors, deanships] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: tutorIds } }, select: { id: true, fullName: true } }),
      this.prisma.facultyDean.findMany({
        where: { facultyId: { in: facultyIds }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        select: { user: { select: { id: true, fullName: true } }, faculty: { select: { id: true, name: true } } },
      }),
    ]);
    const deans = new Map<string, DeanInput>();
    for (const d of deanships) {
      const dean = deans.get(d.user.id) ?? { id: d.user.id, name: d.user.fullName, faculties: [] };
      dean.faculties.push(d.faculty);
      deans.set(d.user.id, dean);
    }

    return buildAnalytics({
      now,
      timeZone: this.timeZone,
      period: { from: query.from, to: query.to },
      scope,
      platformUsers: platformUsers?.map((u) => ({ status: u.status, createdAt: u.createdAt, roles: u.roles.map((r) => r.role) })) ?? null,
      participants: participants.length,
      projects: projects.map((p) => ({ id: p.id, area: p.area, faculties: p.faculties.map((f) => f.faculty) })),
      boards,
      activities: activities.map((a) => ({
        id: a.id,
        boardId: a.boardId,
        createdAt: a.createdAt,
        hasDescription: a.description !== null && a.description.trim().length > 0,
        progressStatus: a.progressStatus,
        result: a.result,
        approvalStatus: a.approvalStatus,
        completedAt: a.completedAt,
        assigneeIds: a.assignees.map((x) => x.userId),
        attachments: a.attachments.map((t) => ({
          kind: t.kind,
          createdAt: t.createdAt,
          format: t.document?.format ?? null,
          sizeBytes: t.document ? Number(t.document.sizeBytes) : null,
        })),
      })),
      meetings: meetings.map((m) => ({
        organizerId: m.organizerId,
        projectId: m.projectId,
        startsAt: m.startsAt,
        durationMinutes: m.durationMinutes,
        status: m.status,
        hasRecording: m.recordingUrl !== null && m.recordingUrl.length > 0,
        participantIds: m.participants.map((p) => p.userId),
      })),
      tutors: tutors.map((t) => ({ id: t.id, name: t.fullName })),
      deans: [...deans.values()],
    });
  }

  // ─── Internos ───

  /** Opciones de filtros dentro del alcance (las mismas que validan `assertFilters`). */
  private async options(scope: AnalyticsScopeDto): Promise<Omit<AnalyticsFiltersDto, 'scope'>> {
    const projects = await this.prisma.project.findMany({
      where: scopeProjectWhere(scope),
      select: {
        id: true,
        title: true,
        area: { select: { id: true, name: true } },
        faculties: { select: { faculty: { select: { id: true, name: true } } } },
        boards: { where: { deletedAt: null }, select: { responsibleTutor: { select: { id: true, fullName: true } } } },
      },
    });
    const unique = (items: NamedDto[]) => [...new Map(items.map((i) => [i.id, i])).values()].sort(byName);
    return {
      areas: unique([...scope.areas, ...projects.map((p) => p.area)]),
      faculties: unique([...scope.faculties, ...projects.flatMap((p) => p.faculties.map((f) => f.faculty))]),
      projects: unique(projects.map((p) => ({ id: p.id, name: p.title }))),
      tutors: unique(projects.flatMap((p) => p.boards.map((b) => ({ id: b.responsibleTutor.id, name: b.responsibleTutor.fullName })))),
    };
  }

  /** 404 si el recurso filtrado no existe; 403 si está fuera del alcance. */
  private async assertFilters(scope: AnalyticsScopeDto, q: AnalyticsQuery): Promise<void> {
    const [area, faculty, project, tutor] = await Promise.all([
      q.areaId ? this.prisma.area.count({ where: { id: q.areaId } }) : 1,
      q.facultyId ? this.prisma.faculty.count({ where: { id: q.facultyId } }) : 1,
      q.projectId ? this.prisma.project.count({ where: { id: q.projectId, deletedAt: null } }) : 1,
      q.tutorId ? this.prisma.user.count({ where: { id: q.tutorId } }) : 1,
    ]);
    if (area === 0) throw new NotFoundException('Área no encontrada.');
    if (faculty === 0) throw new NotFoundException('Facultad no encontrada.');
    if (project === 0) throw new NotFoundException('Proyecto no encontrado.');
    if (tutor === 0) throw new NotFoundException('Tutor no encontrado.');
    if (scope.global || (!q.areaId && !q.facultyId && !q.projectId)) return;

    const { areas, faculties, projects } = await this.options(scope);
    const has = (list: NamedDto[], id: string | null) => id === null || list.some((i) => i.id === id);
    if (!has(areas, q.areaId) || !has(faculties, q.facultyId) || !has(projects, q.projectId)) {
      throw new ForbiddenException(OUT_OF_SCOPE);
    }
  }

  /**
   * Reuniones no archivadas de los proyectos filtrados (y sin proyecto con alcance global sin filtros).
   * Con `tutorId`, solo las que organiza o a las que asiste. Se acota por fecha con margen para la comparación.
   */
  private meetingWhere(projectWhere: Prisma.ProjectWhereInput, q: AnalyticsQuery, includeUnlinked: boolean): Prisma.MeetingWhereInput {
    const and: Prisma.MeetingWhereInput[] = [
      { deletedAt: null },
      { OR: [{ project: projectWhere }, ...(includeUnlinked ? [{ projectId: null }] : [])] },
    ];
    if (q.tutorId) and.push({ OR: [{ organizerId: q.tutorId }, { participants: { some: { userId: q.tutorId } } }] });
    if (q.from !== null) {
      const length = q.to !== null ? daysBetween(q.from, q.to) + 1 : 0;
      and.push({ startsAt: { gte: new Date(`${addDays(q.from, -length - 2)}T00:00:00Z`) } });
    }
    if (q.to !== null) and.push({ startsAt: { lt: new Date(`${addDays(q.to, 2)}T00:00:00Z`) } });
    return { AND: and };
  }
}
