import type { ApiRequest } from '../../types/api.ts';
import { ApiError, isRecord, parseArray } from '../../lib/api.ts';

/**
 * Contrato de inscripciones (odd/tasks/enrollment-import-demo.md, «Contrato interno
 * de implementación», congelado). El servidor es quien valida permisos por área y
 * la fuente de la hoja; aquí solo se valida la forma de cada respuesta.
 */

export const ENROLLMENT_FACULTIES = ['SYSTEMS_ENGINEERING', 'SOFTWARE_ENGINEERING'] as const;
export type EnrollmentFaculty = (typeof ENROLLMENT_FACULTIES)[number];

export const ENROLLMENT_AREA_TYPES = ['SEEDLING', 'DEGREE_PROJECT'] as const;
export type EnrollmentAreaType = (typeof ENROLLMENT_AREA_TYPES)[number];

export const ENROLLMENT_DOCUMENT_TYPES = ['CC', 'TI'] as const;
export type EnrollmentDocumentType = (typeof ENROLLMENT_DOCUMENT_TYPES)[number];

export const ENROLLMENT_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export interface EnrollmentOption { value: string; label: string }
export interface EnrollmentSource { spreadsheetId: string; range: string; areaType: EnrollmentAreaType }
export interface EnrollmentAreaOption { id: string; name: string; sourceConfigured: boolean; source: EnrollmentSource | null }
export interface EnrollmentOptions {
  areas: EnrollmentAreaOption[];
  faculties: EnrollmentOption[];
  areaTypes: EnrollmentOption[];
  documentTypes: EnrollmentOption[];
  statuses: EnrollmentOption[];
}

/** Solicitud en revisión (`GET /api/enrollments`). El documento es texto para conservar los ceros iniciales. */
export interface Enrollment {
  id: string;
  firstNames: string;
  lastNames: string;
  email: string;
  documentType: EnrollmentDocumentType;
  documentNumber: string;
  faculty: EnrollmentFaculty;
  areaId: string;
  areaType: EnrollmentAreaType;
  period: string;
  status: EnrollmentStatus;
  createdAt: string;
  rejectedAt: string | null;
}

export interface EnrollmentList { items: Enrollment[]; total: number }

export interface EnrollmentFilters {
  areaId?: string;
  faculty?: EnrollmentFaculty;
  period?: string;
  status?: EnrollmentStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface EnrollmentSourceInput { spreadsheetId: string; range: string; areaType: EnrollmentAreaType }

export interface EnrollmentPreviewRow {
  sourceRow: number;
  firstNames: string;
  lastNames: string;
  email: string;
  documentType: EnrollmentDocumentType | null;
  documentNumber: string;
  faculty: EnrollmentFaculty | null;
  areaType: EnrollmentAreaType;
  period: string;
  consent: boolean;
  errors: string[];
  duplicate: boolean;
}

export interface EnrollmentPreviewSummary { read: number; valid: number; invalid: number; duplicates: number }
export interface EnrollmentPreview { previewToken: string; rows: EnrollmentPreviewRow[]; summary: EnrollmentPreviewSummary }
export interface EnrollmentImportResult { imported: number; duplicates: number; invalid: number }

/** El menú «Inscripciones» solo es visible para estos roles; el backend también los exige. */
export const canManageEnrollments = (roles: readonly string[]): boolean =>
  roles.some((role) => role === 'ADMIN' || role === 'AREA_MANAGER');

function fail(): never { throw new ApiError(0); }
function record(value: unknown): Record<string, unknown> { if (!isRecord(value)) fail(); return value; }
function str(value: unknown): string { if (typeof value !== 'string') fail(); return value; }
function text(value: unknown): string { return str(value); }
function num(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value)) fail(); return value; }
function bool(value: unknown): boolean { if (typeof value !== 'boolean') fail(); return value; }
function nullableStr(value: unknown): string | null { if (value === null || value === undefined) return null; return str(value); }
function oneOf<T extends string>(values: readonly T[]) {
  return (value: unknown): T => {
    const text = str(value);
    if (!(values as readonly string[]).includes(text)) fail();
    return text as T;
  };
}
const faculty = oneOf(ENROLLMENT_FACULTIES);
const areaType = oneOf(ENROLLMENT_AREA_TYPES);
const documentType = oneOf(ENROLLMENT_DOCUMENT_TYPES);
const status = oneOf(ENROLLMENT_STATUSES);

