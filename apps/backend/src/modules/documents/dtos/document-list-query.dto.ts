import { PAGE_FIELDS, parsePageQuery, type PageQuery } from '../../../common/utils/pagination';
import { asObject, fail, ok, unknownFieldsError, type ValidationResult } from '../../../common/utils/validation';

/** Parámetros validados de GET /api/projects/:projectId/documents (ADR 0017). */
export type DocumentListQuery = PageQuery;

const ALLOWED_FIELDS = PAGE_FIELDS;

/** Valida `page` y `pageSize` (llegan como texto) y rechaza cualquier otro parámetro. */
export function parseDocumentListQuery(input: unknown): ValidationResult<DocumentListQuery> {
  const query = asObject(input);
  if (query === null) return fail(['Los parámetros de consulta no son válidos.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(query, ALLOWED_FIELDS);
  if (unknown !== null) errors.push(unknown);

  const page = parsePageQuery(query, errors);
  if (errors.length > 0) return fail(errors);
  return ok(page);
}
