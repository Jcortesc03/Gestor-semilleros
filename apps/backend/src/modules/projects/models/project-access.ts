import type { ProjectRole } from '../../../generated/prisma/enums';

/**
 * Relación del usuario actual con un proyecto. Se calcula en cada petición
 * (ProjectAccessService) y determina los permisos (docs/domain/roles-permissions.md).
 */
export interface ProjectAccess {
  projectId: string;
  userId: string;
  /** Administrador: acceso total a los proyectos (soporte). */
  isAdmin: boolean;
  /** Decano vigente de al menos una facultad del proyecto. */
  isDean: boolean;
  /** Rol de proyecto si el usuario es participante activo. */
  role: ProjectRole | null;
}

export const isTutor = (a: ProjectAccess) => a.role === 'TUTOR';
export const isLeader = (a: ProjectAccess) => a.role === 'STUDENT_LEADER';

/** Reglas de permisos por proyecto, en un solo lugar. */
export const can = {
  /** Modificar o eliminar el proyecto. */
  manageProject: (a: ProjectAccess) => a.isAdmin || a.isDean,
  /** Asignar, retirar o marcar como principal a los tutores. */
  manageTutors: (a: ProjectAccess) => a.isAdmin || a.isDean,
  /** Añadir o retirar estudiantes y elegir al líder. */
  manageStudents: (a: ProjectAccess) => a.isAdmin || a.isDean || isTutor(a),
  /** Crear, modificar y eliminar tableros (P-09). */
  manageBoards: (a: ProjectAccess) => a.isAdmin || isTutor(a),
  /** Crear, editar y eliminar actividades y gestionar sus encargados (P-09, RN-47). */
  manageActivities: (a: ProjectAccess) => a.isAdmin || isTutor(a) || isLeader(a),
  /** Aprobar o rechazar actividades y fijar su resultado (RN-49). */
  review: (a: ProjectAccess) => a.isAdmin || isTutor(a),
};
