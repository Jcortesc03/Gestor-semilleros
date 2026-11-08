import type { CurrentUser } from '../../types/auth.ts';
import type { Member } from './api.ts';

/**
 * Permisos de presentación derivados de docs/api/projects.md, boards.md y ADR 0010.
 * Solo ocultan controles: el backend vuelve a validar cada acción.
 * `isDean` y `isAreaManager` se basan en el rol global; el backend exige además que el decano
 * sea vigente de una facultad del proyecto y que el encargado tenga asignada su área. La web no
 * conoce esas asignaciones, así que muestra los controles y deja que el servidor responda `403`.
 */
export interface AcademicPermissions {
  manageProject: boolean;
  manageTutors: boolean;
  manageStudents: boolean;
  manageBoards: boolean;
  manageActivities: boolean;
  review: boolean;
  /** Eliminar documentos de cualquier autor: tutor activo del proyecto o quien gestiona (`docs/api/documents.md`). */
  deleteAnyDocument: boolean;
}

export function resolvePermissions(user: CurrentUser, members: Member[]): AcademicPermissions {
  const isAdmin = user.roles.includes('ADMIN');
  const isDean = user.roles.includes('DEAN');
  const isAreaManager = user.roles.includes('AREA_MANAGER');
  const own = members.find((item) => item.user.id === user.id && item.status === 'ACTIVE');
  const isTutor = own?.projectRole === 'TUTOR';
  const isLeader = own?.projectRole === 'STUDENT_LEADER';
  // ADR 0010 sec. 2-4: el encargado de área tiene los mismos permisos que el decano; los roles se suman.
  const isProjectAuthority = isAdmin || isDean || isAreaManager;
  return {
    manageProject: isProjectAuthority,
    manageTutors: isProjectAuthority,
    manageStudents: isProjectAuthority || isTutor,
    manageBoards: isAdmin || isTutor,
    manageActivities: isAdmin || isTutor || isLeader,
    review: isAdmin || isTutor,
    deleteAnyDocument: isProjectAuthority || isTutor,
  };
}

export const canCreateProject = (user: CurrentUser) =>
  user.roles.includes('ADMIN') || user.roles.includes('DEAN') || user.roles.includes('AREA_MANAGER');
