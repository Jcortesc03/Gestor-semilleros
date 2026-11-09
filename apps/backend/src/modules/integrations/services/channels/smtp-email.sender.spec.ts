import type { Transporter } from 'nodemailer';
import type { SmtpConfig } from '../../../../config/notifications.config.types';
import { AnnouncementKind, NotificationChannel } from '../../../../generated/prisma/enums';
import { DeliveryError, type OutboundMessage } from '../../models/channel';
import { SmtpEmailSender } from './smtp-email.sender';

const baseConfig: SmtpConfig = {
  host: 'smtp.example.test',
  port: 587,
  secure: false,
  user: null,
  password: null,
  from: '"Semilleros" <no-responder@example.test>',
};

const message: OutboundMessage = {
  kind: AnnouncementKind.NEWS,
  subject: 'Nueva convocatoria',
  body: 'Hola equipo, ya está abierta la convocatoria.',
};

type FakeTransport = Pick<Transporter, 'sendMail' | 'close'>;

function setup(overrides: Partial<SmtpConfig> = {}) {
  const sendMail = jest.fn().mockResolvedValue({ accepted: ['estudiante@example.test'] });
  const close = jest.fn();
  const transport = { sendMail, close } as unknown as FakeTransport;
  const transportFactory = jest.fn((_options: unknown) => transport);
  const sender = new SmtpEmailSender({ ...baseConfig, ...overrides }, transportFactory);
  return { sender, sendMail, close, transportFactory };
}

async function captureDeliveryError(promise: Promise<void>): Promise<DeliveryError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DeliveryError) {
      return error;
    }
    throw error;
  }
  throw new Error('Se esperaba un DeliveryError.');
}

describe('SmtpEmailSender', () => {
  it('expone el canal EMAIL', () => {
    const { sender } = setup();
    expect(sender.channel).toBe(NotificationChannel.EMAIL);
  });

  it('crea el transporte una sola vez sin auth cuando no hay credenciales', () => {
    const { transportFactory } = setup();

    expect(transportFactory).toHaveBeenCalledTimes(1);
    expect(transportFactory.mock.calls[0][0]).toEqual({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
    });
  });

  it('incluye auth solo cuando hay usuario y contraseña', () => {
    const { transportFactory } = setup({ secure: true, user: 'usuario', password: 'secreto' });

    expect(transportFactory.mock.calls[0][0]).toEqual({
      host: 'smtp.example.test',
      port: 587,
      secure: true,
      auth: { user: 'usuario', pass: 'secreto' },
    });
  });

  it('envía exactamente el remitente, destinatario, asunto y cuerpo', async () => {
    const { sender, sendMail } = setup();

    await sender.send('estudiante@example.test', message);

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith({
      from: '"Semilleros" <no-responder@example.test>',
      to: 'estudiante@example.test',
      subject: 'Nueva convocatoria',
      text: 'Hola equipo, ya está abierta la convocatoria.',
    });
  });

  it.each([
    [{ responseCode: 550 }, false, 'rechazó el mensaje'],
    [{ responseCode: 421 }, true, 'se reintentará'],
    [{ code: 'EENVELOPE' }, false, 'rechazó el destinatario'],
    [{ code: 'EAUTH' }, false, 'rechazó las credenciales'],
    [{ code: 'ECONNECTION' }, true, 'se reintentará'],
  ])('mapea el error %j a retryable=%s', async (failure, retryable, fragment) => {
    const { sender, sendMail } = setup({ user: 'usuario', password: 'secreto' });
    sendMail.mockRejectedValueOnce(failure);

    const error = await captureDeliveryError(sender.send('estudiante@example.test', message));

    expect(error.retryable).toBe(retryable);
    expect(error.message).toContain(fragment);
    expect(error.message).not.toContain('secreto');
    expect(error.message).not.toContain('estudiante@example.test');
  });

  it('cierra el transporte', () => {
    const { sender, close } = setup();

    sender.close();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
