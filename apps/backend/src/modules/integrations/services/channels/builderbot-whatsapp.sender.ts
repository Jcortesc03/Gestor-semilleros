import { NotificationChannel } from '../../../../generated/prisma/enums';
import type { ChannelSender, OutboundMessage } from '../../models/channel';
import type { WhatsAppGateway } from '../whatsapp/whatsapp-gateway.service';

/** Máximo de caracteres por mensaje de WhatsApp que se envía (el límite de la plataforma es mayor). */
export const MAX_WHATSAPP_TEXT = 4000;

/** Texto de la copia: asunto en negrita (formato de WhatsApp) y cuerpo, truncado si es muy largo. */
export function formatWhatsAppText(message: OutboundMessage): string {
  const text = `*${message.subject}*\n\n${message.body}`;
  return text.length <= MAX_WHATSAPP_TEXT ? text : `${text.slice(0, MAX_WHATSAPP_TEXT - 1)}…`;
}

/** Canal de WhatsApp que envía a través del provider de BuilderBot configurado. */
export class BuilderBotWhatsAppSender implements ChannelSender {
  readonly channel = NotificationChannel.WHATSAPP;

  constructor(private readonly gateway: WhatsAppGateway) {}

  send(address: string, message: OutboundMessage): Promise<void> {
    return this.gateway.sendText(address, formatWhatsAppText(message));
  }
}
