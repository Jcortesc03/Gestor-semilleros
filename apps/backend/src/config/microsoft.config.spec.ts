import { EnvValidationError } from './env';
import { loadMeetingsTimeZone, loadMicrosoftConfig } from './microsoft.config';
import { DEFAULT_MEETINGS_TIME_ZONE } from './microsoft.config.types';

const CLIENT_SECRET = 'secreto-microsoft-super-secreto';
const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const baseSource = {
  MICROSOFT_CLIENT_ID: '11111111-2222-3333-4444-555555555555',
  MICROSOFT_CLIENT_SECRET: CLIENT_SECRET,
  MICROSOFT_REDIRECT_URI: 'http://localhost:3000/api/integrations/microsoft/callback',
  MICROSOFT_TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY,
};

/** Ejecuta la carga y devuelve el error de validación lanzado. */
function loadError(source: NodeJS.ProcessEnv): EnvValidationError {
  try {
    loadMicrosoftConfig(source);
  } catch (error) {
    if (error instanceof EnvValidationError) return error;
    throw error;
  }
  throw new Error('Se esperaba un EnvValidationError.');
}

function timeZoneError(source: NodeJS.ProcessEnv): EnvValidationError {
  try {
    loadMeetingsTimeZone(source);
  } catch (error) {
    if (error instanceof EnvValidationError) return error;
    throw error;
  }
  throw new Error('Se esperaba un EnvValidationError.');
}

