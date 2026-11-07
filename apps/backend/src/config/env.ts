import { loadNotificationsConfig } from './notifications.config';
import type { NotificationsConfig } from './notifications.config.types';

/**
 * Lectura y validación de variables de entorno del backend.
 * Falla al arrancar si falta una variable obligatoria o tiene un formato inválido.
 */
export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export interface AppEnv {
  port: number;
  databaseUrl: string;
  authSecret: string;
  /** Confía en el encabezado Host (necesario detrás de un proxy o en desarrollo). */
  authTrustHost: boolean;
  /** Duración máxima de la sesión en segundos. */
  sessionMaxAge: number;
  google: GoogleOAuthConfig | null;
  /** Copias de novedades por correo y WhatsApp (ADR 0005). */
  notifications: NotificationsConfig;
}

export class EnvValidationError extends Error {}

const MIN_SECRET_LENGTH = 32;
const DEFAULT_SESSION_MAX_AGE = 8 * 60 * 60;

function required(source: NodeJS.ProcessEnv, key: string): string {
  const value = source[key]?.trim();
  if (!value) throw new EnvValidationError(`Falta la variable de entorno ${key}.`);
  return value;
}

function positiveInt(raw: string | undefined, key: string, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new EnvValidationError(`${key} debe ser un entero positivo.`);
  }
  return value;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const authSecret = required(source, 'AUTH_SECRET');
  if (authSecret.length < MIN_SECRET_LENGTH) {
    throw new EnvValidationError(`AUTH_SECRET debe tener al menos ${MIN_SECRET_LENGTH} caracteres.`);
  }

  const googleId = source.AUTH_GOOGLE_ID?.trim();
  const googleSecret = source.AUTH_GOOGLE_SECRET?.trim();
  if (Boolean(googleId) !== Boolean(googleSecret)) {
    throw new EnvValidationError('AUTH_GOOGLE_ID y AUTH_GOOGLE_SECRET deben definirse juntas.');
  }

  return {
    port: positiveInt(source.PORT, 'PORT', 3000),
    databaseUrl: required(source, 'DATABASE_URL'),
    authSecret,
    authTrustHost: source.AUTH_TRUST_HOST === 'true',
    sessionMaxAge: positiveInt(source.AUTH_SESSION_MAX_AGE, 'AUTH_SESSION_MAX_AGE', DEFAULT_SESSION_MAX_AGE),
    google: googleId && googleSecret ? { clientId: googleId, clientSecret: googleSecret } : null,
    notifications: loadNotificationsConfig(source),
  };
}

export const APP_ENV = Symbol('APP_ENV');
