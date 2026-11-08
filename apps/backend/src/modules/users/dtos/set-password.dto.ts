import { asObject, fail, ok, unknownFieldsError, type ValidationResult } from '../../../common/utils/validation';

/** Cuerpo validado de PUT /api/users/:id/password (la política se aplica en el servicio, con el correo del usuario). */
export interface SetPasswordDto {
  password: string;
}

export function parseSetPassword(input: unknown): ValidationResult<SetPasswordDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(body, ['password']);
  if (unknown !== null) errors.push(unknown);
  if (typeof body.password !== 'string') errors.push('password es obligatorio.');

  return errors.length > 0 ? fail(errors) : ok({ password: body.password as string });
}
