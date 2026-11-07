import { Role } from '../../../generated/prisma/enums';
import {
  asObject,
  fail,
  ok,
  parseEnum,
  unknownFieldsError,
  type ValidationResult,
} from '../../../common/utils/validation';

/** Parámetros validados de GET /api/users (directorio de selección). */
export interface UserDirectoryQuery {
  /** Texto ya recortado, o `null` si no se buscó. */
  search: string | null;
  /** Rol global exigido, o `null` para cualquiera. */
  role: Role | null;
  limit: number;
}

export const DEFAULT_DIRECTORY_LIMIT = 20;
export const MAX_DIRECTORY_LIMIT = 50;
export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 100;

const ALLOWED_FIELDS = ['search', 'role', 'limit'] as const;
const SEARCH_ERROR = `search debe tener entre ${MIN_SEARCH_LENGTH} y ${MAX_SEARCH_LENGTH} caracteres.`;
const ROLE_ERROR = `role debe ser uno de: ${Object.values(Role).join(', ')}.`;
const LIMIT_ERROR = `limit debe ser un entero entre 1 y ${MAX_DIRECTORY_LIMIT}.`;

/**
 * Valida los parámetros de consulta (llegan como texto). Devuelve todos los errores a la vez.
 *
 * Búsqueda: el texto se recorta y se compara sin distinguir mayúsculas ni tildes
 * (`normalizeForSearch`). Esa comparación se hace en la aplicación, no en SQL:
 * PostgreSQL con `mode: 'insensitive'` ignora mayúsculas pero no tildes, y la
 * extensión `unaccent` requeriría una migración que no se ha aprobado.
 */
export function parseUserDirectoryQuery(input: unknown): ValidationResult<UserDirectoryQuery> {
  const query = asObject(input);
  if (query === null) return fail(['Los parámetros de consulta no son válidos.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(query, ALLOWED_FIELDS);
  if (unknown !== null) errors.push(unknown);

  let search: string | null = null;
  if (query.search !== undefined) {
    const text = typeof query.search === 'string' ? query.search.trim() : null;
    if (text === null || text.length < MIN_SEARCH_LENGTH || text.length > MAX_SEARCH_LENGTH) errors.push(SEARCH_ERROR);
    else search = text;
  }

  let role: Role | null = null;
  if (query.role !== undefined) {
    const parsed = parseEnum(query.role, Role);
    if (parsed === null) errors.push(ROLE_ERROR);
    else role = parsed;
  }

  let limit = DEFAULT_DIRECTORY_LIMIT;
  if (query.limit !== undefined) {
    const parsed = typeof query.limit === 'string' && /^\d+$/.test(query.limit) ? Number(query.limit) : NaN;
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_DIRECTORY_LIMIT) errors.push(LIMIT_ERROR);
    else limit = parsed;
  }

  if (errors.length > 0) return fail(errors);
  return ok({ search, role, limit });
}
