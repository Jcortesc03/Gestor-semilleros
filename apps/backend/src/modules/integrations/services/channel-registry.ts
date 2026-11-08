import { Logger } from '@nestjs/common';
import type { NotificationsConfig } from '../../../config/notifications.config.types';
import type { NotificationChannel } from '../../../generated/prisma/enums';
import type { ChannelSender } from '../models/channel';
import { LogSender } from './channels/log.sender';
import { SmtpEmailSender } from './channels/smtp-email.sender';
import { BuilderBotWhatsAppSender } from './channels/builderbot-whatsapp.sender';
import type { WhatsAppGateway } from './whatsapp/whatsapp-gateway.service';

/** Token de inyección: lista de canales activos. Las pruebas lo reemplazan por canales falsos. */
export const CHANNEL_SENDERS = Symbol('CHANNEL_SENDERS');
/** Token de inyección: configuración de notificaciones. */
export const NOTIFICATIONS_CONFIG = Symbol('NOTIFICATIONS_CONFIG');

/** Token de inyección: conexión de WhatsApp por BuilderBot, o `null` si el transporte no es `builderbot`. */
export const WHATSAPP_GATEWAY = Symbol('WHATSAPP_GATEWAY');

/** Construye los canales según la configuración (`disabled` no crea canal). */
export function buildChannelSenders(config: NotificationsConfig, whatsapp: WhatsAppGateway | null): ChannelSender[] {
  const logger = new Logger('NotificationLog');
  const senders: ChannelSender[] = [];
  if (config.email.transport === 'smtp') senders.push(new SmtpEmailSender(config.email.smtp));
  else if (config.email.transport === 'log') senders.push(new LogSender('EMAIL', logger));
  if (config.whatsapp.transport === 'builderbot' && whatsapp) senders.push(new BuilderBotWhatsAppSender(whatsapp));
  else if (config.whatsapp.transport === 'log') senders.push(new LogSender('WHATSAPP', logger));
  return senders;
}

export function senderFor(senders: readonly ChannelSender[], channel: NotificationChannel): ChannelSender | undefined {
  return senders.find((s) => s.channel === channel);
}
