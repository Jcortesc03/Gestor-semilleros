import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { SmtpConfig } from '../../../../config/notifications.config.types';
import { NotificationChannel } from '../../../../generated/prisma/enums';
import { DeliveryError, type ChannelSender, type OutboundMessage } from '../../models/channel';

/** Opciones mínimas con las que se construye el transporte SMTP. */
interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
}

type SmtpTransport = Pick<Transporter, 'sendMail' | 'close'>;

/** Canal de correo basado en SMTP. */
export class SmtpEmailSender implements ChannelSender {
  readonly channel = NotificationChannel.EMAIL;

  private readonly transport: SmtpTransport;

  constructor(
    private readonly config: SmtpConfig,
    transportFactory: (options: SmtpTransportOptions) => SmtpTransport = nodemailer.createTransport,
  ) {
    const options: SmtpTransportOptions = {
      host: config.host,
      port: config.port,
      secure: config.secure,
    };

    if (config.user !== null && config.password !== null) {
      options.auth = { user: config.user, pass: config.password };
    }

    this.transport = transportFactory(options);
  }

  async send(address: string, message: OutboundMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.config.from,
        to: address,
        subject: message.subject,
        text: message.body,
      });
    } catch (error) {
      throw this.toDeliveryError(error);
    }
  }

  close(): void {
    this.transport.close();
  }

  private toDeliveryError(error: unknown): DeliveryError {
    const details = (typeof error === 'object' && error !== null ? error : {}) as {
      responseCode?: unknown;
      code?: unknown;
    };

    const responseCode = typeof details.responseCode === 'number' ? details.responseCode : null;
    if (responseCode !== null && responseCode >= 500 && responseCode <= 599) {
      return new DeliveryError(`El servidor SMTP rechazó el mensaje (código ${responseCode}).`, false);
    }

    if (details.code === 'EENVELOPE') {
      return new DeliveryError('El servidor SMTP rechazó el destinatario.', false);
    }

    if (details.code === 'EAUTH') {
      return new DeliveryError('El servidor SMTP rechazó las credenciales.', false);
    }

    const code = typeof details.code === 'string' ? ` (${details.code})` : '';
    return new DeliveryError(`No se pudo enviar el correo${code}; se reintentará.`, true);
  }
}
