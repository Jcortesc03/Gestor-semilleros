import { asObject, fail, ok, unknownFieldsError, type ValidationResult } from '../../../common/utils/validation';
import { MAX_PASSWORD_LENGTH } from '../models/password-policy';

/** Cuerpo validado de PUT /api/me/password (la política de la nueva contraseña se aplica en el servicio, con el correo). */
export interface ChangePasswordDto {
  /** Contraseña actual; obligatoria solo si el usuario ya tiene una (se comprueba en el servicio). */
  currentPassword: string | null;
  newPassword: string;
}

/** Valida la forma del cuerpo. Devuelve todos los errores a la vez, en español. */
export function parseChangePassword(input: unknown): ValidationResult<ChangePasswordDto> {
  const body = asObject(input);
  if (body === null) return fail(['El cuerpo debe ser un objeto JSON.']);

  const errors: string[] = [];
  const unknown = unknownFieldsError(body, ['currentPassword', 'newPassword']);
  if (unknown !== null) errors.push(unknown);

  let currentPassword: string | null = null;
  if (body.currentPassword !== undefined && body.currentPassword !== null) {
    if (typeof body.currentPassword !== 'string') errors.push('currentPassword debe ser texto.');
    else if (body.currentPassword.length > MAX_PASSWORD_LENGTH) {
      errors.push(`currentPassword admite como máximo ${MAX_PASSWORD_LENGTH} caracteres.`);
    } else currentPassword = body.currentPassword;
  }

  let newPassword = '';
  if (typeof body.newPassword !== 'string') errors.push('newPassword es obligatorio.');
  else newPassword = body.newPassword;

  if (errors.length > 0) return fail(errors);
  return ok({ currentPassword, newPassword });
}
