import type { CurrentUser } from '../../types/auth.ts';
import type { Member } from './api.ts';

/**
 * Permisos de presentación derivados de docs/api/projects.md y boards.md.
 * Solo ocultan controles: el backend vuelve a validar cada acción.
 * `isDean` se basa en el rol global; el backend exige además ser decano vigente de una facultad del proyecto.
 */
export interface AcademicPermissions {
  manageProject: boolean;
  manageTutors: boolean;
  manageStudents: boolean;
  manageBoards: boolean;
  manageActivities: boolean;
  review: boolean;
}

export function resolvePermissions(user: CurrentUser, members: Member[]): AcademicPermissions {
  const isAdmin = user.roles.includes('ADMIN');
  const isDean = user.roles.includes('DEAN');
  const own = members.find((item) => item.user.id === user.id && item.status === 'ACTIVE');
  const isTutor = own?.projectRole === 'TUTOR';
  const isLeader = own?.projectRole === 'STUDENT_LEADER';
  return {
    manageProject: isAdmin || isDean,
    manageTutors: isAdmin || isDean,
    manageStudents: isAdmin || isDean || isTutor,
    manageBoards: isAdmin || isTutor,
    manageActivities: isAdmin || isTutor || isLeader,
    review: isAdmin || isTutor,
  };
}

export const canCreateProject = (user: CurrentUser) => user.roles.includes('ADMIN') || user.roles.includes('DEAN');
