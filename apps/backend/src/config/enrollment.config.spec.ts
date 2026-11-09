import { EnvValidationError } from './env';
import { loadEnrollmentConfig } from './enrollment.config';

describe('loadEnrollmentConfig', () => {
  it('queda desactivado sin credenciales de cuenta de servicio', () => {
    const config = loadEnrollmentConfig({}, 'a'.repeat(32));
    expect(config.google).toBeNull();
    expect(config.allowlist).toEqual({});
  });

  it('carga credenciales y allowlist', () => {
    const config = loadEnrollmentConfig(
      {
        ENROLLMENT_GOOGLE_SERVICE_ACCOUNT_EMAIL: 'svc@example.com',
        ENROLLMENT_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nKEY\\n-----END PRIVATE KEY-----',
        ENROLLMENT_SHEETS_ALLOWLIST: JSON.stringify({ area1: ['sheet-1'] }),
      },
      'a'.repeat(32),
    );
    expect(config.google?.clientEmail).toBe('svc@example.com');
    expect(config.google?.privateKey).toContain('\n');
    expect(config.allowlist).toEqual({ area1: ['sheet-1'] });
  });

  it('rechaza credenciales parciales o allowlist inválida', () => {
    expect(() => loadEnrollmentConfig({ ENROLLMENT_GOOGLE_SERVICE_ACCOUNT_EMAIL: 'x' }, 'a'.repeat(32))).toThrow(EnvValidationError);
    expect(() => loadEnrollmentConfig({ ENROLLMENT_SHEETS_ALLOWLIST: '{bad' }, 'a'.repeat(32))).toThrow(EnvValidationError);
  });
});
