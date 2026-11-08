import type { DocumentFormat } from '../../../generated/prisma/enums';

/** Tamaño máximo por archivo (RN-64). */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_FILE_NAME_LENGTH = 255;

type SignatureKind = 'PDF' | 'OLE' | 'ZIP' | 'PNG' | 'JPEG' | 'WEBP';

interface FileTypeSpec {
  format: DocumentFormat;
  mimeType: string;
  signature: SignatureKind;
}

/** Extensiones admitidas (en minúsculas) con su formato, tipo MIME y firma esperada. */
const FILE_TYPES: Record<string, FileTypeSpec> = {
  pdf: { format: 'PDF', mimeType: 'application/pdf', signature: 'PDF' },
  doc: { format: 'WORD', mimeType: 'application/msword', signature: 'OLE' },
  docx: {
    format: 'WORD',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    signature: 'ZIP',
  },
  xls: { format: 'EXCEL', mimeType: 'application/vnd.ms-excel', signature: 'OLE' },
  xlsx: {
    format: 'EXCEL',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    signature: 'ZIP',
  },
  png: { format: 'IMAGE', mimeType: 'image/png', signature: 'PNG' },
  jpg: { format: 'IMAGE', mimeType: 'image/jpeg', signature: 'JPEG' },
  jpeg: { format: 'IMAGE', mimeType: 'image/jpeg', signature: 'JPEG' },
  webp: { format: 'IMAGE', mimeType: 'image/webp', signature: 'WEBP' },
};

export const UNSUPPORTED_FORMAT_ERROR =
  'Formato no admitido. Use .pdf, .doc, .docx, .xls, .xlsx, .png, .jpg, .jpeg o .webp.';
export const CONTENT_MISMATCH_ERROR = 'El contenido del archivo no corresponde a su tipo.';

const hasPrefix = (data: Buffer, bytes: number[], offset = 0): boolean =>
  data.length >= offset + bytes.length && bytes.every((b, i) => data[offset + i] === b);

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

const SIGNATURES: Record<SignatureKind, (data: Buffer) => boolean> = {
  PDF: (d) => hasPrefix(d, ascii('%PDF-')),
  OLE: (d) => hasPrefix(d, [0xd0, 0xcf, 0x11, 0xe0]),
  ZIP: (d) => hasPrefix(d, [0x50, 0x4b, 0x03, 0x04]),
  PNG: (d) => hasPrefix(d, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  JPEG: (d) => hasPrefix(d, [0xff, 0xd8, 0xff]),
  WEBP: (d) => hasPrefix(d, ascii('RIFF')) && hasPrefix(d, ascii('WEBP'), 8),
};

/**
 * Deja solo el nombre del archivo: sin rutas, sin caracteres de control y con
 * un máximo de 255 caracteres (conservando la extensión). Devuelve '' si no queda nada.
 */
export function sanitizeFileName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const base = (raw.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (base === '' || base === '.' || base === '..') return '';
  if (base.length <= MAX_FILE_NAME_LENGTH) return base;
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 && base.length - dot <= 10 ? base.slice(dot) : '';
  return base.slice(0, MAX_FILE_NAME_LENGTH - ext.length) + ext;
}

export type FileInspection =
  | { ok: true; format: DocumentFormat; mimeType: string }
  | { ok: false; error: string };

/** Comprueba la extensión del nombre y que la firma de los primeros bytes corresponda a ella. */
export function inspectFile(fileName: string, content: Buffer): FileInspection {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const spec = Object.hasOwn(FILE_TYPES, ext) ? FILE_TYPES[ext] : undefined;
  if (!spec) return { ok: false, error: UNSUPPORTED_FORMAT_ERROR };
  if (!SIGNATURES[spec.signature](content)) return { ok: false, error: CONTENT_MISMATCH_ERROR };
  return { ok: true, format: spec.format, mimeType: spec.mimeType };
}

/** Valor de `Content-Disposition` con `filename*` (RFC 5987). */
export function contentDisposition(fileName: string, inline: boolean): string {
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}`;
}
