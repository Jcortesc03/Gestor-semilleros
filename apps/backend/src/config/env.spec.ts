import { EnvValidationError, loadEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  AUTH_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('carga valores mínimos con valores por defecto', () => {
    const env = loadEnv({ ...base });
    expect(env.port).toBe(3000);
    expect(env.sessionMaxAge).toBe(8 * 60 * 60);
    expect(env.authTrustHost).toBe(false);
    expect(env.google).toBeNull();
  });

  it('exige DATABASE_URL y AUTH_SECRET', () => {
    expect(() => loadEnv({ AUTH_SECRET: base.AUTH_SECRET })).toThrow(EnvValidationError);
    expect(() => loadEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(EnvValidationError);
  });

  it('rechaza un AUTH_SECRET corto', () => {
    expect(() => loadEnv({ ...base, AUTH_SECRET: 'corto' })).toThrow(/32/);
  });

  it('exige definir juntas las credenciales de Google', () => {
    expect(() => loadEnv({ ...base, AUTH_GOOGLE_ID: 'id' })).toThrow(EnvValidationError);
    expect(loadEnv({ ...base, AUTH_GOOGLE_ID: 'id', AUTH_GOOGLE_SECRET: 's' }).google).toEqual({
      clientId: 'id',
      clientSecret: 's',
    });
  });

  it('valida que PORT y AUTH_SESSION_MAX_AGE sean enteros positivos', () => {
    expect(() => loadEnv({ ...base, PORT: 'abc' })).toThrow(EnvValidationError);
    expect(() => loadEnv({ ...base, AUTH_SESSION_MAX_AGE: '-1' })).toThrow(EnvValidationError);
  });
});
