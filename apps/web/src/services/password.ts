import type { ApiRequest } from '../types/api.ts';

/** Política de contraseñas (ADR 0011): 10–256 caracteres, al menos una letra y un número, distinta del correo. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 256;

export interface ChangePasswordInput {
  /** Obligatoria si el usuario ya tiene contraseña; la valida el backend. */
  currentPassword?: string;
  newPassword: string;
}

/** Cambio de la contraseña propia (`PUT /api/me/password`, ADR 0011). */
export async function changeOwnPassword(request: ApiRequest, input: ChangePasswordInput): Promise<void> {
  const body: ChangePasswordInput = input.currentPassword === undefined
    ? { newPassword: input.newPassword }
    : { currentPassword: input.currentPassword, newPassword: input.newPassword };
  await request('/api/me/password', { method: 'PUT', body });
}

export type PasswordField = 'currentPassword' | 'newPassword' | 'confirmation';
export type PasswordFieldErrors = Partial<Record<PasswordField, string>>;

export interface PasswordChangeFields {
  /** Correo del usuario, para impedir una contraseña igual a él (sin distinguir mayúsculas). */
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmation: string;
}

/** Valida en cliente la política y la confirmación. El backend vuelve a validar todo. */
export function validatePasswordChange(fields: PasswordChangeFields, requireCurrent: boolean): PasswordFieldErrors {
  const errors: PasswordFieldErrors = {};
  const { email, currentPassword, newPassword, confirmation } = fields;

  if (requireCurrent && currentPassword === '') {
    errors.currentPassword = 'Escribe tu contraseña actual.';
  }

  const length = Array.from(newPassword).length;
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    errors.newPassword = `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`;
  } else if (!/\p{L}/u.test(newPassword) || !/\d/.test(newPassword)) {
    errors.newPassword = 'Debe incluir al menos una letra y un número.';
  } else if (newPassword.toLowerCase() === email.trim().toLowerCase()) {
    errors.newPassword = 'La contraseña no puede ser igual a tu correo electrónico.';
  } else if (currentPassword !== '' && newPassword === currentPassword) {
    errors.newPassword = 'La nueva contraseña debe ser distinta de la actual.';
  }

  if (confirmation !== newPassword) {
    errors.confirmation = 'La confirmación no coincide con la nueva contraseña.';
  }

  return errors;
}
