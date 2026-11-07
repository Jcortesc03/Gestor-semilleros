import type { ApprovalStatus, ProgressStatus, ProjectRole, ProjectStatus, ResultStatus } from './api.ts';

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: 'Activo',
  FINISHED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  TUTOR: 'Tutor',
  STUDENT: 'Estudiante',
  STUDENT_LEADER: 'Líder estudiante',
};

export const PROGRESS_LABELS: Record<ProgressStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  DONE: 'Hecha',
  CANCELLED: 'Cancelada',
};

export const RESULT_LABELS: Record<ResultStatus, string> = {
  SUCCESS: 'Exitoso',
  FAILURE: 'Fallido',
};

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  PENDING: 'Sin revisar',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
};
