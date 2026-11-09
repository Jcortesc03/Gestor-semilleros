import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../auth';
import type { AudienceDto } from '../dtos/announcement.dto';
import type { PublishScope } from '../models/publish-scope';

const activeProject = { deletedAt: null } as const;

/**
 * Pertenencia a audiencias (RN-53, RN-54), calculada al consultar:
 * - FACULTY: decanos vigentes de la facultad y participantes activos de sus proyectos.
 * - AREA: encargados del área y participantes activos de sus proyectos.
 * - PROJECT: participantes activos del proyecto.
 * Se usa la misma definición para el feed y para los destinatarios de las copias.
 */
@Injectable()
export class AudienceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Alcance para publicar (ADR 0010): cargos vigentes del usuario. Los proyectos
   * eliminados (`deletedAt`) no cuentan ni para el decano ni para el tutor.
   */
  async publishScope(user: AuthUser): Promise<PublishScope> {
    const isDean = user.roles.includes('DEAN');
    const isAreaManager = user.roles.includes('AREA_MANAGER');
    const isTutor = user.roles.includes('TUTOR');
    const deanFacultyIds = isDean
      ? (await this.prisma.facultyDean.findMany({ where: { userId: user.id, endsAt: null }, select: { facultyId: true } })).map(
          (d) => d.facultyId,
        )
      : [];
    const managedAreaIds = isAreaManager
      ? (await this.prisma.areaManager.findMany({ where: { userId: user.id }, select: { areaId: true } })).map((a) => a.areaId)
      : [];
    const deanProjectIds =
      deanFacultyIds.length > 0
        ? (
            await this.prisma.project.findMany({
              where: { ...activeProject, faculties: { some: { facultyId: { in: deanFacultyIds } } } },
              select: { id: true },
            })
          ).map((p) => p.id)
        : [];
    const tutorProjectIds = isTutor
      ? (
          await this.prisma.projectMember.findMany({
            where: { userId: user.id, status: 'ACTIVE', projectRole: 'TUTOR', project: activeProject },
            select: { projectId: true },
          })
        ).map((m) => m.projectId)
      : [];
    return {
      isAdmin: user.roles.includes('ADMIN'),
      isAreaManager,
      isDean,
      isTutor,
      managedAreaIds,
      deanFacultyIds,
      deanProjectIds,
      tutorProjectIds,
    };
  }

  /** Filtro de las novedades que el usuario puede ver: las de sus audiencias y las suyas. */
  async visibleWhere(user: AuthUser): Promise<Prisma.AnnouncementWhereInput> {
    const base: Prisma.AnnouncementWhereInput = { deletedAt: null };
    if (user.roles.includes('ADMIN')) return base;

    const [memberships, deanships, managed] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { userId: user.id, status: 'ACTIVE', project: activeProject },
        select: { projectId: true, project: { select: { areaId: true, faculties: { select: { facultyId: true } } } } },
      }),
      this.prisma.facultyDean.findMany({ where: { userId: user.id, endsAt: null }, select: { facultyId: true } }),
      this.prisma.areaManager.findMany({ where: { userId: user.id }, select: { areaId: true } }),
    ]);
    const projectIds = memberships.map((m) => m.projectId);
    const facultyIds = [
      ...new Set([...deanships.map((d) => d.facultyId), ...memberships.flatMap((m) => m.project.faculties.map((f) => f.facultyId))]),
    ];
    const areaIds = [...new Set([...managed.map((a) => a.areaId), ...memberships.map((m) => m.project.areaId)])];

    return {
      ...base,
      OR: [
        { authorId: user.id },
        {
          audiences: {
            some: {
              OR: [
                { audienceType: 'ALL' },
                { audienceType: 'ROLE', role: { in: user.roles } },
                { audienceType: 'FACULTY', facultyId: { in: facultyIds } },
                { audienceType: 'AREA', areaId: { in: areaIds } },
                { audienceType: 'PROJECT', projectId: { in: projectIds } },
              ],
            },
          },
        },
      ],
    };
  }

  /** Usuarios activos que pertenecen a al menos una de las audiencias (unión, RN-53). */
  async recipientIds(audiences: readonly AudienceDto[]): Promise<string[]> {
    if (audiences.some((a) => a.type === 'ALL')) {
      return (await this.prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })).map((u) => u.id);
    }
    const conditions: Prisma.UserWhereInput[] = audiences.map((audience) => {
      switch (audience.type) {
        case 'ALL':
          return {}; // No se alcanza: ALL se resuelve arriba (Prisma no trata `OR: [{}]` como "todos").
        case 'ROLE':
          return { roles: { some: { role: audience.role } } };
        case 'PROJECT':
          return { memberships: { some: { status: 'ACTIVE', projectId: audience.projectId, project: activeProject } } };
        case 'FACULTY':
          return {
            OR: [
              { deanships: { some: { facultyId: audience.facultyId, endsAt: null } } },
              {
                memberships: {
                  some: {
                    status: 'ACTIVE',
                    project: { ...activeProject, faculties: { some: { facultyId: audience.facultyId } } },
                  },
                },
              },
            ],
          };
        case 'AREA':
          return {
            OR: [
              { managedAreas: { some: { areaId: audience.areaId } } },
              { memberships: { some: { status: 'ACTIVE', project: { ...activeProject, areaId: audience.areaId } } } },
            ],
          };
      }
    });
    if (conditions.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', OR: conditions },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
}
