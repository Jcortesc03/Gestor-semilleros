import { EnvValidationError } from './env';
import { loadNotificationsConfig } from './notifications.config';

const SMTP_SECRET = 'contraseña-smtp-super-secreta';

const smtpSource = {
  NOTIFICATIONS_EMAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '465',
  SMTP_SECURE: 'true',
  SMTP_USER: 'usuario@example.test',
  SMTP_PASSWORD: SMTP_SECRET,
  EMAIL_FROM: '"Semilleros" <no-responder@example.test>',
};

const builderBotSource = {
  NOTIFICATIONS_WHATSAPP_TRANSPORT: 'builderbot',
  WHATSAPP_PROVIDER: 'baileys',
  WHATSAPP_SESSION_NAME: 'semilleros',
  WHATSAPP_PAIRING_PHONE: '+57 300 000 0001',
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
      maxDeferHours: 24,
    });
  });

  it('trata las cadenas vacías o con espacios como no definidas', () => {
    const config = loadNotificationsConfig({
      NOTIFICATIONS_EMAIL_TRANSPORT: '   ',
      NOTIFICATIONS_WHATSAPP_TRANSPORT: '',
      NOTIFICATIONS_AUTO_DISPATCH: ' ',
      NOTIFICATIONS_DISPATCH_INTERVAL: '',
      NOTIFICATIONS_MAX_ATTEMPTS: '   ',
      NOTIFICATIONS_MAX_DEFER_HOURS: '   ',
    });

    expect(config.email).toEqual({ transport: 'log' });
    expect(config.whatsapp).toEqual({ transport: 'log' });
    expect(config.autoDispatch).toBe(true);
    expect(config.dispatchIntervalSeconds).toBe(60);
    expect(config.maxAttempts).toBe(5);
    expect(config.maxDeferHours).toBe(24);
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

  it('carga una configuración de WhatsApp BuilderBot completa', () => {
    const config = loadNotificationsConfig({
      ...builderBotSource,
      WHATSAPP_SESSION_NAME: '  semilleros  ',
      WHATSAPP_PAIRING_PHONE: '  +57 (300) 000-0001. ',
    });

    expect(config.whatsapp).toEqual({
      transport: 'builderbot',
      builderbot: {
        provider: 'baileys',
        sessionName: 'semilleros',
        pairingPhone: '+573000000001',
      },
    });
  });

  it('aplica los valores por defecto de BuilderBot (baileys, sesión "whatsapp" y sin teléfono)', () => {
    const config = loadNotificationsConfig({
      NOTIFICATIONS_WHATSAPP_TRANSPORT: 'builderbot',
    });

    expect(config.whatsapp).toEqual({
      transport: 'builderbot',
      builderbot: {
        provider: 'baileys',
        sessionName: 'whatsapp',
        pairingPhone: null,
      },
    });
  });

  it('normaliza WHATSAPP_PAIRING_PHONE quitando espacios, guiones, puntos y paréntesis', () => {
    const variantes = [
      '+57 300 000 0001',
      '+57-300-000-0001',
      '+57.300.000.0001',
      ' +57 (300) 000 0001 ',
      '+57(300)000-0001.',
    ];

    for (const variante of variantes) {
      const config = loadNotificationsConfig({
        NOTIFICATIONS_WHATSAPP_TRANSPORT: 'builderbot',
        WHATSAPP_PAIRING_PHONE: variante,
      });

      expect(config.whatsapp).toEqual({
        transport: 'builderbot',
        builderbot: {
          provider: 'baileys',
          sessionName: 'whatsapp',
          pairingPhone: '+573000000001',
        },
      });
    }
  });

  it('deja WHATSAPP_PAIRING_PHONE en null cuando está vacío', () => {
    const config = loadNotificationsConfig({
      NOTIFICATIONS_WHATSAPP_TRANSPORT: 'builderbot',
      WHATSAPP_PAIRING_PHONE: '   ',
    });

    expect(config.whatsapp).toEqual({
      transport: 'builderbot',
      builderbot: {
        provider: 'baileys',
        sessionName: 'whatsapp',
        pairingPhone: null,
      },
    });
  });

  it('ignora los ajustes de BuilderBot cuando el transporte no es builderbot', () => {
    const config = loadNotificationsConfig({
      NOTIFICATIONS_WHATSAPP_TRANSPORT: 'log',
      WHATSAPP_PROVIDER: 'desconocido',
      WHATSAPP_SESSION_NAME: 'Sesión Inválida',
      WHATSAPP_PAIRING_PHONE: 'sin-formato',
    });

    expect(config.whatsapp).toEqual({ transport: 'log' });
  });

  it('carga los ajustes generales del despachador', () => {
    const config = loadNotificationsConfig({
      NOTIFICATIONS_AUTO_DISPATCH: 'false',
      NOTIFICATIONS_DISPATCH_INTERVAL: '5',
      NOTIFICATIONS_MAX_ATTEMPTS: '20',
      NOTIFICATIONS_MAX_DEFER_HOURS: '48',
    });

    expect(config.autoDispatch).toBe(false);
    expect(config.dispatchIntervalSeconds).toBe(5);
    expect(config.maxAttempts).toBe(20);
    expect(config.maxDeferHours).toBe(48);
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
    expect(error.message).toContain('builderbot');
    expect(error.message).toContain('log');
    expect(error.message).toContain('disabled');
  });

  it('rechaza un WHATSAPP_PROVIDER desconocido y lista los permitidos', () => {
    const error = loadError({
      NOTIFICATIONS_WHATSAPP_TRANSPORT: 'builderbot',
      WHATSAPP_PROVIDER: 'cloud-api',
    });

    expect(error.message).toContain('WHATSAPP_PROVIDER');
    expect(error.message).toContain('baileys');
  });

  it('valida el formato de WHATSAPP_SESSION_NAME', () => {
    for (const sessionName of ['Semilleros', 'semilleros bot', 'semilleros/bot', 'a'.repeat(41)]) {
      const error = loadError({
        NOTIFICATIONS_WHATSAPP_TRANSPORT: 'builderbot',
        WHATSAPP_SESSION_NAME: sessionName,
      });

      expect(error.message).toContain('WHATSAPP_SESSION_NAME');
    }
  });

  it('acepta WHATSAPP_SESSION_NAME con minúsculas, dígitos, guiones y guiones bajos', () => {
    const config = loadNotificationsConfig({
      NOTIFICATIONS_WHATSAPP_TRANSPORT: 'builderbot',
      WHATSAPP_SESSION_NAME: 'semilleros_2026-01',
    });

    expect(config.whatsapp).toEqual({
      transport: 'builderbot',
      builderbot: {
        provider: 'baileys',
        sessionName: 'semilleros_2026-01',
        pairingPhone: null,
      },
    });
  });

  it('exige que WHATSAPP_PAIRING_PHONE sea un número E.164', () => {
    const invalidos = [
      '573000000001', // sin «+»
      '+0573000000001', // empieza por 0
      '+573000', // demasiado corto
      '+5730000000000000', // demasiado largo
      '+57 300 abc 0001', // caracteres no numéricos
      '+', // solo el prefijo
    ];

    for (const pairingPhone of invalidos) {
      const error = loadError({
        NOTIFICATIONS_WHATSAPP_TRANSPORT: 'builderbot',
        WHATSAPP_PAIRING_PHONE: pairingPhone,
      });

      expect(error.message).toContain('WHATSAPP_PAIRING_PHONE');
    }
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

  it('usa 24 horas por defecto para NOTIFICATIONS_MAX_DEFER_HOURS', () => {
    expect(loadNotificationsConfig({}).maxDeferHours).toBe(24);
  });

  it('acepta un NOTIFICATIONS_MAX_DEFER_HOURS válido entre 1 y 168', () => {
    expect(loadNotificationsConfig({ NOTIFICATIONS_MAX_DEFER_HOURS: '1' }).maxDeferHours).toBe(1);
    expect(loadNotificationsConfig({ NOTIFICATIONS_MAX_DEFER_HOURS: '72' }).maxDeferHours).toBe(72);
    expect(loadNotificationsConfig({ NOTIFICATIONS_MAX_DEFER_HOURS: '168' }).maxDeferHours).toBe(168);
  });

  it('valida NOTIFICATIONS_MAX_DEFER_HOURS entre 1 y 168', () => {
    for (const value of ['0', '169', 'abc']) {
      const error = loadError({ NOTIFICATIONS_MAX_DEFER_HOURS: value });

      expect(error.message).toContain('NOTIFICATIONS_MAX_DEFER_HOURS');
    }
  });

  it('no incluye SMTP_PASSWORD en los mensajes de error', () => {
    const error = loadError({ ...smtpSource, EMAIL_FROM: 'sin-arroba' });

    expect(error.message).not.toContain(SMTP_SECRET);
  });
});
