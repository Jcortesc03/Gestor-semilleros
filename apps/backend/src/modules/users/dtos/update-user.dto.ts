import { Role } from '../../../generated/prisma/enums';
import { asObject, fail, ok, unknownFieldsError, type ValidationResult } from '../../../common/utils/validation';

/** Cuerpo validado de PATCH /api/users/:id. Al menos uno de los campos. */
export interface UpdateUserDto {
  fullName?: string;
  roles?: Role[];
}

const MAX_NAME_LENGTH = 150;
const VALID_ROLES = new Set<string>(Object.values(Role));

/** Valida la entrada. Los roles no pueden estar vacíos ni repetirse. */
export function parseUpdateUser(input: unknown): ValidationResult<UpdateUserDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(body, ['fullName', 'roles']);
  if (unknown !== null) errors.push(unknown);

  const value: UpdateUserDto = {};
  if (body.fullName !== undefined) {
    const name = typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : '';
    if (name.length === 0) errors.push('fullName debe ser un texto no vacío.');
    else if (name.length > MAX_NAME_LENGTH) errors.push(`fullName admite como máximo ${MAX_NAME_LENGTH} caracteres.`);
    else value.fullName = name;
  }

  if (body.roles !== undefined) {
    if (!Array.isArray(body.roles) || body.roles.length === 0) {
      errors.push('roles debe ser una lista con al menos un rol.');
    } else {
      const invalid = body.roles.filter((r) => typeof r !== 'string' || !VALID_ROLES.has(r));
      if (invalid.length > 0) {
        errors.push(`Roles no válidos: ${invalid.map(String).join(', ')}. Permitidos: ${[...VALID_ROLES].join(', ')}.`);
      } else if (new Set(body.roles).size !== body.roles.length) {
        errors.push('roles no admite valores repetidos.');
      } else {
        value.roles = body.roles as Role[];
      }
    }
  }

  if (unknown === null && body.fullName === undefined && body.roles === undefined) {
    errors.push('Indica al menos uno de: fullName, roles.');
  }

  return errors.length > 0 ? fail(errors) : ok(value);
}
