import { ProgressStatus, WorkResult } from '../../../generated/prisma/enums';
import {
  asObject,
  fail,
  isUuid,
  ok,
  parseDateOnly,
  parseEnum,
  parseRequiredText,
  unknownFieldsError,
  ValidationResult,
} from '../../../common/utils/validation';

/** Cuerpo validado de creación de un tablero. */
export interface CreateBoardDto {
  title: string;
  dueDate: Date;
  responsibleTutorId: string;
  responsibleStudentId: string;
}

/** Cuerpo validado de actualización de un tablero (solo campos presentes). */
export interface UpdateBoardDto {
  title?: string;
  dueDate?: Date;
  progressStatus?: ProgressStatus;
  result?: WorkResult | null;
  responsibleTutorId?: string;
  responsibleStudentId?: string;
}

const MAX_TITLE_LENGTH = 200;
const CREATE_ALLOWED_FIELDS = ['title', 'dueDate', 'responsibleTutorId', 'responsibleStudentId'] as const;
const UPDATE_ALLOWED_FIELDS = [
  'title',
  'dueDate',
  'progressStatus',
  'result',
  'responsibleTutorId',
  'responsibleStudentId',
] as const;

function titleError(value: unknown): string {
  return typeof value === 'string' && value.trim().length > MAX_TITLE_LENGTH
    ? `title admite como máximo ${MAX_TITLE_LENGTH} caracteres.`
    : 'title es obligatorio.';
}

function enumError(field: string, values: Record<string, string>): string {
  return `${field} no es válido. Valores permitidos: ${Object.values(values).join(', ')}.`;
}

/** Valida un UUID obligatorio, acumulando el error correspondiente. */
function requiredUuid(value: unknown, field: string, errors: string[]): string | null {
  if (value === undefined) {
    errors.push(`${field} es obligatorio.`);
    return null;
  }
  if (!isUuid(value)) {
    errors.push(`${field} debe ser un UUID válido.`);
    return null;
  }
  return value;
}

/** Valida un UUID opcional (solo se procesa si está presente). */
function optionalUuid(value: unknown, field: string, errors: string[]): string | null {
  if (!isUuid(value)) {
    errors.push(`${field} debe ser un UUID válido.`);
    return null;
  }
  return value;
}

/** Valida y normaliza la entrada de creación de tableros. */
export function parseCreateBoard(input: unknown): ValidationResult<CreateBoardDto> {
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

  let dueDate: Date | null = null;
  if (body.dueDate === undefined) {
    errors.push('dueDate es obligatorio.');
  } else {
    dueDate = parseDateOnly(body.dueDate);
    if (dueDate === null) errors.push('dueDate debe tener formato AAAA-MM-DD.');
  }

  const responsibleTutorId = requiredUuid(body.responsibleTutorId, 'responsibleTutorId', errors);
  const responsibleStudentId = requiredUuid(body.responsibleStudentId, 'responsibleStudentId', errors);

  if (errors.length > 0) return fail(errors);
  return ok({
    title,
    dueDate: dueDate as Date,
    responsibleTutorId: responsibleTutorId as string,
    responsibleStudentId: responsibleStudentId as string,
  });
}

/** Valida y normaliza la entrada de actualización de tableros. */
export function parseUpdateBoard(input: unknown): ValidationResult<UpdateBoardDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknownFields = unknownFieldsError(body, UPDATE_ALLOWED_FIELDS);
  if (unknownFields !== null) errors.push(unknownFields);

  const dto: UpdateBoardDto = {};
  let hasField = false;

  if (body.title !== undefined) {
    hasField = true;
    const parsed = parseRequiredText(body.title, MAX_TITLE_LENGTH);
    if (parsed === null) errors.push(titleError(body.title));
    else dto.title = parsed;
  }

  if (body.dueDate !== undefined) {
    hasField = true;
    const parsed = parseDateOnly(body.dueDate);
    if (parsed === null) errors.push('dueDate debe tener formato AAAA-MM-DD.');
    else dto.dueDate = parsed;
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

  if (body.responsibleTutorId !== undefined) {
    hasField = true;
    const parsed = optionalUuid(body.responsibleTutorId, 'responsibleTutorId', errors);
    if (parsed !== null) dto.responsibleTutorId = parsed;
  }

  if (body.responsibleStudentId !== undefined) {
    hasField = true;
    const parsed = optionalUuid(body.responsibleStudentId, 'responsibleStudentId', errors);
    if (parsed !== null) dto.responsibleStudentId = parsed;
  }

  if (!hasField) errors.push('Debe indicar al menos un campo para actualizar.');

  if (errors.length > 0) return fail(errors);
  return ok(dto);
}
