import { EnvValidationError } from './env';
import { loadNotificationsConfig } from './notifications.config';

const SMTP_SECRET = 'contraseña-smtp-super-secreta';
const WHATSAPP_SECRET = 'token-whatsapp-super-secreto';

const smtpSource = {
  NOTIFICATIONS_EMAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'usuario@example.test',
  SMTP_PASSWORD: SMTP_SECRET,
  EMAIL_FROM: '"Semilleros" <no-responder@example.test>',
};

const cloudSource = {
  NOTIFICATIONS_WHATSAPP_TRANSPORT: 'cloud-api',
  WHATSAPP_API_VERSION: 'v21.0',
  WHATSAPP_PHONE_NUMBER_ID: '1234567890',
  WHATSAPP_ACCESS_TOKEN: WHATSAPP_SECRET,
  WHATSAPP_TEMPLATE_NAME: 'novedad_semillero',
  WHATSAPP_TEMPLATE_LANGUAGE: 'es_CO',
};

/** Ejecuta la carga y devuelve el error de validación lanzado. */
function loadError(source: NodeJS.ProcessEnv): EnvValidationError {
  try {
    loadNotificationsConfig(source);
  } catch (error) {
    if (error instanceof EnvValidationError) return error;
    throw error;
  }
  throw new Error('Se esperaba un EnvValidationError.');
}

