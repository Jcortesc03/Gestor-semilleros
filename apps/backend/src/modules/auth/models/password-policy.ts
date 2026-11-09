/** Política de contraseñas del ADR 0011. Único validador: lo reutilizan altas, cambios, CLI y seed. */
export const MIN_PASSWORD_LENGTH = 10;
/** Límite superior para evitar hashes costosos con entradas enormes. */
export const MAX_PASSWORD_LENGTH = 256;

/**
 * Devuelve los incumplimientos de la política, en español (lista vacía si la contraseña es válida).
 * Reglas: 10 a 256 caracteres, al menos una letra y un número, y distinta del correo
 * (sin distinguir mayúsculas). Nunca incluye la contraseña en los mensajes.
 * `email` es opcional para las validaciones que aún no conocen al usuario.
 */
export function passwordPolicyErrors(password: string, email?: string | null): string[] {
  const errors: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`);
  }
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
    errors.push('La contraseña debe incluir al menos una letra y un número.');
  }
  if (email && password.trim().toLowerCase() === email.trim().toLowerCase()) {
    errors.push('La contraseña no puede ser igual al correo.');
  }
  return errors;
}
