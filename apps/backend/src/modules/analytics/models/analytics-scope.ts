import type { Prisma, Role } from '../../../generated/prisma/client';
import type { AnalyticsQuery } from '../dtos/analytics-query.dto';
import type { AnalyticsScopeDto } from '../dtos/analytics-response.dto';

/** Roles globales con acceso a la analítica (ADR 0016). */
export const ANALYTICS_ROLES = ['ADMIN', 'AREA_MANAGER', 'DEAN'] as const satisfies readonly Role[];

/**
 * Proyectos visibles según el alcance: todos con alcance global; si no, la unión de las
 * áreas asignadas y las facultades con decanato vigente (P-02: los roles se suman).
 */
export function scopeProjectWhere(scope: AnalyticsScopeDto): Prisma.ProjectWhereInput {
  if (scope.global) return { deletedAt: null };
  return {
    deletedAt: null,
    OR: [
      { areaId: { in: scope.areas.map((a) => a.id) } },
      { faculties: { some: { facultyId: { in: scope.faculties.map((f) => f.id) } } } },
    ],
  };
}

/** Proyectos analizados: alcance ∩ filtros estructurales. */
export function filteredProjectWhere(scope: AnalyticsScopeDto, q: AnalyticsQuery): Prisma.ProjectWhereInput {
  const and: Prisma.ProjectWhereInput[] = [scopeProjectWhere(scope)];
  if (q.areaId) and.push({ areaId: q.areaId });
  if (q.facultyId) and.push({ faculties: { some: { facultyId: q.facultyId } } });
  if (q.projectId) and.push({ id: q.projectId });
  if (q.projectStatus) and.push({ status: q.projectStatus });
  if (q.tutorId) and.push({ boards: { some: { deletedAt: null, responsibleTutorId: q.tutorId } } });
  return { AND: and };
}

/** Tableros analizados: no archivados, de los proyectos filtrados y, si se pidió, del tutor. */
export function filteredBoardWhere(scope: AnalyticsScopeDto, q: AnalyticsQuery): Prisma.BoardWhereInput {
  return {
    deletedAt: null,
    project: filteredProjectWhere(scope, q),
    ...(q.tutorId ? { responsibleTutorId: q.tutorId } : {}),
  };
}
