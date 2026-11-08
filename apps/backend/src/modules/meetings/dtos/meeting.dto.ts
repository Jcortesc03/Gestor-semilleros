import { MeetingStatus } from '../../../generated/prisma/enums';
import {
  asObject,
  fail,
  isUuid,
  ok,
  parseEnum,
  parseRequiredText,
  unknownFieldsError,
  ValidationResult,
} from '../../../common/utils/validation';

export const MIN_DURATION = 5;
export const MAX_DURATION = 480;
export const MAX_PARTICIPANTS = 100;

const MAX_REASON_LENGTH = 200;
const MAX_COMMENT_LENGTH = 500;
const MAX_RECORDING_URL_LENGTH = 2000;
export const MAX_JOIN_URL_LENGTH = 2048;
const DEFAULT_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const MIN_START_OFFSET_MS = 60_000;

const CREATE_ALLOWED_FIELDS = ['reason', 'startsAt', 'durationMinutes', 'projectId', 'participantIds', 'joinUrl'] as const;
const CHANGE_STATUS_ALLOWED_FIELDS = ['status', 'comment'] as const;
const RECORDING_ALLOWED_FIELDS = ['recordingUrl'] as const;
const LIST_ALLOWED_FIELDS = ['status', 'from', 'to', 'limit'] as const;

/** Fecha y hora ISO 8601 con zona explícita (Z o ±HH:MM). */
const ISO_DATE_TIME_WITH_ZONE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;

const MANUAL_STATUSES = {
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED: 'FINISHED',
  CANCELLED: 'CANCELLED',
} as const;

const BODY_ERROR = 'El cuerpo debe ser un objeto JSON.';
const REASON_ERROR = `reason es obligatorio (máximo ${MAX_REASON_LENGTH} caracteres).`;
const START_FORMAT_ERROR =
  'startsAt debe ser una fecha y hora ISO 8601 con zona horaria, p. ej. 2026-11-20T15:00:00-05:00.';
const FUTURE_ERROR = 'startsAt debe ser una fecha futura.';
const DURATION_ERROR = `durationMinutes debe ser un entero entre ${MIN_DURATION} y ${MAX_DURATION}.`;
const PROJECT_ERROR = 'projectId debe ser un UUID.';
const PARTICIPANTS_ERROR = `participantIds debe ser una lista de 1 a ${MAX_PARTICIPANTS} UUID de usuarios.`;
const JOIN_URL_ERROR = `joinUrl debe ser un enlace https:// de hasta ${MAX_JOIN_URL_LENGTH} caracteres.`;
const STATUS_ERROR = 'status debe ser IN_PROGRESS, FINISHED o CANCELLED.';
const COMMENT_ERROR = `comment admite como máximo ${MAX_COMMENT_LENGTH} caracteres.`;
const RECORDING_ERROR = 'recordingUrl debe ser una URL http(s) válida o null.';
const FROM_ERROR = 'from debe ser una fecha ISO 8601.';
const TO_ERROR = 'to debe ser una fecha ISO 8601.';
const RANGE_ERROR = 'to no puede ser anterior a from.';
const LIMIT_ERROR = `limit debe ser un entero entre ${MIN_LIMIT} y ${MAX_LIMIT}.`;
const LIST_STATUS_ERROR = `status no es válido. Valores permitidos: ${Object.values(MeetingStatus).join(', ')}.`;

/** Cuerpo validado de creación de una reunión. */
export interface CreateMeetingDto {
  reason: string;
  startsAt: Date;
  durationMinutes: number;
  projectId: string | null;
  participantIds: string[];
  /** Enlace aportado por el organizador (obligatorio con cuenta personal, prohibido con laboral). */
  joinUrl: string | null;
}

/** Estados que se pueden fijar manualmente (el alta crea `SCHEDULED`). */
export type ManualMeetingStatus = 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';

/** Cuerpo validado del cambio manual de estado de una reunión. */
export interface ChangeMeetingStatusDto {
  status: ManualMeetingStatus;
  comment: string | null;
}

/** Cuerpo validado del registro del enlace de grabación. */
export interface RecordingDto {
  recordingUrl: string | null;
}

/** Parámetros validados del listado de reuniones. */
export interface ListMeetingsQuery {
  status?: MeetingStatus;
  from?: Date;
  to?: Date;
  limit: number;
}

