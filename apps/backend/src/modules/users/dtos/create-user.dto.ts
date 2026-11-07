import { Role } from '../../../generated/prisma/enums';
import { normalizeEmail } from '../../auth';

/** Cuerpo validado de POST /api/users. */
export interface CreateUserDto {
  email: string;
  fullName: string;
  roles: Role[];
  /** Contraseña inicial. Si se omite, el usuario solo podrá entrar con Google. */
  password: string | null;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 150;
// Política provisional de contraseñas (no definida en el dominio; ver ADR 0003).
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;
const VALID_ROLES = new Set<string>(Object.values(Role));
const ALLOWED_FIELDS = new Set(['email', 'fullName', 'roles', 'password']);

/** Valida y normaliza la entrada. Devuelve todos los errores encontrados, en español. */
export function parseCreateUser(input: unknown): ValidationResult<CreateUserDto> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['El cuerpo debe ser un objeto JSON.'] };
  }
  const body = input as Record<string, unknown>;
  const errors: string[] = [];

  const unknownFields = Object.keys(body).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknownFields.length > 0) errors.push(`Campos no permitidos: ${unknownFields.join(', ')}.`);

  let email = '';
  if (typeof body.email !== 'string') {
    errors.push('email es obligatorio.');
  } else {
    email = normalizeEmail(body.email);
    if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) errors.push('email no es un correo válido.');
  }

  let fullName = '';
  if (typeof body.fullName !== 'string' || body.fullName.trim().length === 0) {
    errors.push('fullName es obligatorio.');
  } else {
    fullName = body.fullName.trim().replace(/\s+/g, ' ');
    if (fullName.length > MAX_NAME_LENGTH) errors.push(`fullName admite como máximo ${MAX_NAME_LENGTH} caracteres.`);
  }

  let roles: Role[] = [];
  if (!Array.isArray(body.roles) || body.roles.length === 0) {
    errors.push('roles debe ser una lista con al menos un rol.');
  } else {
    const invalid = body.roles.filter((r) => typeof r !== 'string' || !VALID_ROLES.has(r));
    if (invalid.length > 0) {
      errors.push(`Roles no válidos: ${invalid.map(String).join(', ')}. Permitidos: ${[...VALID_ROLES].join(', ')}.`);
    } else {
      roles = [...new Set(body.roles as Role[])];
    }
  }

  let password: string | null = null;
  if (body.password !== undefined && body.password !== null) {
    if (typeof body.password !== 'string') {
      errors.push('password debe ser texto.');
    } else if (body.password.length < MIN_PASSWORD_LENGTH || body.password.length > MAX_PASSWORD_LENGTH) {
      errors.push(`password debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`);
    } else {
      password = body.password;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { email, fullName, roles, password } };
}
