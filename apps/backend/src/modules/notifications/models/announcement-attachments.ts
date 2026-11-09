import type { AnnouncementKind, DocumentFormat } from '../../../generated/prisma/enums';
import { asObject, fail, ok, unknownFieldsError, type ValidationResult } from '../../../common/utils/validation';
import { inspectFile, sanitizeFileName, UNSUPPORTED_FORMAT_ERROR } from '../../documents';

/** Máximo de archivos por noticia (ADR 0015). */
export const MAX_ANNOUNCEMENT_FILES = 5;
export const NEWS_ONLY_ERROR = 'Solo las noticias (NEWS) admiten archivos adjuntos.';
export const TOO_MANY_FILES_ERROR = `Se admiten hasta ${MAX_ANNOUNCEMENT_FILES} archivos por noticia.`;
export const BAD_MULTIPART_ERROR = `Envíe el cuerpo JSON en el campo "data" y hasta ${MAX_ANNOUNCEMENT_FILES} archivos en el campo "files".`;
export const DATA_FIELD_ERROR = 'data es obligatorio y debe ser un JSON válido.';

/** Archivo recibido por multipart (subconjunto de lo que entrega Multer). */
export interface IncomingFile {
  originalname: string;
  buffer: Buffer;
}

/** Archivo ya validado, listo para subir. */
export interface ValidatedAttachment {
  fileName: string;
  format: DocumentFormat;
  mimeType: string;
  buffer: Buffer;
}

/** Extrae el cuerpo de la novedad de una petición multipart: el campo `data` con el JSON. */
export function parseMultipartData(body: unknown): ValidationResult<unknown> {
  const fields = asObject(body);
  if (fields === null) return fail([DATA_FIELD_ERROR]);
  const extra = unknownFieldsError(fields, ['data']);
  if (extra !== null) return fail([extra]);
  if (typeof fields.data !== 'string') return fail([DATA_FIELD_ERROR]);
  try {
    return ok(JSON.parse(fields.data) as unknown);
  } catch {
    return fail([DATA_FIELD_ERROR]);
  }
}

/** Valida cantidad, tipo de novedad, extensión y firma de los archivos. */
export function inspectAttachments(kind: AnnouncementKind, files: readonly IncomingFile[]): ValidationResult<ValidatedAttachment[]> {
  if (files.length === 0) return ok([]);
  if (kind !== 'NEWS') return fail([NEWS_ONLY_ERROR]);
  if (files.length > MAX_ANNOUNCEMENT_FILES) return fail([TOO_MANY_FILES_ERROR]);

  const errors = new Set<string>();
  const valid: ValidatedAttachment[] = [];
  for (const file of files) {
    const fileName = sanitizeFileName(file.originalname);
    const inspection = fileName === '' ? { ok: false as const, error: UNSUPPORTED_FORMAT_ERROR } : inspectFile(fileName, file.buffer);
    if (inspection.ok) valid.push({ fileName, format: inspection.format, mimeType: inspection.mimeType, buffer: file.buffer });
    else errors.add(inspection.error);
  }
  return errors.size > 0 ? fail([...errors]) : ok(valid);
}

/** Frase que se añade a las copias externas cuando la noticia tiene adjuntos. */
export function attachmentsNotice(count: number): string {
  return `Incluye ${count} archivo(s) adjunto(s): consúltalos en la plataforma.`;
}