/**
 * Convierte un texto ISO 8601 con zona explícita en una fecha, o `null` si el formato o la fecha
 * no son válidos. Se comprueban los componentes para rechazar fechas inexistentes (p. ej. 30 de febrero).
 */
function parseStartsAt(value: unknown): Date | null {
  if (typeof value !== 'string') return null;

  const match = ISO_DATE_TIME_WITH_ZONE.exec(value);
  if (match === null) return null;

  const [, year, month, day, hour, minute, second = '0', fraction = '0', zone] = match;
  const milliseconds = Number(fraction.padEnd(3, '0'));
  const wallClock = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  );
  const check = new Date(wallClock);
  const validDate =
    check.getUTCFullYear() === Number(year) &&
    check.getUTCMonth() === Number(month) - 1 &&
    check.getUTCDate() === Number(day) &&
    check.getUTCHours() === Number(hour) &&
    check.getUTCMinutes() === Number(minute) &&
    check.getUTCSeconds() === Number(second) &&
    check.getUTCMilliseconds() === milliseconds;
  if (!validDate) return null;

  if (zone === 'Z') return new Date(wallClock);

  const sign = zone.startsWith('-') ? -1 : 1;
  const offsetHours = Number(zone.slice(1, 3));
  const offsetMinutes = Number(zone.slice(4, 6));
  if (offsetHours > 23 || offsetMinutes > 59) return null;

  return new Date(wallClock - sign * (offsetHours * 60 + offsetMinutes) * 60_000);
}

/** Indica si el texto es una URL absoluta con esquema http o https. */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Valida y normaliza la entrada de creación de reuniones. */
export function parseCreateMeeting(input: unknown, now: Date = new Date()): ValidationResult<CreateMeetingDto> {
  const body = asObject(input);
  if (body === null) return fail([BODY_ERROR]);

  const errors: string[] = [];
  const unknownFields = unknownFieldsError(body, CREATE_ALLOWED_FIELDS);
  if (unknownFields !== null) errors.push(unknownFields);

  let reason = '';
  const parsedReason = parseRequiredText(body.reason, MAX_REASON_LENGTH);
  if (parsedReason === null) errors.push(REASON_ERROR);
  else reason = parsedReason;

  let startsAt: Date | null = null;
  const parsedStart = parseStartsAt(body.startsAt);
  if (parsedStart === null) {
    errors.push(START_FORMAT_ERROR);
  } else if (parsedStart.getTime() - now.getTime() < MIN_START_OFFSET_MS) {
    errors.push(FUTURE_ERROR);
  } else {
    startsAt = parsedStart;
  }

  let durationMinutes = 0;
  const rawDuration = body.durationMinutes;
  if (
    typeof rawDuration !== 'number' ||
    !Number.isInteger(rawDuration) ||
    rawDuration < MIN_DURATION ||
    rawDuration > MAX_DURATION
  ) {
    errors.push(DURATION_ERROR);
  } else {
    durationMinutes = rawDuration;
  }

  let projectId: string | null = null;
  if (body.projectId !== undefined && body.projectId !== null) {
    if (!isUuid(body.projectId)) errors.push(PROJECT_ERROR);
    else projectId = body.projectId;
  }

  let participantIds: string[] = [];
  if (body.participantIds === undefined || !Array.isArray(body.participantIds)) {
    errors.push(PARTICIPANTS_ERROR);
  } else {
    const rawParticipants = body.participantIds;
    if (
      rawParticipants.length < 1 ||
      rawParticipants.length > MAX_PARTICIPANTS ||
      !rawParticipants.every(isUuid)
    ) {
      errors.push(PARTICIPANTS_ERROR);
    } else {
      participantIds = [...new Set<string>(rawParticipants as string[])];
    }
  }

  let joinUrl: string | null = null;
  if (body.joinUrl !== undefined && body.joinUrl !== null) {
    const raw = body.joinUrl;
    if (typeof raw === 'string' && raw.length <= MAX_JOIN_URL_LENGTH && isHttpUrl(raw) && new URL(raw).protocol === 'https:') {
      joinUrl = raw;
    } else {
      errors.push(JOIN_URL_ERROR);
    }
  }

  if (errors.length > 0) return fail(errors);
  return ok({
    reason,
    startsAt: startsAt as Date,
    durationMinutes,
    projectId,
    participantIds,
    joinUrl,
  });
}

