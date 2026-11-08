import type { BuilderBotWhatsAppConfig } from '../../../config/notifications.config.types';

/**
 * Lo que el backend usa de un provider de BuilderBot (`ProviderClass`): eventos estándar
 * (`ready`, `require_action`, `auth_failure`, `host`) y `sendMessage`. Todos los providers
 * de BuilderBot (Baileys, Meta, Twilio, WPPConnect…) exponen esta misma forma.
 */
export interface BuilderBotProviderLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
  sendMessage(to: string, message: string, options?: Record<string, unknown>): Promise<unknown>;
}

/** Provider ya construido, con su forma de arrancar y detener la conexión. */
export interface WhatsAppProviderHandle {
  provider: BuilderBotProviderLike;
  /** Abre la conexión. Las novedades de estado llegan por los eventos del provider. */
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Imagen PNG del QR que genera el provider, si la genera (ruta absoluta). */
  qrImagePath?: string;
}

/** Construye un provider. Se carga de forma diferida para no cargar Baileys si no se usa. */
export type WhatsAppProviderFactory = (config: BuilderBotWhatsAppConfig) => Promise<WhatsAppProviderHandle>;

export type WhatsAppConnectionState =
  | 'stopped'
  | 'starting'
  | 'awaiting_qr'
  | 'awaiting_pairing_code'
  | 'connected'
  | 'auth_failure';

export interface WhatsAppStatus {
  provider: string;
  state: WhatsAppConnectionState;
  /** Número vinculado (sin datos de otros usuarios), cuando está conectado. */
  connectedPhone: string | null;
  /** Texto del QR a escanear (solo en `awaiting_qr`). */
  qr: string | null;
  /** Código de emparejamiento (solo en `awaiting_pairing_code`). */
  pairingCode: string | null;
  /** Último aviso del provider (p. ej. el motivo de `auth_failure`). */
  detail: string | null;
  updatedAt: string;
}
