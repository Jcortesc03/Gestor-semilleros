import type { ApiRequest } from '../types/api.ts';

const MESSAGES: Record<number, string> = {
  0: 'No pudimos conectar con el servicio o leer su respuesta. Intenta de nuevo.',
  400: 'Revisa los datos del formulario e intenta de nuevo.',
  401: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'No encontramos el recurso solicitado.',
  409: 'Ya existe un registro con esos datos o hay un conflicto con su estado.',
};

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(status >= 500 ? 'El servicio no está disponible en este momento.' : MESSAGES[status] ?? 'No pudimos completar la solicitud.');
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseArray<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new ApiError(0);
  return value.map(parse);
}

/** Cliente de los contratos JSON; Auth.js conserva su transporte de formularios. */
export function createApiRequest(
  fetcher: typeof fetch = globalThis.fetch,
  onUnauthorized?: () => void,
): ApiRequest {
  return async (path, options = {}) => {
    const url = new URL(path, 'https://app.invalid');
    if (!path.startsWith('/api/') || url.origin !== 'https://app.invalid' || !url.pathname.startsWith('/api/')) {
      throw new ApiError(0);
    }

    let response: Response;
    try {
      response = await fetcher(path, {
        method: options.method ?? 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new ApiError(0);
    }

    if (!response.ok) {
      if (response.status === 401) onUnauthorized?.();
      throw new ApiError(response.status);
    }
    if (response.status === 204) return undefined;
    try {
      return await response.json() as unknown;
    } catch {
      throw new ApiError(0);
    }
  };
}
