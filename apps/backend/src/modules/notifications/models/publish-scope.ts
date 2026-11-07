import type { AnnouncementKind } from '../../../generated/prisma/enums';
import type { AudienceDto } from '../dtos/announcement.dto';

/** Lo que el autor puede alcanzar al publicar, calculado desde sus roles y cargos vigentes. */
export interface PublishScope {
  isAdmin: boolean;
  isAreaManager: boolean;
  isDean: boolean;
  managedAreaIds: readonly string[];
  deanFacultyIds: readonly string[];
  /** Proyectos (no eliminados) con alguna facultad del decano. */
  deanProjectIds: readonly string[];
}

/**
 * RN-51: el encargado de área publica para todos o para roles (y para sus áreas, 🟡).
 * RN-52: el decano publica para sus facultades o para proyectos de sus facultades (🟡).
 * El administrador puede publicar en cualquier audiencia (supuesto: acceso total, ADR 0005).
 */
export function canPublishTo(scope: PublishScope, audience: AudienceDto): boolean {
  if (scope.isAdmin) return true;
  switch (audience.type) {
    case 'ALL':
    case 'ROLE':
      return scope.isAreaManager;
    case 'AREA':
      return scope.isAreaManager && scope.managedAreaIds.includes(audience.areaId);
    case 'FACULTY':
      return scope.isDean && scope.deanFacultyIds.includes(audience.facultyId);
    case 'PROJECT':
      return scope.isDean && scope.deanProjectIds.includes(audience.projectId);
  }
}

/** Matriz de permisos: solo el decano (y el administrador) envían el tipo NOTIFICATION (P-16). */
export function canPublishKind(scope: PublishScope, kind: AnnouncementKind): boolean {
  if (scope.isAdmin) return true;
  if (kind === 'NOTIFICATION') return scope.isDean;
  return scope.isDean || scope.isAreaManager;
}
