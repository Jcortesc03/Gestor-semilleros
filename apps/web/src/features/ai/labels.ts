import type { AiDepth, AiFocus, AiStyle, Horizon, OverallStatus, Priority } from './api.ts';

/** Etiquetas en español del contrato del módulo de IA. */
export const FOCUS_LABELS: Record<AiFocus, string> = {
  GENERAL: 'General',
  ACTIVITIES: 'Actividades',
  DEADLINES: 'Plazos y vencimientos',
  PARTICIPATION: 'Participación',
  MEETINGS: 'Reuniones',
  TUTORS: 'Tutores',
  UNITS: 'Áreas y facultades',
  PATTERNS: 'Patrones',
  ATTACHMENTS: 'Evidencias y adjuntos',
  TRENDS: 'Tendencias',
};

export const DEPTH_LABELS: Record<AiDepth, string> = { BRIEF: 'Breve', STANDARD: 'Estándar', DETAILED: 'Detallado' };
export const STYLE_LABELS: Record<AiStyle, string> = { EXECUTIVE: 'Ejecutivo', OPERATIONAL: 'Operativo', ACADEMIC: 'Académico' };
export const STATUS_LABELS: Record<OverallStatus, string> = { GOOD: 'Estado bueno', ATTENTION: 'Requiere atención', CRITICAL: 'Estado crítico' };
export const PRIORITY_LABELS: Record<Priority, string> = { HIGH: 'Prioridad alta', MEDIUM: 'Prioridad media', LOW: 'Prioridad baja' };
export const SEVERITY_LABELS: Record<Priority, string> = { HIGH: 'Severidad alta', MEDIUM: 'Severidad media', LOW: 'Severidad baja' };
export const HORIZON_LABELS: Record<Horizon, string> = {
  IMMEDIATE: 'Inmediato',
  SHORT_TERM: 'Corto plazo',
  MEDIUM_TERM: 'Mediano plazo',
};

const PRIORITY_ORDER: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** Orden estable por prioridad (alta primero) sin mutar el arreglo original. */
export function sortByPriority<T extends { priority: Priority }>(items: readonly T[]): T[] {
  return items
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => PRIORITY_ORDER[a.entry.priority] - PRIORITY_ORDER[b.entry.priority] || a.index - b.index)
    .map(({ entry }) => entry);
}

/** Porcentaje ahorrado al comprimir: `1 - chars / sourceChars`; `null` si no hay base. */
export function savedPercent(chars: number, sourceChars: number): number | null {
  if (sourceChars <= 0) return null;
  return Math.max(0, Math.round((1 - chars / sourceChars) * 100));
}
