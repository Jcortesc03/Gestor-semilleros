import { Logger } from '@nestjs/common';
import type { NotificationChannel } from '../../../../generated/prisma/enums';
import type { ChannelSender, OutboundMessage } from '../../models/channel';

/** Enmascara una dirección de correo o un teléfono para poder registrarla. */
export function maskAddress(address: string): string {
  if (address.includes('@')) {
    const at = address.indexOf('@');
    const local = address.slice(0, at);
    const domain = address.slice(at + 1);
    return `${local.charAt(0)}***@${domain}`;
  }

  const digits = address.replace(/\D/g, '');
  return `+***${digits.slice(-4)}`;
}

/** Canal de registro: no envía nada, solo deja constancia en el log. */
export class LogSender implements ChannelSender {
  constructor(
    readonly channel: NotificationChannel,
    private readonly logger: Logger = new Logger('NotificationLog'),
  ) {}

  async send(address: string, message: OutboundMessage): Promise<void> {
    this.logger.log(`[${this.channel}] → ${maskAddress(address)} · ${message.subject}`);
  }
}