/** Valida y normaliza el cambio manual de estado de una reunión. */
export function parseChangeMeetingStatus(input: unknown): ValidationResult<ChangeMeetingStatusDto> {
  const body = asObject(input);
  if (body === null) return fail([BODY_ERROR]);

  const errors: string[] = [];
  const unknownFields = unknownFieldsError(body, CHANGE_STATUS_ALLOWED_FIELDS);
  if (unknownFields !== null) errors.push(unknownFields);

  const status = parseEnum(body.status, MANUAL_STATUSES);
  if (status === null) errors.push(STATUS_ERROR);

  let comment: string | null = null;
  if (body.comment !== undefined && body.comment !== null) {
    if (typeof body.comment !== 'string') {
      errors.push(COMMENT_ERROR);
    } else {
      const trimmed = body.comment.trim();
      if (trimmed.length > MAX_COMMENT_LENGTH) errors.push(COMMENT_ERROR);
      else if (trimmed.length > 0) comment = trimmed;
    }
  }

  if (errors.length > 0) return fail(errors);
  return ok({ status: status as ManualMeetingStatus, comment });
}

/** Valida y normaliza el registro del enlace de grabación (null para borrarlo). */
export function parseRecording(input: unknown): ValidationResult<RecordingDto> {
  const body = asObject(input);
  if (body === null) return fail([BODY_ERROR]);

  const errors: string[] = [];
  const unknownFields = unknownFieldsError(body, RECORDING_ALLOWED_FIELDS);
  if (unknownFields !== null) errors.push(unknownFields);

  let recordingUrl: string | null = null;
  const raw = body.recordingUrl;
  if (raw === undefined) {
    errors.push(RECORDING_ERROR);
  } else if (raw !== null) {
    if (typeof raw === 'string' && raw.length <= MAX_RECORDING_URL_LENGTH && isHttpUrl(raw)) {
      recordingUrl = raw;
    } else {
      errors.push(RECORDING_ERROR);
    }
  }

  if (errors.length > 0) return fail(errors);
  return ok({ recordingUrl });
}

/** Valida y normaliza los parámetros de listado (`req.query`, valores string). */
export function parseListMeetings(query: unknown): ValidationResult<ListMeetingsQuery> {
  const raw = query === undefined || query === null ? {} : query;
  const body = asObject(raw);
  if (body === null) return fail([BODY_ERROR]);

  const errors: string[] = [];
  const unknownFields = unknownFieldsError(body, LIST_ALLOWED_FIELDS);
  if (unknownFields !== null) errors.push(unknownFields);

  let status: MeetingStatus | undefined;
  if (body.status !== undefined) {
    const parsed = parseEnum(body.status, MeetingStatus);
    if (parsed === null) errors.push(LIST_STATUS_ERROR);
    else status = parsed;
  }

  let from: Date | undefined;
  if (body.from !== undefined) {
    const parsed = typeof body.from === 'string' ? Date.parse(body.from) : Number.NaN;
    if (Number.isNaN(parsed)) errors.push(FROM_ERROR);
    else from = new Date(parsed);
  }

  let to: Date | undefined;
  if (body.to !== undefined) {
    const parsed = typeof body.to === 'string' ? Date.parse(body.to) : Number.NaN;
    if (Number.isNaN(parsed)) errors.push(TO_ERROR);
    else to = new Date(parsed);
  }

  if (from !== undefined && to !== undefined && to.getTime() < from.getTime()) errors.push(RANGE_ERROR);

  let limit = DEFAULT_LIMIT;
  if (body.limit !== undefined) {
    const parsed = typeof body.limit === 'string' && /^\d+$/.test(body.limit) ? Number(body.limit) : Number.NaN;
    if (!Number.isInteger(parsed) || parsed < MIN_LIMIT || parsed > MAX_LIMIT) errors.push(LIMIT_ERROR);
    else limit = parsed;
  }

  if (errors.length > 0) return fail(errors);

  const result: ListMeetingsQuery = { limit };
  if (status !== undefined) result.status = status;
  if (from !== undefined) result.from = from;
  if (to !== undefined) result.to = to;
  return ok(result);
}
