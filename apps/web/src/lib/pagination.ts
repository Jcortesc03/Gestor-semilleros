import { ApiError, isRecord, parseArray } from './api.ts';

/** Página devuelta por la API (ADR 0017). */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageRequest {
  page?: number;
  pageSize?: number;
}

export const DEFAULT_PAGE_SIZE = 20;

function count(value: unknown, min: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) throw new ApiError(0);
  return value;
}

/** Valida el envoltorio `{ items, total, page, pageSize }` y cada elemento con `parseItem`. */
export function parsePage<T>(value: unknown, parseItem: (item: unknown) => T): Page<T> {
  if (!isRecord(value)) throw new ApiError(0);
  return {
    items: parseArray(value.items, parseItem),
    total: count(value.total, 0),
    page: count(value.page, 1),
    pageSize: count(value.pageSize, 1),
  };
}

/** Añade `page` y `pageSize` a unos parámetros de búsqueda, si vienen. */
export function withPage(params: URLSearchParams, request: PageRequest = {}): URLSearchParams {
  if (request.page !== undefined) params.set('page', String(request.page));
  if (request.pageSize !== undefined) params.set('pageSize', String(request.pageSize));
  return params;
}

/** Número de páginas (mínimo 1). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** Recorta una lista ya cargada (paginación en el cliente). `page` se ajusta al rango válido. */
export function slicePage<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const last = pageCount(items.length, pageSize);
  const current = Math.min(Math.max(1, page), last);
  const start = (current - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page: current, pageSize };
}
