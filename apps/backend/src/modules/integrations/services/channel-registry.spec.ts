import type { NotificationsConfig, SmtpConfig } from '../../../config/notifications.config.types';
import { NotificationChannel } from '../../../generated/prisma/enums';
import { BuilderBotWhatsAppSender } from './channels/builderbot-whatsapp.sender';
import { LogSender } from './channels/log.sender';
import { SmtpEmailSender } from './channels/smtp-email.sender';
import { buildChannelSenders } from './channel-registry';
import type { WhatsAppGateway } from './whatsapp/whatsapp-gateway.service';

const smtp: SmtpConfig = {
  host: 'smtp.example.test',
  port: 587,
  secure: false,
  user: null,
  password: null,
  from: '"Semilleros" <no-responder@example.test>',
};

const builderbot = {
  provider: 'baileys' as const,
  sessionName: 'pruebas',
  pairingPhone: null,
};

function config(
  email: NotificationsConfig['email'],
  whatsapp: NotificationsConfig['whatsapp'],
): NotificationsConfig {
  return {
    email,
    whatsapp,
    autoDispatch: false,
    dispatchIntervalSeconds: 60,
    maxAttempts: 3,
    maxDeferHours: 24,
  };
}

function fakeGateway(): WhatsAppGateway {
  return { sendText: jest.fn() } as unknown as WhatsAppGateway;
}

describe('buildChannelSenders', () => {
  it('crea un LogSender por cada transporte en log', () => {
    const senders = buildChannelSenders(
      config({ transport: 'log' }, { transport: 'log' }),
      null,
    );

    expect(senders).toHaveLength(2);
    expect(senders[0]).toBeInstanceOf(LogSender);
    expect(senders[0].channel).toBe(NotificationChannel.EMAIL);
    expect(senders[1]).toBeInstanceOf(LogSender);
    expect(senders[1].channel).toBe(NotificationChannel.WHATSAPP);
  });

  it('no crea canales cuando ambos transportes están deshabilitados', () => {
    const senders = buildChannelSenders(
      config({ transport: 'disabled' }, { transport: 'disabled' }),
      null,
    );

    expect(senders).toHaveLength(0);
  });

  it('crea BuilderBotWhatsAppSender cuando WhatsApp usa builderbot con gateway', () => {
    const senders = buildChannelSenders(
      config({ transport: 'disabled' }, { transport: 'builderbot', builderbot }),
      fakeGateway(),
    );

    expect(senders).toHaveLength(1);
    expect(senders[0]).toBeInstanceOf(BuilderBotWhatsAppSender);
    expect(senders[0].channel).toBe(NotificationChannel.WHATSAPP);
  });

  it('no crea canal de WhatsApp con builderbot si no hay gateway', () => {
    const senders = buildChannelSenders(
      config({ transport: 'log' }, { transport: 'builderbot', builderbot }),
      null,
    );

    expect(senders).toHaveLength(1);
    expect(senders[0].channel).toBe(NotificationChannel.EMAIL);
    expect(senders.some((sender) => sender.channel === NotificationChannel.WHATSAPP)).toBe(false);
  });

  it('crea SmtpEmailSender cuando el correo usa smtp', () => {
    const senders = buildChannelSenders(
      config({ transport: 'smtp', smtp }, { transport: 'disabled' }),
      null,
    );

    expect(senders).toHaveLength(1);
    expect(senders[0]).toBeInstanceOf(SmtpEmailSender);
    expect(senders[0].channel).toBe(NotificationChannel.EMAIL);
  });
});