describe('loadMicrosoftConfig', () => {
  it('devuelve null cuando no hay credenciales', () => {
    expect(loadMicrosoftConfig({})).toBeNull();
    expect(
      loadMicrosoftConfig({ MICROSOFT_CLIENT_ID: '  ', MICROSOFT_CLIENT_SECRET: '' }),
    ).toBeNull();
  });

  it('exige definir juntas las credenciales de la aplicación', () => {
    expect(() => loadMicrosoftConfig({ MICROSOFT_CLIENT_ID: 'cliente' })).toThrow(
      'MICROSOFT_CLIENT_ID y MICROSOFT_CLIENT_SECRET deben definirse juntas.',
    );
    expect(() => loadMicrosoftConfig({ MICROSOFT_CLIENT_SECRET: 'secreto' })).toThrow(
      'MICROSOFT_CLIENT_ID y MICROSOFT_CLIENT_SECRET deben definirse juntas.',
    );
  });

  it('carga la configuración completa con los valores por defecto y recortados', () => {
    const config = loadMicrosoftConfig({
      ...baseSource,
      MICROSOFT_CLIENT_ID: '  cliente  ',
      MICROSOFT_CLIENT_SECRET: `  ${CLIENT_SECRET}  `,
      MICROSOFT_REDIRECT_URI: '  https://api.example.test/callback  ',
      MICROSOFT_TOKEN_ENCRYPTION_KEY: `  ${ENCRYPTION_KEY}  `,
    });

    expect(config).toEqual({
      tenantId: 'common',
      clientId: 'cliente',
      clientSecret: CLIENT_SECRET,
      redirectUri: 'https://api.example.test/callback',
      tokenEncryptionKey: Buffer.alloc(32, 7),
      linkRedirectUrl: null,
    });
  });

  it('acepta un GUID, un dominio, organizations y common como inquilino', () => {
    expect(
      loadMicrosoftConfig({ ...baseSource, MICROSOFT_TENANT_ID: 'common' })?.tenantId,
    ).toBe('common');
    expect(
      loadMicrosoftConfig({ ...baseSource, MICROSOFT_TENANT_ID: 'universidad.edu.co' })?.tenantId,
    ).toBe('universidad.edu.co');
    expect(
      loadMicrosoftConfig({ ...baseSource, MICROSOFT_TENANT_ID: baseSource.MICROSOFT_CLIENT_ID })
        ?.tenantId,
    ).toBe(baseSource.MICROSOFT_CLIENT_ID);
  });

  it('rechaza un inquilino con formato inválido', () => {
    expect(() => loadMicrosoftConfig({ ...baseSource, MICROSOFT_TENANT_ID: 'otro' })).toThrow(
      EnvValidationError,
    );
    expect(() => loadMicrosoftConfig({ ...baseSource, MICROSOFT_TENANT_ID: ' ' })).not.toThrow();
  });

  it('exige MICROSOFT_REDIRECT_URI y una URL http(s) válida', () => {
    const { MICROSOFT_REDIRECT_URI: _omit, ...withoutRedirect } = baseSource;
    expect(() => loadMicrosoftConfig(withoutRedirect)).toThrow(
      'Falta la variable de entorno MICROSOFT_REDIRECT_URI.',
    );
    expect(() =>
      loadMicrosoftConfig({ ...baseSource, MICROSOFT_REDIRECT_URI: 'no-es-una-url' }),
    ).toThrow('MICROSOFT_REDIRECT_URI debe ser una URL http(s) válida.');
    expect(() =>
      loadMicrosoftConfig({ ...baseSource, MICROSOFT_REDIRECT_URI: 'ftp://example.test/callback' }),
    ).toThrow('MICROSOFT_REDIRECT_URI debe ser una URL http(s) válida.');
  });

  it('exige una clave de cifrado base64 de exactamente 32 bytes', () => {
    const { MICROSOFT_TOKEN_ENCRYPTION_KEY: _omit, ...withoutKey } = baseSource;
    expect(() => loadMicrosoftConfig(withoutKey)).toThrow(
      'Falta la variable de entorno MICROSOFT_TOKEN_ENCRYPTION_KEY.',
    );

    for (const invalid of [
      'no-es-base64!',
      Buffer.alloc(16, 1).toString('base64'),
      Buffer.alloc(33, 1).toString('base64'),
    ]) {
      const error = loadError({ ...baseSource, MICROSOFT_TOKEN_ENCRYPTION_KEY: invalid });
      expect(error.message).toBe(
        'MICROSOFT_TOKEN_ENCRYPTION_KEY debe ser una clave de 32 bytes en base64 (genérala con: openssl rand -base64 32).',
      );
      expect(error.message).not.toContain(invalid);
    }
  });

  it('acepta MICROSOFT_LINK_REDIRECT_URL opcional y valida su formato', () => {
    expect(
      loadMicrosoftConfig({
        ...baseSource,
        MICROSOFT_LINK_REDIRECT_URL: 'https://app.example.test/integraciones',
      })?.linkRedirectUrl,
    ).toBe('https://app.example.test/integraciones');

    expect(
      loadMicrosoftConfig({ ...baseSource, MICROSOFT_LINK_REDIRECT_URL: '  ' })?.linkRedirectUrl,
    ).toBeNull();

    expect(() =>
      loadMicrosoftConfig({ ...baseSource, MICROSOFT_LINK_REDIRECT_URL: 'javascript:alert(1)' }),
    ).toThrow('MICROSOFT_LINK_REDIRECT_URL debe ser una URL http(s) válida.');
  });

  it('nunca incluye el secreto ni la clave en los mensajes de error', () => {
    const messages = [
      loadError({ ...baseSource, MICROSOFT_REDIRECT_URI: 'x' }).message,
      loadError({ ...baseSource, MICROSOFT_TOKEN_ENCRYPTION_KEY: 'x' }).message,
      loadError({ ...baseSource, MICROSOFT_TENANT_ID: 'x' }).message,
    ];

    for (const message of messages) {
      expect(message).not.toContain(CLIENT_SECRET);
      expect(message).not.toContain(ENCRYPTION_KEY);
    }
  });
});

describe('loadMeetingsTimeZone', () => {
  it('usa la zona por defecto cuando no está definida', () => {
    expect(loadMeetingsTimeZone({})).toBe(DEFAULT_MEETINGS_TIME_ZONE);
    expect(loadMeetingsTimeZone({ MEETINGS_TIME_ZONE: '   ' })).toBe(DEFAULT_MEETINGS_TIME_ZONE);
  });

  it('acepta una zona IANA y recorta el valor', () => {
    expect(loadMeetingsTimeZone({ MEETINGS_TIME_ZONE: '  Europe/Madrid  ' })).toBe('Europe/Madrid');
    expect(loadMeetingsTimeZone({ MEETINGS_TIME_ZONE: 'UTC' })).toBe('UTC');
  });

  it('rechaza una zona horaria inválida', () => {
    const error = timeZoneError({ MEETINGS_TIME_ZONE: 'Marte/Olympus' });
    expect(error.message).toBe('MEETINGS_TIME_ZONE no es una zona horaria IANA válida.');
  });
});
