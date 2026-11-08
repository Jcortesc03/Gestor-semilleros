import type { Credentials, CurrentUser } from '../types/auth.ts';

export type AuthErrorKind =
  | 'network'
  | 'unavailable'
  | 'invalid-response'
  | 'invalid-credentials'
  | 'signout-failed'
  | 'google-denied';

const AUTH_ERROR_MESSAGES: Record<AuthErrorKind, string> = {
  network: 'No se pudo conectar con el servidor. Inténtalo de nuevo.',
  unavailable: 'El servicio de autenticación no está disponible. Inténtalo más tarde.',
  'invalid-response': 'El servidor devolvió una respuesta inesperada.',
  'invalid-credentials': 'El correo o la contraseña no son correctos.',
  'signout-failed': 'No se pudo cerrar la sesión. Inténtalo de nuevo.',
  'google-denied':
    'No hay una cuenta activa registrada con ese correo de Google. Contacta con la administración de tu institución.',
};

/** Error de autenticación con un motivo estable y un mensaje seguro para la interfaz. */
export class AuthError extends Error {
  readonly kind: AuthErrorKind;

  constructor(kind: AuthErrorKind) {
    super(AUTH_ERROR_MESSAGES[kind]);
    this.name = 'AuthError';
    this.kind = kind;
  }
}

/** Proveedores habilitados en el backend (`GET /api/auth/providers`). */
export interface AuthProviders {
  credentials: boolean;
  google: boolean;
}

/** Envía un formulario real (navegación completa), necesario para el redireccionamiento OAuth. */
export type FormNavigator = (action: string, fields: Record<string, string>) => void;

export interface AuthClient {
  getCurrentUser: () => Promise<CurrentUser | null>;
  getProviders: () => Promise<AuthProviders>;
  signIn: (credentials: Credentials) => Promise<CurrentUser>;
  /** Redirige a Google; si todo va bien la página se abandona y la promesa no vuelve a importar. */
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

/** Ruta a la que vuelve la aplicación tras iniciar sesión con Google. */
export const GOOGLE_CALLBACK_PATH = '/panel';

export function submitForm(action: string, fields: Record<string, string>): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  form.hidden = true;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}

/**
 * Traduce el `?error=` con el que Auth.js devuelve a la aplicación a un motivo
 * seguro. Devuelve `null` si la URL no trae error.
 */
export function authErrorFromUrl(search: string): AuthError | null {
  const code = new URLSearchParams(search).get('error');
  if (code === null) return null;
  if (code === 'AccessDenied') return new AuthError('google-denied');
  if (code === 'CredentialsSignin') return new AuthError('invalid-credentials');
  return new AuthError('unavailable');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCurrentUser(payload: unknown): CurrentUser {
  if (!isRecord(payload)) throw new AuthError('invalid-response');

  // Compatibilidad: si `mustChangePassword` falta en la respuesta se trata como `false`.
  const { id, email, fullName, roles, mustChangePassword } = payload;
  if (
    typeof id !== 'string' ||
    typeof email !== 'string' ||
    typeof fullName !== 'string' ||
    !Array.isArray(roles) ||
    !roles.every((role) => typeof role === 'string') ||
    (mustChangePassword !== undefined && typeof mustChangePassword !== 'boolean')
  ) {
    throw new AuthError('invalid-response');
  }

  return { id, email, fullName, roles, mustChangePassword: mustChangePassword === true };
}

function hasErrorQuery(responseUrl: string): boolean {
  const queryStart = responseUrl.indexOf('?');
  if (queryStart === -1) return false;

  const hashStart = responseUrl.indexOf('#', queryStart);
  const query = responseUrl.slice(queryStart + 1, hashStart === -1 ? undefined : hashStart);
  return new URLSearchParams(query).has('error');
}

export function createAuthClient(
  fetcher: typeof fetch = globalThis.fetch,
  navigate: FormNavigator = submitForm,
): AuthClient {
  async function request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetcher(path, init);
    } catch {
      throw new AuthError('network');
    }
  }

  async function readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new AuthError('invalid-response');
    }
  }

  async function fetchCsrfToken(): Promise<string> {
    const response = await request('/api/auth/csrf', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) throw new AuthError('unavailable');

    const payload = await readJson(response);
    if (!isRecord(payload) || typeof payload.csrfToken !== 'string' || payload.csrfToken.trim() === '') {
      throw new AuthError('invalid-response');
    }
    return payload.csrfToken;
  }

  async function getCurrentUser(): Promise<CurrentUser | null> {
    const response = await request('/api/me', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new AuthError('unavailable');

    return parseCurrentUser(await readJson(response));
  }

  async function signIn(credentials: Credentials): Promise<CurrentUser> {
    const csrfToken = await fetchCsrfToken();
    const body = new URLSearchParams({
      csrfToken,
      email: credentials.email,
      password: credentials.password,
      callbackUrl: '/panel',
    });

    const response = await request('/api/auth/callback/credentials', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (hasErrorQuery(response.url)) throw new AuthError('invalid-credentials');
    if (!response.ok) throw new AuthError('unavailable');

    const user = await getCurrentUser();
    if (user === null) throw new AuthError('invalid-credentials');
    return user;
  }

  async function getProviders(): Promise<AuthProviders> {
    const response = await request('/api/auth/providers', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) throw new AuthError('unavailable');

    const payload = await readJson(response);
    if (!isRecord(payload)) throw new AuthError('invalid-response');
    return { credentials: isRecord(payload.credentials), google: isRecord(payload.google) };
  }

  async function signInWithGoogle(): Promise<void> {
    const csrfToken = await fetchCsrfToken();
    navigate('/api/auth/signin/google', { csrfToken, callbackUrl: GOOGLE_CALLBACK_PATH });
  }

  async function signOut(): Promise<void> {
    const csrfToken = await fetchCsrfToken();
    await request('/api/auth/signout', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrfToken, callbackUrl: '/login' }),
    });

    const user = await getCurrentUser();
    if (user !== null) throw new AuthError('signout-failed');
  }

  return { getCurrentUser, getProviders, signIn, signInWithGoogle, signOut };
}
