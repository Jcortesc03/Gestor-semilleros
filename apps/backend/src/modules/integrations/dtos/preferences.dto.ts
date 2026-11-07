import { NotificationKind, NotificationChannel } from '../../../generated/prisma/enums';
import {
  asObject,
  fail,
  ok,
  parseEnum,
  unknownFieldsError,
  type ValidationResult,
} from '../../../common/utils/validation';

/** Cambio puntual de preferencia para una combinación (kind, channel). */
export interface PreferenceChangeDto {
  kind: NotificationKind;
  channel: NotificationChannel;
  enabled: boolean;
}

/** Cuerpo validado de actualización de preferencias de notificación. */
export interface UpdatePreferencesDto {
  phone?: string | null;
  preferences?: PreferenceChangeDto[];
}

/** Teléfono internacional E.164: `+`, primer dígito 1-9 y entre 7 y 14 dígitos más. */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

const UPDATE_FIELDS = ['phone', 'preferences'] as const;
const PREFERENCE_FIELDS: readonly string[] = ['kind', 'channel', 'enabled'];
const MIN_PREFERENCES = 1;
/** Matriz completa: 5 tipos (NotificationKind) × 2 canales. */
const MAX_PREFERENCES = 10;

const PHONE_ERROR = 'phone debe estar en formato internacional E.164, p. ej. +573001234567.';
const PREFERENCES_ERROR = `preferences debe ser una lista de ${MIN_PREFERENCES} a ${MAX_PREFERENCES} elementos.`;
const DUPLICATE_ERROR = 'preferences contiene combinaciones repetidas de kind y channel.';
const NO_FIELDS_ERROR = 'Debe indicar al menos un campo para actualizar.';

/** Quita espacios, guiones, puntos y paréntesis; devuelve el valor si cumple E.164 o `null`. */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\s\-().]/g, '');
  return E164_PATTERN.test(normalized) ? normalized : null;
}

function kindError(index: number): string {
  return `preferences[${index}].kind no es válido. Valores permitidos: ${Object.values(NotificationKind).join(', ')}.`;
}

function channelError(index: number): string {
  return `preferences[${index}].channel no es válido. Valores permitidos: ${Object.values(NotificationChannel).join(', ')}.`;
}

/** Valida un elemento de `preferences`, acumulando sus errores. */
function parsePreferenceChange(item: unknown, index: number, errors: string[]): PreferenceChangeDto | null {
  const prefix = `preferences[${index}]`;
  const body = asObject(item);
  if (body === null) {
    errors.push(`${prefix} debe ser un objeto.`);
    return null;
  }

  const extra = Object.keys(body).filter((key) => !PREFERENCE_FIELDS.includes(key));
  if (extra.length > 0) errors.push(`${prefix}: campos no permitidos: ${extra.join(', ')}.`);

  let kind: NotificationKind | null = null;
  if (body.kind === undefined) {
    errors.push(`${prefix}.kind es obligatorio.`);
  } else {
    kind = parseEnum(body.kind, NotificationKind);
    if (kind === null) errors.push(kindError(index));
  }

  let channel: NotificationChannel | null = null;
  if (body.channel === undefined) {
    errors.push(`${prefix}.channel es obligatorio.`);
  } else {
    channel = parseEnum(body.channel, NotificationChannel);
    if (channel === null) errors.push(channelError(index));
  }

  let enabled: boolean | null = null;
  if (body.enabled === undefined) {
    errors.push(`${prefix}.enabled es obligatorio.`);
  } else if (typeof body.enabled !== 'boolean') {
    errors.push(`${prefix}.enabled debe ser un booleano.`);
  } else {
    enabled = body.enabled;
  }

  if (kind === null || channel === null || enabled === null) return null;
  return { kind, channel, enabled };
}

/** Valida y normaliza la entrada de actualización de preferencias. */
export function parseUpdatePreferences(input: unknown): ValidationResult<UpdatePreferencesDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(body, UPDATE_FIELDS);
  if (unknown !== null) errors.push(unknown);

  const dto: UpdatePreferencesDto = {};
  let hasField = false;

  if (body.phone !== undefined) {
    hasField = true;
    if (body.phone === null) {
      dto.phone = null;
    } else {
      const normalized = normalizePhone(body.phone);
      if (normalized === null) errors.push(PHONE_ERROR);
      else dto.phone = normalized;
    }
  }

  if (body.preferences !== undefined) {
    hasField = true;
    if (
      !Array.isArray(body.preferences) ||
      body.preferences.length < MIN_PREFERENCES ||
      body.preferences.length > MAX_PREFERENCES
    ) {
      errors.push(PREFERENCES_ERROR);
    } else {
      const parsed: PreferenceChangeDto[] = [];
      body.preferences.forEach((item, index) => {
        const preference = parsePreferenceChange(item, index, errors);
        if (preference !== null) parsed.push(preference);
      });

      const seen = new Set<string>();
      let duplicated = false;
      for (const preference of parsed) {
        const key = `${preference.kind}:${preference.channel}`;
        if (seen.has(key)) duplicated = true;
        seen.add(key);
      }
      if (duplicated) errors.push(DUPLICATE_ERROR);

      dto.preferences = parsed;
    }
  }

  if (!hasField) errors.push(NO_FIELDS_ERROR);
  if (errors.length > 0) return fail(errors);
  return ok(dto);
}
