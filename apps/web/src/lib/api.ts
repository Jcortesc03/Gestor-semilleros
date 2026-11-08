import type { ApiRequest } from '../types/api.ts';

const MESSAGES: Record<number, string> = {
  0: 'No pudimos conectar con el servicio o leer su respuesta. Intenta de nuevo.',
  400: 'Revisa los datos del formulario e intenta de nuevo.',
  401: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'No encontramos el recurso solicitado.',
  409: 'Ya existe un registro con esos datos o hay un conflicto con su estado.',
};

const MAX_MESSAGE_LENGTH = 300;
const MAX_ERRORS = 20;

/** Detalles opcionales que el backend envía en su cuerpo de error (`{ message, errors }`). */
export interface ApiErrorDetails {
  message?: string;
  errors?: string[];
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Mensajes por defecto de NestJS/Express (en inglés y con detalles de rutas) que no
 * deben llegar a la interfaz: en esos casos se usa el genérico en español.
 */
const FRAMEWORK_DEFAULT_MESSAGE = /^(Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) |Forbidden resource$|Unauthorized$|Not Found$|Bad Request$|Conflict$|Too Many Requests$|Validation failed)/;

function userFacingMessage(value: unknown): string | undefined {
  const text = cleanText(value);
  return text === undefined || FRAMEWORK_DEFAULT_MESSAGE.test(text) ? undefined : text;
}

export class ApiError extends Error {
  readonly status: number;
  readonly errors?: string[];

  /**
   * Los textos del backend solo se muestran para errores 4xx; en 5xx se usa
   * el mensaje genérico para no filtrar detalles internos.
   */
  constructor(status: number, details: ApiErrorDetails = {}) {
    const backendMessage = status >= 500 ? undefined : userFacingMessage(details.message);
    const generic = status >= 500 ? 'El servicio no está disponible en este momento.' : MESSAGES[status] ?? 'No pudimos completar la solicitud.';
    super(backendMessage ? backendMessage.slice(0, MAX_MESSAGE_LENGTH) : generic);
    this.name = 'ApiError';
    this.status = status;
    const errors = status >= 500 ? [] : (details.errors ?? []).map(cleanText).filter((item): item is string => item !== undefined).slice(0, MAX_ERRORS);
    if (errors.length > 0) this.errors = errors;
  }
}

/** Lee `{ message, errors }` del cuerpo de error sin confiar en su forma. */
async function readErrorDetails(response: Response): Promise<ApiErrorDetails> {
  try {
    const body: unknown = await response.json();
    if (!isRecord(body)) return {};
    const errors = Array.isArray(body.errors) ? body.errors.filter((item): item is string => typeof item === 'string') : undefined;
    return { message: cleanText(body.message), ...(errors === undefined ? {} : { errors }) };
  } catch {
    return {};
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

    // FormData (subidas multipart) se envía tal cual: el navegador añade el Content-Type con su boundary.
    const isForm = options.body instanceof FormData;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    const payload = isForm ? options.body : options.body === undefined ? undefined : JSON.stringify(options.body);

    let response: Response;
    try {
      response = await fetcher(path, {
        method: options.method ?? 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers,
        ...(payload === undefined ? {} : { body: payload as BodyInit }),
      });
    } catch {
      throw new ApiError(0);
    }

    if (!response.ok) {
      const details = await readErrorDetails(response);
      if (response.status === 401) onUnauthorized?.();
      throw new ApiError(response.status, details);
    }
    if (response.status === 204) return undefined;
    try {
      return await response.json() as unknown;
    } catch {
      throw new ApiError(0);
    }
  };
}
