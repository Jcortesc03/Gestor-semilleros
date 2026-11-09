import { asObject, fail, isUuid, ok, unknownFieldsError, type ValidationResult } from '../../../common/utils/validation';
import { EnrollmentAreaType, EnrollmentFaculty, EnrollmentStatus, EnrollmentDocumentType } from '../../../generated/prisma/enums';

const DOCUMENT_TYPES = Object.values(EnrollmentDocumentType);
const AREA_TYPES = Object.values(EnrollmentAreaType);
const FACULTIES = Object.values(EnrollmentFaculty);
const STATUSES = Object.values(EnrollmentStatus);

function objectOrError(input: unknown, allowed: readonly string[]): { body: Record<string, unknown>; errors: string[] } | string[] {
  const body = asObject(input);
  if (!body) return ['El cuerpo debe ser un objeto JSON.'];
  const extra = unknownFieldsError(body, allowed);
  return { body, errors: extra ? [extra] : [] };
}

export interface SourceConfigDto {
  spreadsheetId: string;
  range: string;
  areaType: EnrollmentAreaType;
}

export function parseSourceConfig(input: unknown): ValidationResult<SourceConfigDto> {
  const parsed = objectOrError(input, ['spreadsheetId', 'range', 'areaType']);
  if (Array.isArray(parsed)) return fail(parsed);
  const { body, errors } = parsed;
  const spreadsheetId = typeof body.spreadsheetId === 'string' ? body.spreadsheetId.trim() : '';
  if (!spreadsheetId || spreadsheetId.length > 200 || /\s/.test(spreadsheetId)) errors.push('spreadsheetId es obligatorio y debe ser un identificador válido.');
  const range = typeof body.range === 'string' ? body.range.trim() : '';
  if (!range || range.length > 200) errors.push('range es obligatorio.');
  if (typeof body.areaType !== 'string' || !AREA_TYPES.includes(body.areaType as EnrollmentAreaType)) {
    errors.push(`areaType debe ser uno de: ${AREA_TYPES.join(', ')}.`);
  }
  return errors.length > 0
    ? fail(errors)
    : ok({ spreadsheetId, range, areaType: body.areaType as EnrollmentAreaType });
}

export interface PreviewDto {
  areaId: string;
}

export function parsePreview(input: unknown): ValidationResult<PreviewDto> {
  const parsed = objectOrError(input, ['areaId']);
  if (Array.isArray(parsed)) return fail(parsed);
  const { body, errors } = parsed;
  if (!isUuid(body.areaId)) errors.push('areaId es obligatorio y debe ser un UUID.');
  return errors.length > 0 ? fail(errors) : ok({ areaId: body.areaId as string });
}

export interface ImportDto {
  previewToken: string;
}

export function parseImport(input: unknown): ValidationResult<ImportDto> {
  const parsed = objectOrError(input, ['previewToken']);
  if (Array.isArray(parsed)) return fail(parsed);
  const { body, errors } = parsed;
  if (typeof body.previewToken !== 'string' || body.previewToken.trim().length === 0) errors.push('previewToken es obligatorio.');
  return errors.length > 0 ? fail(errors) : ok({ previewToken: (body.previewToken as string).trim() });
}

export interface StatusSingleDto {
  status: 'ACCEPTED' | 'REJECTED';
}

export function parseStatusSingle(input: unknown): ValidationResult<StatusSingleDto> {
  const parsed = objectOrError(input, ['status']);
  if (Array.isArray(parsed)) return fail(parsed);
  const { body, errors } = parsed;
  if (body.status !== 'ACCEPTED' && body.status !== 'REJECTED') errors.push('status debe ser ACCEPTED o REJECTED.');
  return errors.length > 0 ? fail(errors) : ok({ status: body.status as 'ACCEPTED' | 'REJECTED' });
}

export interface StatusBulkDto {
  ids: string[];
  status: 'ACCEPTED' | 'REJECTED';
}

export function parseStatusBulk(input: unknown): ValidationResult<StatusBulkDto> {
  const parsed = objectOrError(input, ['ids', 'status']);
  if (Array.isArray(parsed)) return fail(parsed);
  const { body, errors } = parsed;
  if (!Array.isArray(body.ids) || body.ids.length === 0 || !body.ids.every(isUuid)) errors.push('ids debe ser un arreglo no vacío de UUIDs.');
  if (body.status !== 'ACCEPTED' && body.status !== 'REJECTED') errors.push('status debe ser ACCEPTED o REJECTED.');
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids as string[])] : [];
  if (ids.length > 500) errors.push('ids admite como máximo 500 elementos.');
  return errors.length > 0 ? fail(errors) : ok({ ids, status: body.status as 'ACCEPTED' | 'REJECTED' });
}

export interface ListQuery {
  areaId?: string;
  faculty?: EnrollmentFaculty;
  period?: string;
  status?: EnrollmentStatus;
  search?: string;
  limit: number;
  offset: number;
}

export function parseListQuery(input: unknown): ValidationResult<ListQuery> {
  const obj = asObject(input ?? {});
  if (obj === null) return fail(['Los parámetros de consulta no son válidos.']);
  const errors: string[] = [];
  const extra = unknownFieldsError(obj, ['areaId', 'faculty', 'period', 'status', 'search', 'limit', 'offset']);
  if (extra) errors.push(extra);

  let areaId: string | undefined;
  if (obj.areaId !== undefined) {
    if (!isUuid(obj.areaId)) errors.push('areaId debe ser un UUID.');
    else areaId = obj.areaId as string;
  }
  let faculty: EnrollmentFaculty | undefined;
  if (obj.faculty !== undefined) {
    if (typeof obj.faculty !== 'string' || !FACULTIES.includes(obj.faculty as EnrollmentFaculty)) errors.push(`faculty debe ser uno de: ${FACULTIES.join(', ')}.`);
    else faculty = obj.faculty as EnrollmentFaculty;
  }
  let period: string | undefined;
  if (obj.period !== undefined) {
    if (typeof obj.period !== 'string' || obj.period.trim().length === 0) errors.push('period debe ser texto no vacío.');
    else period = obj.period.trim();
  }
  let status: EnrollmentStatus | undefined;
  if (obj.status !== undefined) {
    if (typeof obj.status !== 'string' || !STATUSES.includes(obj.status as EnrollmentStatus)) errors.push(`status debe ser uno de: ${STATUSES.join(', ')}.`);
    else status = obj.status as EnrollmentStatus;
  }
  let search: string | undefined;
  if (obj.search !== undefined) {
    if (typeof obj.search !== 'string') errors.push('search debe ser texto.');
    else search = obj.search.trim().slice(0, 200);
  }
  const limitRaw = obj.limit === undefined ? 20 : Number(obj.limit);
  const offsetRaw = obj.offset === undefined ? 0 : Number(obj.offset);
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 200) errors.push('limit debe ser un entero entre 1 y 200.');
  if (!Number.isInteger(offsetRaw) || offsetRaw < 0) errors.push('offset debe ser un entero no negativo.');
  if (errors.length > 0) return fail(errors);
  return ok({ areaId, faculty, period, status, search, limit: limitRaw, offset: offsetRaw });
}

export { EnrollmentDocumentType, EnrollmentAreaType, EnrollmentFaculty, EnrollmentStatus };
