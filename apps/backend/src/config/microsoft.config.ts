/**
 * Lectura y validación de las variables de entorno de Microsoft Teams.
 * Los valores se recortan y una cadena vacía se considera no definida.
 */
import { EnvValidationError } from './env';
import { DEFAULT_MEETINGS_TIME_ZONE } from './microsoft.config.types';
import type { MicrosoftConfig } from './microsoft.config.types';

const DEFAULT_TENANT_ID = 'organizations';
const TENANT_KEYWORDS = ['organizations', 'common'] as const;

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Dominio con al menos un punto, p. ej. `universidad.edu.co`. */
const DOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

const ENCRYPTION_KEY_BYTES = 32;
const ENCRYPTION_KEY_ERROR =
  'MICROSOFT_TOKEN_ENCRYPTION_KEY debe ser una clave de 32 bytes en base64 (genérala con: openssl rand -base64 32).';

/** Devuelve el valor recortado o `undefined` si no está definido o está vacío. */
function optional(source: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = source[key]?.trim();
  return value ? value : undefined;
}

function required(source: NodeJS.ProcessEnv, key: string): string {
  const value = optional(source, key);
  if (value === undefined) throw new EnvValidationError(`Falta la variable de entorno ${key}.`);
  return value;
}

/** Valida que el valor sea una URL absoluta con esquema http(s) y la devuelve tal cual. */
function httpUrl(raw: string, key: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EnvValidationError(`${key} debe ser una URL http(s) válida.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new EnvValidationError(`${key} debe ser una URL http(s) válida.`);
  }
  return raw;
}

function tenantId(source: NodeJS.ProcessEnv): string {
  const raw = optional(source, 'MICROSOFT_TENANT_ID');
  if (raw === undefined) return DEFAULT_TENANT_ID;
  if (TENANT_KEYWORDS.includes(raw as (typeof TENANT_KEYWORDS)[number])) return raw;
  if (GUID_PATTERN.test(raw) || DOMAIN_PATTERN.test(raw)) return raw;
  throw new EnvValidationError(
    'MICROSOFT_TENANT_ID debe ser un GUID, un dominio o uno de: organizations, common.',
  );
}

/** Decodifica la clave AES-256 verificando que sea base64 válido y de exactamente 32 bytes. */
function tokenEncryptionKey(source: NodeJS.ProcessEnv): Buffer {
  const raw = required(source, 'MICROSOFT_TOKEN_ENCRYPTION_KEY');
  const isBase64 = raw.length % 4 === 0 && BASE64_PATTERN.test(raw);
  if (!isBase64) throw new EnvValidationError(ENCRYPTION_KEY_ERROR);

  const key = Buffer.from(raw, 'base64');
  if (key.length !== ENCRYPTION_KEY_BYTES) throw new EnvValidationError(ENCRYPTION_KEY_ERROR);
  return key;
}

function linkRedirectUrl(source: NodeJS.ProcessEnv): string | null {
  const raw = optional(source, 'MICROSOFT_LINK_REDIRECT_URL');
  return raw === undefined ? null : httpUrl(raw, 'MICROSOFT_LINK_REDIRECT_URL');
}

/**
 * Carga la integración con Microsoft Teams. Devuelve `null` cuando no hay
 * credenciales: la integración queda desactivada.
 */
export function loadMicrosoftConfig(source: NodeJS.ProcessEnv): MicrosoftConfig | null {
  const clientId = optional(source, 'MICROSOFT_CLIENT_ID');
  const clientSecret = optional(source, 'MICROSOFT_CLIENT_SECRET');

  if (clientId === undefined && clientSecret === undefined) return null;
  if (clientId === undefined || clientSecret === undefined) {
    throw new EnvValidationError(
      'MICROSOFT_CLIENT_ID y MICROSOFT_CLIENT_SECRET deben definirse juntas.',
    );
  }

  return {
    tenantId: tenantId(source),
    clientId,
    clientSecret,
    redirectUri: httpUrl(required(source, 'MICROSOFT_REDIRECT_URI'), 'MICROSOFT_REDIRECT_URI'),
    tokenEncryptionKey: tokenEncryptionKey(source),
    linkRedirectUrl: linkRedirectUrl(source),
  };
}

/** Zona horaria IANA con la que se muestran las fechas de las reuniones. */
export function loadMeetingsTimeZone(source: NodeJS.ProcessEnv): string {
  const timeZone = optional(source, 'MEETINGS_TIME_ZONE') ?? DEFAULT_MEETINGS_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('es-CO', { timeZone });
  } catch {
    throw new EnvValidationError('MEETINGS_TIME_ZONE no es una zona horaria IANA válida.');
  }
  return timeZone;
}