function nullableOneOf<T extends string>(values: readonly T[]) {
  return (value: unknown): T | null => {
    if (value === null || value === undefined) return null;
    return oneOf(values)(value);
  };
}
const nullableDocumentType = nullableOneOf(ENROLLMENT_DOCUMENT_TYPES);
const nullableFaculty = nullableOneOf(ENROLLMENT_FACULTIES);

function parseOption(value: unknown): EnrollmentOption {
  const r = record(value);
  return { value: str(r.value), label: str(r.label) };
}

export function parseEnrollmentSource(value: unknown): EnrollmentSource {
  const r = record(value);
  return { spreadsheetId: str(r.spreadsheetId), range: str(r.range), areaType: areaType(r.areaType) };
}

function parseAreaOption(value: unknown): EnrollmentAreaOption {
  const r = record(value);
  return {
    id: str(r.id),
    name: str(r.name),
    sourceConfigured: bool(r.sourceConfigured),
    source: r.source === null || r.source === undefined ? null : parseEnrollmentSource(r.source),
  };
}

export function parseEnrollmentOptions(value: unknown): EnrollmentOptions {
  const r = record(value);
  return {
    areas: parseArray(r.areas, parseAreaOption),
    faculties: parseArray(r.faculties, parseOption).map((option) => ({ value: faculty(option.value), label: option.label })),
    areaTypes: parseArray(r.areaTypes, parseOption).map((option) => ({ value: areaType(option.value), label: option.label })),
    documentTypes: parseArray(r.documentTypes, parseOption).map((option) => ({ value: documentType(option.value), label: option.label })),
    statuses: parseArray(r.statuses, parseOption).map((option) => ({ value: status(option.value), label: option.label })),
  };
}

export function parseEnrollment(value: unknown): Enrollment {
  const r = record(value);
  return {
    id: str(r.id),
    firstNames: text(r.firstNames),
    lastNames: text(r.lastNames),
    email: text(r.email),
    documentType: documentType(r.documentType),
    documentNumber: text(r.documentNumber),
    faculty: faculty(r.faculty),
    areaId: str(r.areaId),
    areaType: areaType(r.areaType),
    period: text(r.period),
    status: status(r.status),
    createdAt: str(r.createdAt),
    rejectedAt: nullableStr(r.rejectedAt),
  };
}

function parseEnrollmentList(value: unknown): EnrollmentList {
  const r = record(value);
  return { items: parseArray(r.items, parseEnrollment), total: num(r.total) };
}

function parsePreviewRow(value: unknown): EnrollmentPreviewRow {
  const r = record(value);
  if (!Array.isArray(r.errors) || r.errors.some((item) => typeof item !== 'string')) fail();
  return {
    sourceRow: num(r.sourceRow),
    firstNames: text(r.firstNames),
    lastNames: text(r.lastNames),
    email: text(r.email),
    documentType: nullableDocumentType(r.documentType),
    documentNumber: text(r.documentNumber),
    faculty: nullableFaculty(r.faculty),
    areaType: areaType(r.areaType),
    period: text(r.period),
    consent: bool(r.consent),
    errors: r.errors as string[],
    duplicate: bool(r.duplicate),
  };
}

export function parseEnrollmentPreview(value: unknown): EnrollmentPreview {
  const r = record(value);
  const summary = record(r.summary);
  return {
    previewToken: str(r.previewToken),
    rows: parseArray(r.rows, parsePreviewRow),
    summary: { read: num(summary.read), valid: num(summary.valid), invalid: num(summary.invalid), duplicates: num(summary.duplicates) },
  };
}

function parseImportResult(value: unknown): EnrollmentImportResult {
  const r = record(value);
  return { imported: num(r.imported), duplicates: num(r.duplicates), invalid: num(r.invalid) };
}

const enc = encodeURIComponent;

export async function getEnrollmentOptions(request: ApiRequest): Promise<EnrollmentOptions> {
  return parseEnrollmentOptions(await request('/api/enrollments/options'));
}

