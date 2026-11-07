import { ProjectStatus } from '../../../generated/prisma/enums';
import {
  asObject,
  fail,
  isUuid,
  ok,
  parseDateOnly,
  parseEnum,
  parseRequiredText,
  unknownFieldsError,
  type ValidationResult,
} from '../../../common/utils/validation';

/** Cuerpo validado de POST /api/projects. */
export interface CreateProjectDto {
  title: string;
  description: string | null;
  areaId: string;
  facultyIds: string[];
  startsOn: Date | null;
  endsOn: Date | null;
}

/** Campos editables de un proyecto (actualización parcial). */
export interface UpdateProjectDto {
  title?: string;
  description?: string | null;
  areaId?: string;
  facultyIds?: string[];
  status?: ProjectStatus;
  startsOn?: Date | null;
  endsOn?: Date | null;
}

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const CREATE_FIELDS = ['title', 'description', 'areaId', 'facultyIds', 'startsOn', 'endsOn'] as const;
const UPDATE_FIELDS = [...CREATE_FIELDS, 'status'] as const;
const TITLE_ERROR = `title es obligatorio (máximo ${MAX_TITLE_LENGTH} caracteres).`;
const AREA_ERROR = 'areaId debe ser un UUID.';
const FACULTY_ERROR = 'facultyIds debe ser una lista con al menos un UUID de facultad.';
const DATE_ORDER_ERROR = 'endsOn no puede ser anterior a startsOn.';
const NO_FIELDS_ERROR = 'Debe indicar al menos un campo para actualizar.';

interface ParsedDescription {
  value: string | null;
  error: string | null;
}

/** `description` opcional: se recorta; vacía, ausente o null se guardan como null. */
function parseDescription(value: unknown): ParsedDescription {
  if (value === undefined || value === null) return { value: null, error: null };
  if (typeof value !== 'string') return { value: null, error: 'description debe ser texto.' };
  const text = value.trim();
  if (text.length > MAX_DESCRIPTION_LENGTH) {
    return { value: null, error: `description admite como máximo ${MAX_DESCRIPTION_LENGTH} caracteres.` };
  }
  return { value: text.length === 0 ? null : text, error: null };
}

/** `facultyIds` obligatorio en el alta: arreglo no vacío de UUID, sin duplicados y en orden. */
function parseFacultyIds(value: unknown): { value: string[]; error: string | null } {
  if (!Array.isArray(value) || value.length === 0) return { value: [], error: FACULTY_ERROR };
  const ids: string[] = [];
  for (const item of value) {
    if (!isUuid(item)) return { value: [], error: FACULTY_ERROR };
    if (!ids.includes(item)) ids.push(item);
  }
  return { value: ids, error: null };
}

/** Fecha 'YYYY-MM-DD' opcional o null; agrega el error correspondiente si no es válida. */
function parseOptionalDate(value: unknown, field: 'startsOn' | 'endsOn', errors: string[]): Date | null {
  if (value === undefined || value === null) return null;
  const date = parseDateOnly(value);
  if (date === null) errors.push(`${field} debe ser una fecha válida con formato YYYY-MM-DD.`);
  return date;
}

/** Valida y normaliza la entrada de creación. Devuelve todos los errores encontrados, en español. */
export function parseCreateProject(input: unknown): ValidationResult<CreateProjectDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(body, CREATE_FIELDS);
  if (unknown !== null) errors.push(unknown);

  let title = '';
  const parsedTitle = parseRequiredText(body.title, MAX_TITLE_LENGTH);
  if (parsedTitle === null) errors.push(TITLE_ERROR);
  else title = parsedTitle;

  const description = parseDescription(body.description);
  if (description.error !== null) errors.push(description.error);

  let areaId = '';
  if (isUuid(body.areaId)) areaId = body.areaId;
  else errors.push(AREA_ERROR);

  const parsedFacultyIds = parseFacultyIds(body.facultyIds);
  if (parsedFacultyIds.error !== null) errors.push(parsedFacultyIds.error);

  const startsOn = parseOptionalDate(body.startsOn, 'startsOn', errors);
  const endsOn = parseOptionalDate(body.endsOn, 'endsOn', errors);
  if (startsOn !== null && endsOn !== null && endsOn.getTime() < startsOn.getTime()) {
    errors.push(DATE_ORDER_ERROR);
  }

  if (errors.length > 0) return fail(errors);
  return ok({
    title,
    description: description.value,
    areaId,
    facultyIds: parsedFacultyIds.value,
    startsOn,
    endsOn,
  });
}

/** Valida y normaliza la entrada de actualización parcial. Devuelve todos los errores, en español. */
export function parseUpdateProject(input: unknown): ValidationResult<UpdateProjectDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(body, UPDATE_FIELDS);
  if (unknown !== null) errors.push(unknown);

  const dto: UpdateProjectDto = {};
  let hasField = false;

  if (body.title !== undefined) {
    hasField = true;
    const title = parseRequiredText(body.title, MAX_TITLE_LENGTH);
    if (title === null) errors.push(TITLE_ERROR);
    else dto.title = title;
  }

  if (body.description !== undefined) {
    hasField = true;
    const description = parseDescription(body.description);
    if (description.error !== null) errors.push(description.error);
    else dto.description = description.value;
  }

  if (body.areaId !== undefined) {
    hasField = true;
    if (isUuid(body.areaId)) dto.areaId = body.areaId;
    else errors.push(AREA_ERROR);
  }

  if (body.facultyIds !== undefined) {
    hasField = true;
    const facultyIds = parseFacultyIds(body.facultyIds);
    if (facultyIds.error !== null) errors.push(facultyIds.error);
    else dto.facultyIds = facultyIds.value;
  }

  if (body.status !== undefined) {
    hasField = true;
    const status = parseEnum(body.status, ProjectStatus);
    if (status === null) errors.push(`status debe ser uno de: ${Object.values(ProjectStatus).join(', ')}.`);
    else dto.status = status;
  }

  const startsOn = parseOptionalDate(body.startsOn, 'startsOn', errors);
  if (body.startsOn !== undefined) hasField = true;
  const endsOn = parseOptionalDate(body.endsOn, 'endsOn', errors);
  if (body.endsOn !== undefined) hasField = true;

  if (
    body.startsOn !== undefined &&
    body.endsOn !== undefined &&
    startsOn !== null &&
    endsOn !== null &&
    endsOn.getTime() < startsOn.getTime()
  ) {
    errors.push(DATE_ORDER_ERROR);
  }

  if (body.startsOn !== undefined) dto.startsOn = startsOn;
  if (body.endsOn !== undefined) dto.endsOn = endsOn;

  if (!hasField) errors.push(NO_FIELDS_ERROR);
  if (errors.length > 0) return fail(errors);
  return ok(dto);
}
