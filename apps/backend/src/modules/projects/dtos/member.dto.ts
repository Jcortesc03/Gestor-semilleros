import { ProjectRole } from '../../../generated/prisma/enums';
import {
  asObject,
  fail,
  isUuid,
  ok,
  parseEnum,
  unknownFieldsError,
  type ValidationResult,
} from '../../../common/utils/validation';

/** Cuerpo validado de POST /api/projects/:id/members. */
export interface AddMemberDto {
  userId: string;
  projectRole: ProjectRole;
  isPrimary: boolean;
}

/** Campos editables de un integrante del proyecto. */
export interface UpdateMemberDto {
  projectRole?: 'STUDENT' | 'STUDENT_LEADER';
  isPrimary?: boolean;
}

const ADD_FIELDS = ['userId', 'projectRole', 'isPrimary'] as const;
const UPDATE_FIELDS = ['projectRole', 'isPrimary'] as const;
const USER_ID_ERROR = 'userId debe ser un UUID.';
const PROJECT_ROLE_ERROR = `projectRole debe ser uno de: ${Object.values(ProjectRole).join(', ')}.`;
const PRIMARY_ERROR = 'Solo un tutor puede ser principal.';
const UPDATE_ROLE_ERROR = 'projectRole solo puede cambiar entre STUDENT y STUDENT_LEADER.';
const IS_PRIMARY_ERROR = 'isPrimary debe ser un booleano.';
const NO_FIELDS_ERROR = 'Debe indicar al menos un campo para actualizar.';

/** Valida y normaliza el alta de un integrante. Devuelve todos los errores encontrados, en español. */
export function parseAddMember(input: unknown): ValidationResult<AddMemberDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(body, ADD_FIELDS);
  if (unknown !== null) errors.push(unknown);

  let userId = '';
  if (isUuid(body.userId)) userId = body.userId;
  else errors.push(USER_ID_ERROR);

  let projectRole: ProjectRole = ProjectRole.STUDENT;
  const parsedRole = parseEnum(body.projectRole, ProjectRole);
  if (parsedRole === null) errors.push(PROJECT_ROLE_ERROR);
  else projectRole = parsedRole;

  let isPrimary = false;
  if (body.isPrimary !== undefined) {
    if (typeof body.isPrimary !== 'boolean') errors.push(IS_PRIMARY_ERROR);
    else isPrimary = body.isPrimary;
  }

  if (isPrimary && parsedRole !== ProjectRole.TUTOR) errors.push(PRIMARY_ERROR);

  if (errors.length > 0) return fail(errors);
  return ok({ userId, projectRole, isPrimary });
}

/** Valida y normaliza la actualización de un integrante. Devuelve todos los errores, en español. */
export function parseUpdateMember(input: unknown): ValidationResult<UpdateMemberDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(body, UPDATE_FIELDS);
  if (unknown !== null) errors.push(unknown);

  const dto: UpdateMemberDto = {};
  let hasField = false;

  if (body.projectRole !== undefined) {
    hasField = true;
    if (body.projectRole === 'STUDENT' || body.projectRole === 'STUDENT_LEADER') {
      dto.projectRole = body.projectRole;
    } else {
      errors.push(UPDATE_ROLE_ERROR);
    }
  }

  if (body.isPrimary !== undefined) {
    hasField = true;
    if (typeof body.isPrimary !== 'boolean') errors.push(IS_PRIMARY_ERROR);
    else dto.isPrimary = body.isPrimary;
  }

  if (!hasField) errors.push(NO_FIELDS_ERROR);
  if (errors.length > 0) return fail(errors);
  return ok(dto);
}
