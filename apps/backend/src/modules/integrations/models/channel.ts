import type { NotificationChannel, NotificationKind } from '../../../generated/prisma/enums';

/** Mensaje ya redactado que se envía como copia de una novedad. */
export interface OutboundMessage {
  kind: NotificationKind;
  subject: string;
  body: string;
}

/**
 * Error de envío.
 * - `retryable = false`: reintentar no servirá (p. ej. destinatario inválido o credenciales rechazadas).
 * - `deferred = true`: el canal no está disponible por ahora (p. ej. WhatsApp desconectado). La copia
 *   espera sin gastar intentos hasta `NOTIFICATIONS_MAX_DEFER_HOURS` desde que se encoló.
 */
export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly deferred = false,
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
