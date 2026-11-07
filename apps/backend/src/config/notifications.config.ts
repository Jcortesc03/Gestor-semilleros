/**
 * Lectura y validación de las variables de entorno de notificaciones.
 * Los valores se recortan y una cadena vacía se considera no definida.
 */
import { EnvValidationError } from './env';
import type {
  EmailConfig,
  NotificationsConfig,
  SmtpConfig,
  WhatsAppCloudConfig,
  WhatsAppConfig,
} from './notifications.config.types';

const EMAIL_TRANSPORTS = ['smtp', 'log', 'disabled'] as const;
const WHATSAPP_TRANSPORTS = ['cloud-api', 'log', 'disabled'] as const;

const DEFAULT_EMAIL_TRANSPORT = 'log';
const DEFAULT_WHATSAPP_TRANSPORT = 'log';
const DEFAULT_SMTP_PORT = 587;
const DEFAULT_TEMPLATE_LANGUAGE = 'es';
const DEFAULT_AUTO_DISPATCH = true;
const DEFAULT_DISPATCH_INTERVAL = 60;
const DEFAULT_MAX_ATTEMPTS = 5;

const MIN_PORT = 1;
const MAX_PORT = 65535;
const MIN_DISPATCH_INTERVAL = 5;
const MAX_DISPATCH_INTERVAL = 3600;
const MIN_MAX_ATTEMPTS = 1;
const MAX_MAX_ATTEMPTS = 20;

const API_VERSION_PATTERN = /^v\d+\.\d+$/;
const PHONE_NUMBER_ID_PATTERN = /^\d+$/;
const TEMPLATE_NAME_PATTERN = /^[a-z0-9_]+$/;
const TEMPLATE_LANGUAGE_PATTERN = /^[a-z]{2,3}(_[A-Z]{2})?$/;

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

function loadWhatsAppConfig(source: NodeJS.ProcessEnv): WhatsAppConfig {
  const transport = oneOf(
    optional(source, 'NOTIFICATIONS_WHATSAPP_TRANSPORT'),
    'NOTIFICATIONS_WHATSAPP_TRANSPORT',
    WHATSAPP_TRANSPORTS,
    DEFAULT_WHATSAPP_TRANSPORT,
  );

  if (transport !== 'cloud-api') return { transport };

  const apiVersion = required(source, 'WHATSAPP_API_VERSION');
  if (!API_VERSION_PATTERN.test(apiVersion)) {
    throw new EnvValidationError(
      'WHATSAPP_API_VERSION debe tener el formato v<mayor>.<menor>, por ejemplo v21.0.',
    );
  }

  const phoneNumberId = required(source, 'WHATSAPP_PHONE_NUMBER_ID');
  if (!PHONE_NUMBER_ID_PATTERN.test(phoneNumberId)) {
    throw new EnvValidationError('WHATSAPP_PHONE_NUMBER_ID debe contener solo dígitos.');
  }

  const accessToken = required(source, 'WHATSAPP_ACCESS_TOKEN');

  const templateName = required(source, 'WHATSAPP_TEMPLATE_NAME');
  if (!TEMPLATE_NAME_PATTERN.test(templateName)) {
    throw new EnvValidationError(
      'WHATSAPP_TEMPLATE_NAME debe contener solo minúsculas, dígitos y guiones bajos.',
    );
  }

  const templateLanguage =
    optional(source, 'WHATSAPP_TEMPLATE_LANGUAGE') ?? DEFAULT_TEMPLATE_LANGUAGE;
  if (!TEMPLATE_LANGUAGE_PATTERN.test(templateLanguage)) {
    throw new EnvValidationError(
      'WHATSAPP_TEMPLATE_LANGUAGE debe tener el formato "es" o "es_CO".',
    );
  }

  const cloud: WhatsAppCloudConfig = {
    apiVersion,
    phoneNumberId,
    accessToken,
    templateName,
    templateLanguage,
  };

  return { transport: 'cloud-api', cloud };
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
  };
}
