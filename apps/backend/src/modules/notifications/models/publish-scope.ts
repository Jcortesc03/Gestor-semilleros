import type { AnnouncementKind } from '../../../generated/prisma/enums';
import type { AudienceDto } from '../dtos/announcement.dto';

/** Lo que el autor puede alcanzar al publicar, calculado desde sus roles y cargos vigentes. */
export interface PublishScope {
  isAdmin: boolean;
  isAreaManager: boolean;
  isDean: boolean;
  isTutor: boolean;
  managedAreaIds: readonly string[];
  deanFacultyIds: readonly string[];
  /** Proyectos (no eliminados) con alguna facultad del decano. */
  deanProjectIds: readonly string[];
  /** Proyectos (no eliminados) donde el usuario es tutor activo. */
  tutorProjectIds: readonly string[];
}

/**
 * Audiencias permitidas por rol (ADR 0010, sección 8). Los roles se suman (P-02).
 * - Administrador: cualquier audiencia.
 * - Encargado de área: `AREA` de sus áreas asignadas y `ROLE` (cualquier rol global); no `ALL`
 *   (enmienda 2026-11-07, sección 9).
 * - Decano: `FACULTY` de sus facultades y `PROJECT` de proyectos de sus facultades.
 * - Tutor: solo `PROJECT` de los proyectos donde es tutor activo.
 */
export function canPublishTo(scope: PublishScope, audience: AudienceDto): boolean {
  if (scope.isAdmin) return true;
  switch (audience.type) {
    case 'AREA':
      return scope.isAreaManager && scope.managedAreaIds.includes(audience.areaId);
    case 'ROLE':
      return scope.isAreaManager;
    case 'FACULTY':
      return scope.isDean && scope.deanFacultyIds.includes(audience.facultyId);
    case 'PROJECT':
      return (
        (scope.isDean && scope.deanProjectIds.includes(audience.projectId)) ||
        (scope.isTutor && scope.tutorProjectIds.includes(audience.projectId))
      );
    case 'ALL':
      return false;
  }
}

/**
 * Tipos de novedad (ADR 0010, sección 8; P-16 y RN-93): `NOTIFICATION` solo lo envían
 * el decano y el administrador; el tutor y el encargado de área publican los demás tipos.
 */
export function canPublishKind(scope: PublishScope, kind: AnnouncementKind): boolean {
  if (scope.isAdmin) return true;
  if (kind === 'NOTIFICATION') return scope.isDean;
  return scope.isDean || scope.isAreaManager || scope.isTutor;
}
