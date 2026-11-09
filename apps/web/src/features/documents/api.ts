import type { ApiRequest } from '../../types/api.ts';
import { ApiError, isRecord, parseArray } from '../../lib/api.ts';
import { parsePage, withPage, type Page, type PageRequest } from '../../lib/pagination.ts';

/** Contrato: `docs/api/documents.md` (ADR 0013). El servidor es quien valida; aquí solo se evita un viaje inútil. */

export const DOCUMENT_FORMATS = ['PDF', 'WORD', 'EXCEL', 'IMAGE'] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

export interface ProjectDocument {
  id: string;
  projectId: string;
  fileName: string;
  format: DocumentFormat;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: { id: string; fullName: string };
  createdAt: string;
}

/** Límite por archivo (RN-64), igual que el del servidor. */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** Extensiones admitidas por el servidor, en el mismo orden que `accept` del campo de subida. */
export const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.webp'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown): value is string => typeof value === 'string';
const invalid = (): never => { throw new ApiError(0); };
const requiredId = (value: unknown): string => (text(value) && UUID.test(value) ? value : invalid());
const requiredText = (value: unknown): string => (text(value) ? value : invalid());

function parseDocumentFormat(value: unknown): DocumentFormat {
  return DOCUMENT_FORMATS.find((format) => format === value) ?? invalid();
}

/** Valida la forma de un `DocumentDto`; cualquier campo ausente o mal tipado falla de forma segura. */
export function parseDocument(value: unknown): ProjectDocument {
  if (!isRecord(value)) return invalid();
  const uploader = value.uploadedBy;
  if (!isRecord(uploader)) return invalid();
  if (typeof value.sizeBytes !== 'number' || !Number.isFinite(value.sizeBytes) || value.sizeBytes < 0) return invalid();
  return {
    id: requiredId(value.id),
    projectId: requiredId(value.projectId),
    fileName: requiredText(value.fileName),
    format: parseDocumentFormat(value.format),
    mimeType: requiredText(value.mimeType),
    sizeBytes: value.sizeBytes,
    uploadedBy: { id: requiredId(uploader.id), fullName: requiredText(uploader.fullName) },
    createdAt: requiredText(value.createdAt),
  };
}

const projectDocumentsPath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/documents`;

/** Documentos por página de la sección Documentos (ADR 0017; el servidor usa 20 por defecto). */
export const DOCUMENTS_PAGE_SIZE = 20;

/**
 * Documentos del proyecto, paginados (ADR 0017). La página 1 se omite de la URL; el selector de
 * adjuntos pide `pageSize` hasta 100 y la sección Documentos usa el valor por defecto.
 */
export async function listDocuments(request: ApiRequest, projectId: string, params: PageRequest = {}): Promise<Page<ProjectDocument>> {
  const query = new URLSearchParams();
  withPage(query, { page: params.page !== undefined && params.page > 1 ? params.page : undefined, pageSize: params.pageSize });
  const suffix = query.toString();
  return parsePage(await request(`${projectDocumentsPath(projectId)}${suffix ? `?${suffix}` : ''}`), parseDocument);
}

/** Sube un archivo ya validado con `validateDocumentFile`; el campo multipart se llama `file`. */
export async function uploadDocument(request: ApiRequest, projectId: string, file: File): Promise<ProjectDocument> {
  const body = new FormData();
  body.append('file', file);
  return parseDocument(await request(projectDocumentsPath(projectId), { method: 'POST', body }));
}

export function deleteDocument(request: ApiRequest, documentId: string): Promise<unknown> {
  return request(`/api/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
}

/** URL de descarga del backend (mismo origen, con la cookie de sesión). `inline` sirve para previsualizar. */
export function documentUrl(documentId: string, options: { inline?: boolean } = {}): string {
  const base = `/api/documents/${encodeURIComponent(documentId)}/download`;
  return options.inline ? `${base}?inline=true` : base;
}

/** PDF e imágenes se pueden ver en el navegador; Word y Excel solo se descargan. */
export const canPreviewInline = (format: DocumentFormat): boolean => format === 'PDF' || format === 'IMAGE';

/** Mensaje en español o `null` si el archivo puede enviarse. Mismas reglas que el servidor. */
export function validateDocumentFile(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf('.');
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!(DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) {
    return 'Formato no admitido. Usa PDF, Word (.doc, .docx), Excel (.xls, .xlsx) o imagen (.png, .jpg, .jpeg, .webp).';
  }
  if (file.size > MAX_DOCUMENT_BYTES) return 'El archivo supera el tamaño máximo de 25 MB.';
  if (file.size === 0) return 'El archivo está vacío.';
  return null;
}
