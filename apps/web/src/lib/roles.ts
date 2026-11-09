export const GLOBAL_ROLES = ['ADMIN', 'AREA_MANAGER', 'DEAN', 'TUTOR', 'STUDENT'] as const;
export type GlobalRole = typeof GLOBAL_ROLES[number];

/** Etiquetas de presentación; los permisos se aplican exclusivamente en el backend. */
export const ROLE_LABELS: Record<GlobalRole, string> = {
  ADMIN: 'Administrador',
  AREA_MANAGER: 'Encargado de área',
  DEAN: 'Decano',
  TUTOR: 'Tutor',
  STUDENT: 'Estudiante',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role as GlobalRole] ?? role;
}
