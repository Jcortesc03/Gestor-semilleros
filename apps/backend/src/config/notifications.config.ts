/**
 * Lectura y validación de las variables de entorno de notificaciones.
 * Los valores se recortan y una cadena vacía se considera no definida.
 */
import { EnvValidationError } from './env';
import { WHATSAPP_PROVIDERS } from './notifications.config.types';
import type {
  BuilderBotWhatsAppConfig,
  EmailConfig,
  NotificationsConfig,
  SmtpConfig,
  WhatsAppConfig,
  WhatsAppProviderName,
} from './notifications.config.types';

const EMAIL_TRANSPORTS = ['smtp', 'log', 'disabled'] as const;
const WHATSAPP_TRANSPORTS = ['builderbot', 'log', 'disabled'] as const;

const DEFAULT_EMAIL_TRANSPORT = 'log';
const DEFAULT_WHATSAPP_TRANSPORT = 'log';
const DEFAULT_WHATSAPP_PROVIDER: WhatsAppProviderName = 'baileys';
const DEFAULT_WHATSAPP_SESSION_NAME = 'whatsapp';
const DEFAULT_SMTP_PORT = 587;
const DEFAULT_AUTO_DISPATCH = true;
const DEFAULT_DISPATCH_INTERVAL = 60;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_MAX_DEFER_HOURS = 24;

const MIN_PORT = 1;
const MAX_PORT = 65535;
const MIN_DISPATCH_INTERVAL = 5;
const MAX_DISPATCH_INTERVAL = 3600;
const MIN_MAX_ATTEMPTS = 1;
const MAX_MAX_ATTEMPTS = 20;
const MIN_MAX_DEFER_HOURS = 1;
const MAX_MAX_DEFER_HOURS = 168;

const SESSION_NAME_PATTERN = /^[a-z0-9_-]{1,40}$/;
const PAIRING_PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
/** Separadores que se descartan del teléfono antes de validarlo. */
const PAIRING_PHONE_SEPARATORS = /[\s\-.()]/g;

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

function oneOf<T extends string>(
  raw: string | undefined,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  if (raw === undefined) return fallback;
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  throw new EnvValidationError(`${key} debe ser uno de: ${allowed.join(', ')}.`);
}

function booleanValue(raw: string | undefined, key: string, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new EnvValidationError(`${key} debe ser 'true' o 'false'.`);
}

function integerInRange(
  raw: string | undefined,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new EnvValidationError(`${key} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

function loadEmailConfig(source: NodeJS.ProcessEnv): EmailConfig {
  const transport = oneOf(
    optional(source, 'NOTIFICATIONS_EMAIL_TRANSPORT'),
    'NOTIFICATIONS_EMAIL_TRANSPORT',
    EMAIL_TRANSPORTS,
    DEFAULT_EMAIL_TRANSPORT,
  );

  if (transport !== 'smtp') return { transport };

  const host = required(source, 'SMTP_HOST');

  const port = integerInRange(
    optional(source, 'SMTP_PORT'),
    'SMTP_PORT',
    DEFAULT_SMTP_PORT,
    MIN_PORT,
    MAX_PORT,
  );

  const secure = booleanValue(optional(source, 'SMTP_SECURE'), 'SMTP_SECURE', false);

  const user = optional(source, 'SMTP_USER');
  const password = optional(source, 'SMTP_PASSWORD');
  if (Boolean(user) !== Boolean(password)) {
    throw new EnvValidationError('SMTP_USER y SMTP_PASSWORD deben definirse juntas o ninguna.');
  }

  const from = required(source, 'EMAIL_FROM');
  if (!from.includes('@')) {
    throw new EnvValidationError('EMAIL_FROM debe ser una dirección de correo con «@».');
  }

  const smtp: SmtpConfig = {
    host,
    port,
    secure,
    user: user ?? null,
    password: password ?? null,
    from,
  };

  return { transport: 'smtp', smtp };
}

function loadPairingPhone(source: NodeJS.ProcessEnv): string | null {
  const raw = optional(source, 'WHATSAPP_PAIRING_PHONE');
  if (raw === undefined) return null;

  const normalized = raw.replace(PAIRING_PHONE_SEPARATORS, '');
  if (!PAIRING_PHONE_PATTERN.test(normalized)) {
    throw new EnvValidationError(
      'WHATSAPP_PAIRING_PHONE debe ser un número E.164 con prefijo «+», por ejemplo +573000000001.',
    );
  }

  return normalized;
}

function loadWhatsAppConfig(source: NodeJS.ProcessEnv): WhatsAppConfig {
  const transport = oneOf(
    optional(source, 'NOTIFICATIONS_WHATSAPP_TRANSPORT'),
    'NOTIFICATIONS_WHATSAPP_TRANSPORT',
    WHATSAPP_TRANSPORTS,
    DEFAULT_WHATSAPP_TRANSPORT,
  );

  if (transport !== 'builderbot') return { transport };

  const provider = oneOf(
    optional(source, 'WHATSAPP_PROVIDER'),
    'WHATSAPP_PROVIDER',
    WHATSAPP_PROVIDERS,
    DEFAULT_WHATSAPP_PROVIDER,
  );

  const sessionName = optional(source, 'WHATSAPP_SESSION_NAME') ?? DEFAULT_WHATSAPP_SESSION_NAME;
  if (!SESSION_NAME_PATTERN.test(sessionName)) {
    throw new EnvValidationError(
      'WHATSAPP_SESSION_NAME debe tener entre 1 y 40 caracteres: minúsculas, dígitos, guiones y guiones bajos.',
    );
  }

  const builderbot: BuilderBotWhatsAppConfig = {
    provider,
    sessionName,
    pairingPhone: loadPairingPhone(source),
  };

  return { transport: 'builderbot', builderbot };
}

export function loadNotificationsConfig(source: NodeJS.ProcessEnv): NotificationsConfig {
  return {
    email: loadEmailConfig(source),
    whatsapp: loadWhatsAppConfig(source),
    autoDispatch: booleanValue(
      optional(source, 'NOTIFICATIONS_AUTO_DISPATCH'),
      'NOTIFICATIONS_AUTO_DISPATCH',
      DEFAULT_AUTO_DISPATCH,
    ),
    dispatchIntervalSeconds: integerInRange(
      optional(source, 'NOTIFICATIONS_DISPATCH_INTERVAL'),
      'NOTIFICATIONS_DISPATCH_INTERVAL',
      DEFAULT_DISPATCH_INTERVAL,
      MIN_DISPATCH_INTERVAL,
      MAX_DISPATCH_INTERVAL,
    ),
    maxAttempts: integerInRange(
      optional(source, 'NOTIFICATIONS_MAX_ATTEMPTS'),
      'NOTIFICATIONS_MAX_ATTEMPTS',
      DEFAULT_MAX_ATTEMPTS,
      MIN_MAX_ATTEMPTS,
      MAX_MAX_ATTEMPTS,
    ),
    maxDeferHours: integerInRange(
      optional(source, 'NOTIFICATIONS_MAX_DEFER_HOURS'),
      'NOTIFICATIONS_MAX_DEFER_HOURS',
      DEFAULT_MAX_DEFER_HOURS,
      MIN_MAX_DEFER_HOURS,
      MAX_MAX_DEFER_HOURS,
    ),
  };
}
