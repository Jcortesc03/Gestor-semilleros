import { asObject, fail, ok, unknownFieldsError, type ValidationResult } from '../../../common/utils/validation';
import { parseCredentials } from './credentials.dto';
import { MAX_PASSWORD_LENGTH } from '../models/password-policy';

export interface RecoveryRequest { email: string }
export interface RecoveryVerification extends RecoveryRequest { code: string }
export interface RecoveryReset { resetToken: string; newPassword: string; confirmation: string }

function fields(input: unknown, allowed: string[]): Record<string, unknown> | null {
  const body = asObject(input);
  return body && unknownFieldsError(body, allowed) === null ? body : null;
}

export function parseRecoveryRequest(input: unknown): ValidationResult<RecoveryRequest> {
  const body = fields(input, ['email']);
  const credentials = body && parseCredentials({ email: body.email, password: 'validation-only' });
  return credentials ? ok({ email: credentials.email }) : fail(['Ingresa un correo electrónico válido.']);
}

export function parseRecoveryVerification(input: unknown): ValidationResult<RecoveryVerification> {
  const body = fields(input, ['email', 'code']);
  const email = parseRecoveryRequest(body ? { email: body.email } : null);
  return body && email.ok && typeof body.code === 'string' && /^\d{6}$/.test(body.code)
    ? ok({ email: email.value.email, code: body.code }) : fail(['Ingresa tu correo y el código de 6 dígitos.']);
}

export function parseRecoveryReset(input: unknown): ValidationResult<RecoveryReset> {
  const body = fields(input, ['resetToken', 'newPassword', 'confirmation']);
  if (!body || typeof body.resetToken !== 'string' || !/^[a-f0-9]{64}$/.test(body.resetToken)
    || typeof body.newPassword !== 'string' || body.newPassword.length > MAX_PASSWORD_LENGTH
    || typeof body.confirmation !== 'string' || body.confirmation !== body.newPassword) {
    return fail(['Revisa la nueva contraseña y su confirmación.']);
  }
  return ok({ resetToken: body.resetToken, newPassword: body.newPassword, confirmation: body.confirmation });
}
