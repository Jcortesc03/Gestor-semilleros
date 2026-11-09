/** Paginación por desplazamiento compartida por las listas de la API (ADR 0017). */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const PAGE_FIELDS = ['page', 'pageSize'] as const;

export interface PageQuery {
  /** Página 1-based. */
  page: number;
  pageSize: number;
}

/** Envoltorio de toda respuesta paginada. */
export interface PageDto<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_ERROR = 'page debe ser un entero mayor o igual que 1.';
const PAGE_SIZE_ERROR = `pageSize debe ser un entero entre 1 y ${MAX_PAGE_SIZE}.`;

function positiveInt(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/**
 * Lee `page` y `pageSize` de la query (llegan como texto) y añade a `errors` los mensajes de validación.
 * `defaultPageSize` permite a cada lista conservar su tamaño por defecto.
 */
export function parsePageQuery(query: Record<string, unknown>, errors: string[], defaultPageSize = DEFAULT_PAGE_SIZE): PageQuery {
  let page = 1;
  let pageSize = Math.min(defaultPageSize, MAX_PAGE_SIZE);
  if (query.page !== undefined) {
    const parsed = positiveInt(query.page);
    if (parsed === null) errors.push(PAGE_ERROR);
    else page = parsed;
  }
  if (query.pageSize !== undefined) {
    const parsed = positiveInt(query.pageSize);
    if (parsed === null || parsed > MAX_PAGE_SIZE) errors.push(PAGE_SIZE_ERROR);
    else pageSize = parsed;
  }
  return { page, pageSize };
}

/** Argumentos de Prisma para la página pedida. */
export function pageArgs(q: PageQuery): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function toPage<T>(items: T[], total: number, q: PageQuery): PageDto<T> {
  return { items, total, page: q.page, pageSize: q.pageSize };
}
