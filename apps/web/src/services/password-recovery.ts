import type { ApiRequest } from '../types/api';
import { ApiError, isRecord } from '../lib/api';

export async function requestRecovery(request: ApiRequest, email: string): Promise<void> {
  await request('/api/password-recovery/request', { method: 'POST', body: { email: email.trim().toLowerCase() } });
}

export async function verifyRecovery(request: ApiRequest, email: string, code: string): Promise<string> {
  const value = await request('/api/password-recovery/verify', {
    method: 'POST', body: { email: email.trim().toLowerCase(), code },
  });
  if (!isRecord(value) || typeof value.resetToken !== 'string' || !/^[a-f0-9]{64}$/.test(value.resetToken)) throw new ApiError(0);
  return value.resetToken;
}

export async function resetRecoveredPassword(request: ApiRequest, resetToken: string, newPassword: string, confirmation: string): Promise<void> {
  await request('/api/password-recovery/reset', { method: 'POST', body: { resetToken, newPassword, confirmation } });
}
