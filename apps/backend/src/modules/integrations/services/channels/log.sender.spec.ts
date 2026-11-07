import type { Logger } from '@nestjs/common';
import { AnnouncementKind, NotificationChannel } from '../../../../generated/prisma/enums';
import type { OutboundMessage } from '../../models/channel';
import { LogSender, maskAddress } from './log.sender';

const message: OutboundMessage = {
  kind: AnnouncementKind.NEWS,
  subject: 'Nueva convocatoria',
  body: 'Hola equipo, ya está abierta la convocatoria.',
};

describe('maskAddress', () => {
  it('enmascara un correo conservando el dominio', () => {
    expect(maskAddress('juan@example.test')).toBe('j***@example.test');
  });

  it('enmascara un teléfono conservando los últimos cuatro dígitos', () => {
    expect(maskAddress('+573000000001')).toBe('+***0001');
  });
});

describe('LogSender', () => {
  it('registra canal, dirección enmascarada y asunto para EMAIL', async () => {
    const logger = { log: jest.fn() } as unknown as Logger;
    const sender = new LogSender(NotificationChannel.EMAIL, logger);

    await sender.send('juan@example.test', message);

    expect(logger.log).toHaveBeenCalledWith('[EMAIL] → j***@example.test · Nueva convocatoria');
  });

  it('registra canal, teléfono enmascarado y asunto para WHATSAPP', async () => {
    const logger = { log: jest.fn() } as unknown as Logger;
    const sender = new LogSender(NotificationChannel.WHATSAPP, logger);

    await sender.send('+573000000001', message);

    expect(sender.channel).toBe(NotificationChannel.WHATSAPP);
    expect(logger.log).toHaveBeenCalledWith('[WHATSAPP] → +***0001 · Nueva convocatoria');
  });
});
