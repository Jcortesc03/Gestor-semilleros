import type { AnnouncementKind, NotificationChannel } from '../../../generated/prisma/enums';

/** Mensaje ya redactado que se envía como copia de una novedad. */
export interface OutboundMessage {
  kind: AnnouncementKind;
  subject: string;
  body: string;
}

/**
 * Error de envío. `retryable = false` indica que reintentar no servirá
 * (p. ej. destinatario inválido o credenciales rechazadas).
 */
export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'DeliveryError';
  }
}

/** Canal externo: envía un mensaje a una dirección (correo o teléfono E.164). */
export interface ChannelSender {
  readonly channel: NotificationChannel;
  send(address: string, message: OutboundMessage): Promise<void>;
}
