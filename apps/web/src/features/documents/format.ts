import type { DocumentFormat } from './api.ts';

export const DOCUMENT_FORMAT_LABELS: Record<DocumentFormat, string> = {
  PDF: 'PDF',
  WORD: 'Word',
  EXCEL: 'Excel',
  IMAGE: 'Imagen',
};

/** Tamaño legible en español: «512 B», «183 KB», «24,5 MB». */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Tamaño no disponible';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value < 10 ? 1 : 0;
  return `${new Intl.NumberFormat('es', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}

/** Fecha y hora cortas para la lista de documentos. */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
