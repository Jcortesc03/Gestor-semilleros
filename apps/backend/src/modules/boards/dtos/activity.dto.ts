import { ApprovalStatus, ProgressStatus, WorkResult } from '../../../generated/prisma/enums';
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

/** Cuerpo validado de creación de una actividad. */
export interface CreateActivityDto {
  title: string;
  description: string | null;
}

/** Cuerpo validado de actualización de una actividad (solo campos presentes). */
export interface UpdateActivityDto {
  title?: string;
  description?: string | null;
  progressStatus?: ProgressStatus;
  result?: WorkResult | null;
}

/** Cuerpo validado para aprobar o rechazar una actividad. */
export interface ApprovalDto {
  status: ApprovalStatus;
}

/** Cuerpo validado para asignar un responsable a una actividad. */
export interface AssigneeDto {
  userId: string;
}

/** Cuerpo validado para adjuntar un enlace a una actividad. */
export interface AttachmentLinkDto {
  url: string;
}

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_URL_LENGTH = 2048;

const CREATE_ALLOWED_FIELDS = ['title', 'description'] as const;
const UPDATE_ALLOWED_FIELDS = ['title', 'description', 'progressStatus', 'result'] as const;
const APPROVAL_ALLOWED_FIELDS = ['status'] as const;
const ASSIGNEE_ALLOWED_FIELDS = ['userId'] as const;
const ATTACHMENT_LINK_ALLOWED_FIELDS = ['url'] as const;

function titleError(value: unknown): string {
  return typeof value === 'string' && value.trim().length > MAX_TITLE_LENGTH
    ? `title admite como máximo ${MAX_TITLE_LENGTH} caracteres.`
    : 'title es obligatorio.';
}

function enumError(field: string, values: Record<string, string>): string {
  return `${field} no es válido. Valores permitidos: ${Object.values(values).join(', ')}.`;
}

/**
 * Normaliza una descripción opcional: `null` o vacía se convierten en `null`,
 * el texto se recorta y se limita a `MAX_DESCRIPTION_LENGTH` caracteres.
 */
function parseDescription(value: unknown, errors: string[]): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    errors.push('description debe ser texto.');
    return null;
  }
  const text = value.trim();
  if (text.length === 0) return null;
  if (text.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description admite como máximo ${MAX_DESCRIPTION_LENGTH} caracteres.`);
    return null;
  }
  return text;
}

/** Valida y normaliza la entrada de creación de actividades. */
export function parseCreateActivity(input: unknown): ValidationResult<CreateActivityDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknownFields = unknownFieldsError(body, CREATE_ALLOWED_FIELDS);
  if (unknownFields !== null) errors.push(unknownFields);

  let title = '';
  if (body.title === undefined) {
    errors.push('title es obligatorio.');
  } else {
    const parsed = parseRequiredText(body.title, MAX_TITLE_LENGTH);
    if (parsed === null) errors.push(titleError(body.title));
    else title = parsed;
  }

  const description = body.description === undefined ? null : parseDescription(body.description, errors);

  if (errors.length > 0) return fail(errors);
  return ok({ title, description });
}

/** Valida y normaliza la entrada de actualización de actividades. */
export function parseUpdateActivity(input: unknown): ValidationResult<UpdateActivityDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknownFields = unknownFieldsError(body, UPDATE_ALLOWED_FIELDS);
  if (unknownFields !== null) errors.push(unknownFields);

  const dto: UpdateActivityDto = {};
  let hasField = false;

  if (body.title !== undefined) {
    hasField = true;
    const parsed = parseRequiredText(body.title, MAX_TITLE_LENGTH);
    if (parsed === null) errors.push(titleError(body.title));
    else dto.title = parsed;
  }

  if (body.description !== undefined) {
    hasField = true;
    dto.description = parseDescription(body.description, errors);
  }

  if (body.progressStatus !== undefined) {
    hasField = true;
    const parsed = parseEnum(body.progressStatus, ProgressStatus);
    if (parsed === null) errors.push(enumError('progressStatus', ProgressStatus));
    else dto.progressStatus = parsed;
  }

  if (body.result !== undefined) {
    hasField = true;
    if (body.result === null) {
      dto.result = null;
    } else {
      const parsed = parseEnum(body.result, WorkResult);
      if (parsed === null) errors.push(enumError('result', WorkResult));
      else dto.result = parsed;
    }
  }

  if (!hasField) errors.push('Debe indicar al menos un campo para actualizar.');

  if (errors.length > 0) return fail(errors);
  return ok(dto);
}

/** Valida el estado de aprobación de una actividad. */
export function parseApproval(input: unknown): ValidationResult<ApprovalDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknownFields = unknownFieldsError(body, APPROVAL_ALLOWED_FIELDS);
  if (unknownFields !== null) errors.push(unknownFields);

  let status: ApprovalStatus | null = null;
  if (body.status === undefined) {
    errors.push('status es obligatorio.');
  } else {
    status = parseEnum(body.status, ApprovalStatus);
    if (status === null) errors.push(enumError('status', ApprovalStatus));
  }

  if (errors.length > 0) return fail(errors);
  return ok({ status: status as ApprovalStatus });
}

/** Valida el usuario asignado a una actividad. */
export function parseAssignee(input: unknown): ValidationResult<AssigneeDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknownFields = unknownFieldsError(body, ASSIGNEE_ALLOWED_FIELDS);
  if (unknownFields !== null) errors.push(unknownFields);

  let userId: string | null = null;
  if (body.userId === undefined) {
    errors.push('userId es obligatorio.');
  } else if (!isUuid(body.userId)) {
    errors.push('userId debe ser un UUID válido.');
  } else {
    userId = body.userId;
  }

  if (errors.length > 0) return fail(errors);
  return ok({ userId: userId as string });
}

/** Valida un enlace http(s) para adjuntar a una actividad. */
export function parseAttachmentLink(input: unknown): ValidationResult<AttachmentLinkDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknownFields = unknownFieldsError(body, ATTACHMENT_LINK_ALLOWED_FIELDS);
  if (unknownFields !== null) errors.push(unknownFields);

  let url: string | null = null;
  if (typeof body.url !== 'string' || body.url.trim().length === 0) {
    errors.push('url es obligatoria.');
  } else {
    const text = body.url.trim();
    let isValid = false;
    try {
      const parsed = new URL(text);
      isValid = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      isValid = false;
    }
    if (text.length > MAX_URL_LENGTH) {
      errors.push(`url admite como máximo ${MAX_URL_LENGTH} caracteres.`);
    }
    if (!isValid) {
      errors.push('url debe ser un enlace http(s) válido.');
    } else if (text.length <= MAX_URL_LENGTH) {
      url = text;
    }
  }

  if (errors.length > 0) return fail(errors);
  return ok({ url: url as string });
}
