import { PAGE_FIELDS, parsePageQuery, type PageQuery } from '../../../common/utils/pagination';
import { asObject, fail, ok, unknownFieldsError, type ValidationResult } from '../../../common/utils/validation';

/** Parámetros validados de GET /api/projects (ADR 0017). */
export interface ProjectListQuery extends PageQuery {
  /** Texto ya recortado, o `null` si no se buscó. */
  search: string | null;
}

export const MIN_PROJECT_SEARCH_LENGTH = 1;
export const MAX_PROJECT_SEARCH_LENGTH = 100;

const ALLOWED_FIELDS = ['search', ...PAGE_FIELDS] as const;
const SEARCH_ERROR = `search debe tener entre ${MIN_PROJECT_SEARCH_LENGTH} y ${MAX_PROJECT_SEARCH_LENGTH} caracteres.`;

/**
 * Valida los parámetros de consulta (llegan como texto). Devuelve todos los errores a la vez.
 * La búsqueda se recorta y se compara en SQL con `mode: 'insensitive'` (solo mayúsculas).
 */
export function parseProjectListQuery(input: unknown): ValidationResult<ProjectListQuery> {
  const query = asObject(input);
  if (query === null) return fail(['Los parámetros de consulta no son válidos.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(query, ALLOWED_FIELDS);
  if (unknown !== null) errors.push(unknown);

  let search: string | null = null;
  if (query.search !== undefined) {
    const text = typeof query.search === 'string' ? query.search.trim() : null;
    if (text === null || text.length < MIN_PROJECT_SEARCH_LENGTH || text.length > MAX_PROJECT_SEARCH_LENGTH) {
      errors.push(SEARCH_ERROR);
    } else {
      search = text;
    }
  }

  const page = parsePageQuery(query, errors);
  if (errors.length > 0) return fail(errors);
  return ok({ search, ...page });
}