describe('loadNotificationsConfig', () => {
  it('usa valores por defecto con un entorno vacío', () => {
    expect(loadNotificationsConfig({})).toEqual({
      email: { transport: 'log' },
      whatsapp: { transport: 'log' },
      autoDispatch: true,
      dispatchIntervalSeconds: 60,
      maxAttempts: 5,
    });
  });

  it('trata las cadenas vacías o con espacios como no definidas', () => {
    const config = loadNotificationsConfig({
      NOTIFICATIONS_EMAIL_TRANSPORT: '   ',
      NOTIFICATIONS_WHATSAPP_TRANSPORT: '',
      NOTIFICATIONS_AUTO_DISPATCH: ' ',
      NOTIFICATIONS_DISPATCH_INTERVAL: '',
      NOTIFICATIONS_MAX_ATTEMPTS: '   ',
    });

    expect(config.email).toEqual({ transport: 'log' });
    expect(config.whatsapp).toEqual({ transport: 'log' });
    expect(config.autoDispatch).toBe(true);
    expect(config.dispatchIntervalSeconds).toBe(60);
    expect(config.maxAttempts).toBe(5);
  });

  it('carga una configuración SMTP completa y recorta los valores', () => {
    const config = loadNotificationsConfig({
      ...smtpSource,
      SMTP_HOST: '  smtp.example.test  ',
      SMTP_PORT: ' 465 ',
    });

    expect(config.email).toEqual({
      transport: 'smtp',
      smtp: {
        host: 'smtp.example.test',
        port: 465,
        secure: true,
        user: 'usuario@example.test',
        password: SMTP_SECRET,
        from: '"Semilleros" <no-responder@example.test>',
      },
    });
  });

  it('aplica los valores por defecto de SMTP (puerto 587, sin cifrado ni credenciales)', () => {
    const config = loadNotificationsConfig({
      NOTIFICATIONS_EMAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'smtp.example.test',
      EMAIL_FROM: 'no-responder@example.test',
    });

    expect(config.email).toEqual({
      transport: 'smtp',
      smtp: {
        host: 'smtp.example.test',
        port: 587,
        secure: false,
        user: null,
        password: null,
        from: 'no-responder@example.test',
      },
    });
  });

  it('carga una configuración de WhatsApp Cloud API completa', () => {
    const config = loadNotificationsConfig({ ...cloudSource });

    expect(config.whatsapp).toEqual({
      transport: 'cloud-api',
      cloud: {
        apiVersion: 'v21.0',
        phoneNumberId: '1234567890',
        accessToken: WHATSAPP_SECRET,
        templateName: 'novedad_semillero',
        templateLanguage: 'es_CO',
      },
    });
  });

  it('usa "es" como idioma de plantilla por defecto', () => {
    const { WHATSAPP_TEMPLATE_LANGUAGE: _omitido, ...resto } = cloudSource;
    const config = loadNotificationsConfig(resto);

    expect(config.whatsapp).toEqual({
      transport: 'cloud-api',
      cloud: {
        apiVersion: 'v21.0',
        phoneNumberId: '1234567890',
        accessToken: WHATSAPP_SECRET,
        templateName: 'novedad_semillero',
        templateLanguage: 'es',
      },
    });
  });

  it('carga los ajustes generales del despachador', () => {
    const config = loadNotificationsConfig({
      NOTIFICATIONS_AUTO_DISPATCH: 'false',
      NOTIFICATIONS_DISPATCH_INTERVAL: '5',
      NOTIFICATIONS_MAX_ATTEMPTS: '20',
    });

    expect(config.autoDispatch).toBe(false);
    expect(config.dispatchIntervalSeconds).toBe(5);
    expect(config.maxAttempts).toBe(20);
  });

  it('rechaza un transporte de correo desconocido y lista los permitidos', () => {
    const error = loadError({ NOTIFICATIONS_EMAIL_TRANSPORT: 'sms' });

    expect(error.message).toContain('NOTIFICATIONS_EMAIL_TRANSPORT');
    expect(error.message).toContain('smtp');
    expect(error.message).toContain('log');
    expect(error.message).toContain('disabled');
  });

  it('rechaza un transporte de WhatsApp desconocido y lista los permitidos', () => {
    const error = loadError({ NOTIFICATIONS_WHATSAPP_TRANSPORT: 'sms' });

    expect(error.message).toContain('NOTIFICATIONS_WHATSAPP_TRANSPORT');
    expect(error.message).toContain('cloud-api');
    expect(error.message).toContain('log');
    expect(error.message).toContain('disabled');
  });

  it('exige SMTP_HOST y EMAIL_FROM cuando el transporte es smtp', () => {
    expect(() =>
      loadNotificationsConfig({ NOTIFICATIONS_EMAIL_TRANSPORT: 'smtp', EMAIL_FROM: 'a@example.test' }),
    ).toThrow(/SMTP_HOST/);

    expect(() =>
      loadNotificationsConfig({
        NOTIFICATIONS_EMAIL_TRANSPORT: 'smtp',
        SMTP_HOST: 'smtp.example.test',
      }),
    ).toThrow(/EMAIL_FROM/);
  });

  it('valida que SMTP_PORT sea un entero entre 1 y 65535', () => {
    expect(() => loadNotificationsConfig({ ...smtpSource, SMTP_PORT: '0' })).toThrow(
      EnvValidationError,
    );
    expect(() => loadNotificationsConfig({ ...smtpSource, SMTP_PORT: '65536' })).toThrow(
      EnvValidationError,
    );
    expect(() => loadNotificationsConfig({ ...smtpSource, SMTP_PORT: '587.5' })).toThrow(
      EnvValidationError,
    );
    expect(() => loadNotificationsConfig({ ...smtpSource, SMTP_PORT: 'abc' })).toThrow(
      EnvValidationError,
    );
  });

  it('valida que SMTP_SECURE sea "true" o "false"', () => {
    expect(() => loadNotificationsConfig({ ...smtpSource, SMTP_SECURE: 'sí' })).toThrow(
      /SMTP_SECURE/,
    );
  });

  it('exige que SMTP_USER y SMTP_PASSWORD se definan juntas o ninguna', () => {
    expect(() =>
      loadNotificationsConfig({ ...smtpSource, SMTP_PASSWORD: undefined }),
    ).toThrow(EnvValidationError);

    expect(() =>
      loadNotificationsConfig({ ...smtpSource, SMTP_USER: undefined }),
    ).toThrow(EnvValidationError);
  });

  it('exige que EMAIL_FROM contenga una arroba', () => {
    expect(() => loadNotificationsConfig({ ...smtpSource, EMAIL_FROM: 'no-responder' })).toThrow(
      /EMAIL_FROM/,
    );
  });

  it('exige WHATSAPP_API_VERSION con el formato v<mayor>.<menor>', () => {
    expect(() => loadNotificationsConfig({ ...cloudSource, WHATSAPP_API_VERSION: '21.0' })).toThrow(
      /WHATSAPP_API_VERSION/,
    );
    expect(() => loadNotificationsConfig({ ...cloudSource, WHATSAPP_API_VERSION: 'v21' })).toThrow(
      /WHATSAPP_API_VERSION/,
    );
  });

  it('exige WHATSAPP_PHONE_NUMBER_ID solo con dígitos', () => {
    expect(() =>
      loadNotificationsConfig({ ...cloudSource, WHATSAPP_PHONE_NUMBER_ID: '+573000000001' }),
    ).toThrow(/WHATSAPP_PHONE_NUMBER_ID/);
    expect(() =>
      loadNotificationsConfig({ ...cloudSource, WHATSAPP_PHONE_NUMBER_ID: 'abc123' }),
    ).toThrow(/WHATSAPP_PHONE_NUMBER_ID/);
  });

  it('exige WHATSAPP_ACCESS_TOKEN', () => {
    expect(() =>
      loadNotificationsConfig({ ...cloudSource, WHATSAPP_ACCESS_TOKEN: '   ' }),
    ).toThrow(/WHATSAPP_ACCESS_TOKEN/);
  });

  it('exige WHATSAPP_TEMPLATE_NAME con minúsculas, dígitos y guiones bajos', () => {
    expect(() =>
      loadNotificationsConfig({ ...cloudSource, WHATSAPP_TEMPLATE_NAME: 'Novedad Semillero' }),
    ).toThrow(/WHATSAPP_TEMPLATE_NAME/);
    expect(() =>
      loadNotificationsConfig({ ...cloudSource, WHATSAPP_TEMPLATE_NAME: 'novedad-semillero' }),
    ).toThrow(/WHATSAPP_TEMPLATE_NAME/);
  });

  it('valida WHATSAPP_TEMPLATE_LANGUAGE', () => {
    expect(() =>
      loadNotificationsConfig({ ...cloudSource, WHATSAPP_TEMPLATE_LANGUAGE: 'español' }),
    ).toThrow(/WHATSAPP_TEMPLATE_LANGUAGE/);
    expect(() =>
      loadNotificationsConfig({ ...cloudSource, WHATSAPP_TEMPLATE_LANGUAGE: 'es_co' }),
    ).toThrow(/WHATSAPP_TEMPLATE_LANGUAGE/);
  });

  it('valida NOTIFICATIONS_AUTO_DISPATCH', () => {
    expect(() => loadNotificationsConfig({ NOTIFICATIONS_AUTO_DISPATCH: 'yes' })).toThrow(
      /NOTIFICATIONS_AUTO_DISPATCH/,
    );
  });

  it('valida NOTIFICATIONS_DISPATCH_INTERVAL entre 5 y 3600', () => {
    expect(() => loadNotificationsConfig({ NOTIFICATIONS_DISPATCH_INTERVAL: '4' })).toThrow(
      /NOTIFICATIONS_DISPATCH_INTERVAL/,
    );
    expect(() => loadNotificationsConfig({ NOTIFICATIONS_DISPATCH_INTERVAL: '3601' })).toThrow(
      /NOTIFICATIONS_DISPATCH_INTERVAL/,
    );
    expect(() => loadNotificationsConfig({ NOTIFICATIONS_DISPATCH_INTERVAL: '30.5' })).toThrow(
      /NOTIFICATIONS_DISPATCH_INTERVAL/,
    );
  });

  it('valida NOTIFICATIONS_MAX_ATTEMPTS entre 1 y 20', () => {
    expect(() => loadNotificationsConfig({ NOTIFICATIONS_MAX_ATTEMPTS: '0' })).toThrow(
      /NOTIFICATIONS_MAX_ATTEMPTS/,
    );
    expect(() => loadNotificationsConfig({ NOTIFICATIONS_MAX_ATTEMPTS: '21' })).toThrow(
      /NOTIFICATIONS_MAX_ATTEMPTS/,
    );
    expect(() => loadNotificationsConfig({ NOTIFICATIONS_MAX_ATTEMPTS: '2.5' })).toThrow(
      /NOTIFICATIONS_MAX_ATTEMPTS/,
    );
  });

  it('no incluye SMTP_PASSWORD en los mensajes de error', () => {
    const error = loadError({ ...smtpSource, EMAIL_FROM: 'sin-arroba' });

    expect(error.message).not.toContain(SMTP_SECRET);
  });

  it('no incluye WHATSAPP_ACCESS_TOKEN en los mensajes de error', () => {
    const error = loadError({ ...cloudSource, WHATSAPP_TEMPLATE_NAME: 'Nombre Inválido' });

    expect(error.message).not.toContain(WHATSAPP_SECRET);
  });
});
