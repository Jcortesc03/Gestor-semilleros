/** Política de contraseñas del ADR 0011; el backend la vuelve a validar. */
export const PASSWORD_POLICY_TEXT = 'Entre 10 y 256 caracteres, con al menos una letra y un número, distinta del correo.';

/** Errores de la política en español; lista vacía si la contraseña es válida. */
export function passwordPolicyErrors(password: string, email: string): string[] {
  const errors: string[] = [];
  if (password.length < 10 || password.length > 256) errors.push('La contraseña debe tener entre 10 y 256 caracteres.');
  if (!/\p{L}/u.test(password)) errors.push('La contraseña debe incluir al menos una letra.');
  if (!/\d/.test(password)) errors.push('La contraseña debe incluir al menos un número.');
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail && password.toLowerCase() === normalizedEmail) errors.push('La contraseña no puede ser igual al correo.');
  return errors;
}
