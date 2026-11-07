import { Logger } from '@nestjs/common';
import type { NotificationsConfig } from '../../../config/notifications.config.types';
import type { NotificationChannel } from '../../../generated/prisma/enums';
import type { ChannelSender } from '../models/channel';
import { LogSender } from './channels/log.sender';
import { SmtpEmailSender } from './channels/smtp-email.sender';
import { WhatsAppCloudSender } from './channels/whatsapp-cloud.sender';

/** Token de inyección: lista de canales activos. Las pruebas lo reemplazan por canales falsos. */
export const CHANNEL_SENDERS = Symbol('CHANNEL_SENDERS');
/** Token de inyección: configuración de notificaciones. */
export const NOTIFICATIONS_CONFIG = Symbol('NOTIFICATIONS_CONFIG');

/** Construye los canales según la configuración (`disabled` no crea canal). */
export function buildChannelSenders(config: NotificationsConfig): ChannelSender[] {
  const logger = new Logger('NotificationLog');
  const senders: ChannelSender[] = [];
  if (config.email.transport === 'smtp') senders.push(new SmtpEmailSender(config.email.smtp));
  else if (config.email.transport === 'log') senders.push(new LogSender('EMAIL', logger));
  if (config.whatsapp.transport === 'cloud-api') senders.push(new WhatsAppCloudSender(config.whatsapp.cloud));
  else if (config.whatsapp.transport === 'log') senders.push(new LogSender('WHATSAPP', logger));
  return senders;
}

export function senderFor(senders: readonly ChannelSender[], channel: NotificationChannel): ChannelSender | undefined {
  return senders.find((s) => s.channel === channel);
}
