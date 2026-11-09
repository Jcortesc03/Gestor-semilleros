import { AnnouncementKind, NotificationChannel } from '../../../../generated/prisma/enums';
import type { OutboundMessage } from '../../models/channel';
import type { WhatsAppGateway } from '../whatsapp/whatsapp-gateway.service';
import {
  BuilderBotWhatsAppSender,
  MAX_WHATSAPP_TEXT,
  formatWhatsAppText,
} from './builderbot-whatsapp.sender';

const message: OutboundMessage = {
  kind: AnnouncementKind.NEWS,
  subject: 'Nueva convocatoria',
  body: 'Hola equipo, ya está abierta la convocatoria.',
};

function setup() {
  const sendText = jest.fn().mockResolvedValue(undefined);
  const gateway = { sendText } as unknown as WhatsAppGateway;
  const sender = new BuilderBotWhatsAppSender(gateway);
  return { sender, sendText };
}

describe('formatWhatsAppText', () => {
  it('pone el asunto en negrita y separa el cuerpo con una línea en blanco', () => {
    expect(formatWhatsAppText(message)).toBe(
      '*Nueva convocatoria*\n\nHola equipo, ya está abierta la convocatoria.',
    );
  });

  it('trunca a MAX_WHATSAPP_TEXT con un carácter de elipsis final', () => {
    const longMessage: OutboundMessage = {
      ...message,
      body: 'x'.repeat(MAX_WHATSAPP_TEXT),
    };

    const text = formatWhatsAppText(longMessage);

    expect(text).toHaveLength(MAX_WHATSAPP_TEXT);
    expect(text.endsWith('…')).toBe(true);
  });
});

describe('BuilderBotWhatsAppSender', () => {
  it('expone el canal WHATSAPP', () => {
    const { sender } = setup();

    expect(sender.channel).toBe(NotificationChannel.WHATSAPP);
  });

  it('delega en gateway.sendText con la dirección y el texto formateado', async () => {
    const { sender, sendText } = setup();

    await sender.send('+573000000001', message);

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(
      '+573000000001',
      '*Nueva convocatoria*\n\nHola equipo, ya está abierta la convocatoria.',
    );
  });
});