/** Configura la fuente privada de un área. No recibe credenciales (contrato congelado). */
export async function saveEnrollmentSource(request: ApiRequest, areaId: string, input: EnrollmentSourceInput): Promise<EnrollmentSource> {
  return parseEnrollmentSource(await request(`/api/enrollments/sources/${enc(areaId)}`, { method: 'PUT', body: input }));
}

export async function previewEnrollments(request: ApiRequest, areaId: string): Promise<EnrollmentPreview> {
  return parseEnrollmentPreview(await request('/api/enrollments/preview', { method: 'POST', body: { areaId } }));
}

/** Confirma la importación de una vista previa; el token firmado vincula actor, área y fuente. */
export async function importEnrollments(request: ApiRequest, previewToken: string): Promise<EnrollmentImportResult> {
  return parseImportResult(await request('/api/enrollments/import', { method: 'POST', body: { previewToken } }));
}

function enrollmentQuery(filters: EnrollmentFilters): string {
  const query = new URLSearchParams();
  if (filters.areaId !== undefined) query.set('areaId', filters.areaId);
  if (filters.faculty !== undefined) query.set('faculty', filters.faculty);
  if (filters.period !== undefined) query.set('period', filters.period);
  if (filters.status !== undefined) query.set('status', filters.status);
  if (filters.search !== undefined) query.set('search', filters.search);
  if (filters.limit !== undefined) query.set('limit', String(filters.limit));
  if (filters.offset !== undefined) query.set('offset', String(filters.offset));
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

export async function listEnrollments(request: ApiRequest, filters: EnrollmentFilters = {}): Promise<EnrollmentList> {
  return parseEnrollmentList(await request(`/api/enrollments${enrollmentQuery(filters)}`));
}

/** Acepta o rechaza una solicitud. Aceptar crea un usuario STUDENT en el backend. */
export async function changeEnrollmentStatus(request: ApiRequest, id: string, next: 'ACCEPTED' | 'REJECTED'): Promise<Enrollment> {
  return parseEnrollment(await request(`/api/enrollments/${enc(id)}/status`, { method: 'PATCH', body: { status: next } }));
}

/** Cambia el estado de una selección acotada; sin cambios parciales fuera de alcance. */
export async function bulkChangeEnrollmentStatus(request: ApiRequest, ids: string[], next: 'ACCEPTED' | 'REJECTED'): Promise<{ updated: number }> {
  const r = record(await request('/api/enrollments/status', { method: 'PATCH', body: { ids, status: next } }));
  return { updated: num(r.updated) };
}

/** Solo las rechazadas pueden eliminarse; el borrado es local y no toca la hoja de Google. */
export async function deleteEnrollment(request: ApiRequest, id: string): Promise<void> {
  await request(`/api/enrollments/${enc(id)}`, { method: 'DELETE' });
}

/** Ruta del Excel con los mismos filtros del listado (el backend lo genera autenticado). */
export function enrollmentExportPath(filters: EnrollmentFilters = {}): string {
  return `/api/enrollments/export.xlsx${enrollmentQuery(filters)}`;
}

const XLSX_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  'application/octet-stream',
];

/**
 * Descarga el `.xlsx` real con `fetch` directo: `createApiRequest` solo acepta
 * JSON y un cuerpo de error no debe mostrarse nunca como si fuera el archivo.
 * Un 401 se propaga como `ApiError` para que la sesión expire igual que en el resto.
 */
export async function downloadEnrollmentExport(
  fetcher: typeof fetch = globalThis.fetch,
  filters: EnrollmentFilters = {},
): Promise<Blob> {
  let response: Response;
  try {
    response = await fetcher(enrollmentExportPath(filters), {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: XLSX_TYPES[0] },
    });
  } catch {
    throw new ApiError(0);
  }
  if (!response.ok) {
    let details: { message?: string; errors?: string[] } = {};
    try {
      const body: unknown = await response.json();
      if (isRecord(body)) {
        details = {
          message: typeof body.message === 'string' ? body.message : undefined,
          errors: Array.isArray(body.errors) ? body.errors.filter((item): item is string => typeof item === 'string') : undefined,
        };
      }
    } catch { /* se usa el mensaje por estado */ }
    throw new ApiError(response.status, details);
  }
  const contentType = (response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (!XLSX_TYPES.includes(contentType)) throw new ApiError(0);
  return response.blob();
}
