import { Role } from '../../../generated/prisma/enums';
import {
  asObject,
  fail,
  ok,
  parseEnum,
  unknownFieldsError,
  type ValidationResult,
} from '../../../common/utils/validation';
import { PAGE_FIELDS, parsePageQuery, type PageQuery } from '../../../common/utils/pagination';

/** Parámetros validados de GET /api/users (directorio de selección, paginado según ADR 0017). */
export interface UserDirectoryQuery extends PageQuery {
  /** Texto ya recortado, o `null` si no se buscó. */
  search: string | null;
  /** Rol global exigido, o `null` para cualquiera. */
  role: Role | null;
  /** Filtro de estado pedido por un administrador, o `null` si no se envió (solo activos, sin campo `status`). */
  status: UserStatusFilter | null;
}

export const USER_STATUS_FILTERS = ['ACTIVE', 'INACTIVE', 'ALL'] as const;
export type UserStatusFilter = (typeof USER_STATUS_FILTERS)[number];

export const DEFAULT_DIRECTORY_PAGE_SIZE = 20;
export const MIN_SEARCH_LENGTH = 2;
export const MAX_SEARCH_LENGTH = 100;

const ALLOWED_FIELDS = ['search', 'role', 'status', ...PAGE_FIELDS] as const;
const SEARCH_ERROR = `search debe tener entre ${MIN_SEARCH_LENGTH} y ${MAX_SEARCH_LENGTH} caracteres.`;
const ROLE_ERROR = `role debe ser uno de: ${Object.values(Role).join(', ')}.`;
const STATUS_ERROR = `status debe ser uno de: ${USER_STATUS_FILTERS.join(', ')}.`;

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

  const page = parsePageQuery(query, errors, DEFAULT_DIRECTORY_PAGE_SIZE);

  let status: UserStatusFilter | null = null;
  if (query.status !== undefined) {
    const parsed = typeof query.status === 'string' ? USER_STATUS_FILTERS.find((s) => s === query.status) : undefined;
    if (parsed === undefined) errors.push(STATUS_ERROR);
    else status = parsed;
  }

  if (errors.length > 0) return fail(errors);
  return ok({ search, role, status, ...page });
}
