import { MAX_PASSWORD_LENGTH } from '../models/password-policy';

/** Credenciales de inicio de sesión ya validadas y normalizadas. */
export interface CredentialsDto {
  email: string;
  password: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
export { MAX_PASSWORD_LENGTH };

/** Normaliza un correo para búsquedas: sin espacios y en minúsculas. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Valida la entrada del formulario de credenciales (límite del sistema).
 * Devuelve `null` si la entrada no es válida; no revela el motivo al cliente.
 */
export function parseCredentials(input: unknown): CredentialsDto | null {
  if (typeof input !== 'object' || input === null) return null;
  const { email, password } = input as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string') return null;

  const normalized = normalizeEmail(email);
  if (normalized.length === 0 || normalized.length > MAX_EMAIL_LENGTH) return null;
  if (!EMAIL_PATTERN.test(normalized)) return null;
  if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH) return null;

  return { email: normalized, password };
}
