import type {
  ApprovalState,
  AttachmentKind,
  DocumentFormat,
  MeetingStatus,
  PatternDimension,
  ProgressState,
  ProjectStatus,
  ResultState,
  UserRole,
} from './api.ts';

/** Etiquetas en español del contrato de `docs/api/analytics.md`. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: 'Activo',
  FINISHED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

export const PROGRESS_LABELS: Record<ProgressState, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  DONE: 'Hecha',
  CANCELLED: 'Cancelada',
};

export const RESULT_LABELS: Record<ResultState, string> = {
  SUCCESS: 'Exitoso',
  FAILURE: 'Fallido',
  NONE: 'Sin resultado',
};

export const APPROVAL_LABELS: Record<ApprovalState, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
};

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  SCHEDULED: 'Programada',
  IN_PROGRESS: 'En curso',
  FINISHED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  LINK: 'Enlace',
  DOCUMENT: 'Documento',
};

export const DOCUMENT_FORMAT_LABELS: Record<DocumentFormat, string> = {
  PDF: 'PDF',
  WORD: 'Word',
  EXCEL: 'Excel',
  IMAGE: 'Imagen',
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administradores',
  AREA_MANAGER: 'Encargados de área',
  DEAN: 'Decanos',
  TUTOR: 'Tutores',
  STUDENT: 'Estudiantes',
};

export const PATTERN_DIMENSION_LABELS: Record<PatternDimension, string> = {
  ASSIGNEES: 'Encargados',
  ATTACHMENTS: 'Adjuntos',
  DESCRIPTION: 'Descripción',
  LEAD_TIME: 'Tiempo de anticipación',
  BOARD_SIZE: 'Tamaño del tablero',
};

export const PATTERN_DIMENSION_HELP: Record<PatternDimension, string> = {
  ASSIGNEES: 'Según cuántos encargados tiene cada actividad.',
  ATTACHMENTS: 'Según si la actividad tiene enlaces o documentos adjuntos.',
  DESCRIPTION: 'Según si la actividad tiene descripción.',
  LEAD_TIME: 'Según los días entre la creación de la actividad y el vencimiento de su tablero.',
  BOARD_SIZE: 'Según cuántas actividades tiene el tablero de cada actividad.',
};

export const ASSIGNEE_BUCKET_LABELS: Record<string, string> = {
  '0': 'Sin encargados',
  '1': '1 encargado',
  '2': '2 encargados',
  '3+': '3 o más encargados',
};

export const ATTACHMENT_BUCKET_LABELS: Record<string, string> = {
  NONE: 'Sin adjuntos',
  LINK_ONLY: 'Solo enlaces',
  DOCUMENT_ONLY: 'Solo documentos',
  BOTH: 'Enlaces y documentos',
};

export const DESCRIPTION_BUCKET_LABELS: Record<string, string> = {
  WITH: 'Con descripción',
  WITHOUT: 'Sin descripción',
};

export const LEAD_TIME_BUCKET_LABELS: Record<string, string> = {
  LT_7: 'Menos de 7 días',
  D7_30: 'Entre 7 y 30 días',
  GT_30: 'Más de 30 días',
  PAST: 'Creada ya vencida',
};

export const BOARD_SIZE_BUCKET_LABELS: Record<string, string> = {
  S_1_5: '1 a 5 actividades',
  M_6_15: '6 a 15 actividades',
  L_16_PLUS: '16 o más actividades',
};

export const PATTERN_BUCKET_LABELS: Record<PatternDimension, Record<string, string>> = {
  ASSIGNEES: ASSIGNEE_BUCKET_LABELS,
  ATTACHMENTS: ATTACHMENT_BUCKET_LABELS,
  DESCRIPTION: DESCRIPTION_BUCKET_LABELS,
  LEAD_TIME: LEAD_TIME_BUCKET_LABELS,
  BOARD_SIZE: BOARD_SIZE_BUCKET_LABELS,
};

/** Etiqueta de un grupo de patrón; si la clave no se conoce, se muestra tal cual. */
export function bucketLabel(dimension: PatternDimension, key: string): string {
  return PATTERN_BUCKET_LABELS[dimension][key] ?? key;
}

const numberFormat = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });
const oneDecimalFormat = new Intl.NumberFormat('es', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Tasa 0..1 como «75,0 %»; `null` (denominador 0) se muestra como «—». */
export function formatRate(value: number | null): string {
  if (value === null) return '—';
  return `${oneDecimalFormat.format(value * 100)} %`;
}

/** Número entero con separador de miles en español («1.234»). */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** Decimal con 1 cifra («6,4») o «—» si no hay valor. */
export function formatDecimal(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('es', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** Tamaño en bytes legible («1,5 KB»); 0 se muestra como «0 B». */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const exponent = Math.min(
    BYTE_UNITS.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const scaled = bytes / 1024 ** exponent;
  return `${formatDecimal(scaled, scaled >= 10 ? 0 : 1)} ${BYTE_UNITS[exponent]}`;
}

const dateFormat = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Fecha `YYYY-MM-DD` legible en español; si es inválida, se devuelve tal cual. */
export function formatDateInput(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}

/** «1 ago 2026 – 8 nov 2026», «Desde …», «Hasta …» o «Todo el periodo». */
export function formatDateRange(from: string | null, to: string | null): string {
  if (from && to) return `${formatDateInput(from)} – ${formatDateInput(to)}`;
  if (from) return `Desde ${formatDateInput(from)}`;
  if (to) return `Hasta ${formatDateInput(to)}`;
  return 'Todo el periodo';
}

const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

/** Día ISO (1 lunes … 7 domingo) en español; fuera de rango, «—». */
export function weekdayLabel(day: number): string {
  return WEEKDAY_LABELS[day - 1] ?? '—';
}

/** «2026-10» → «oct 2026». */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  if (!year || !m || m < 1 || m > 12) return month;
  const label = new Intl.DateTimeFormat('es', { month: 'short', year: 'numeric' }).format(
    new Date(Date.UTC(year, m - 1, 1)),
  );
  return label.toLowerCase();
}

/** Fecha local como `YYYY-MM-DD` (sin depender de la zona UTC). */
export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
