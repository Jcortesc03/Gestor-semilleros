/** Configuración de las copias de novedades por correo y WhatsApp (ADR 0005). */
export interface SmtpConfig {
  host: string;
  port: number;
  /** TLS implícito (puerto 465). Con `false` se usa STARTTLS si el servidor lo ofrece. */
  secure: boolean;
  /** Credenciales opcionales; se definen juntas o ninguna. */
  user: string | null;
  password: string | null;
  /** Remitente, p. ej. `"Semilleros" <no-responder@example.test>`. */
  from: string;
}

/** Providers de BuilderBot disponibles. Para añadir uno, ver `WHATSAPP_PROVIDER_FACTORIES`. */
export const WHATSAPP_PROVIDERS = ['baileys'] as const;
export type WhatsAppProviderName = (typeof WHATSAPP_PROVIDERS)[number];

/** WhatsApp mediante BuilderBot (ADR 0006). */
export interface BuilderBotWhatsAppConfig {
  provider: WhatsAppProviderName;
  /** Nombre de la sesión: Baileys guarda las credenciales en `<cwd>/<sessionName>_sessions/`. */
  sessionName: string;
  /**
   * Número E.164 del teléfono emisor. Si se define, Baileys se vincula con un código de
   * emparejamiento en lugar del QR (útil en servidores sin pantalla).
   */
  pairingPhone: string | null;
}

export type EmailConfig = { transport: 'smtp'; smtp: SmtpConfig } | { transport: 'log' | 'disabled' };
export type WhatsAppConfig = { transport: 'builderbot'; builderbot: BuilderBotWhatsAppConfig } | { transport: 'log' | 'disabled' };

export interface NotificationsConfig {
  email: EmailConfig;
  whatsapp: WhatsAppConfig;
  /** Si es false, los envíos pendientes solo se procesan llamando al despachador. */
  autoDispatch: boolean;
  dispatchIntervalSeconds: number;
  maxAttempts: number;
  /**
   * Horas que una copia puede esperar en la bandeja de salida (p. ej. mientras WhatsApp está
   * desconectado). Pasado ese tiempo se descarta (`SKIPPED`) para no enviar avisos viejos.
   */
  maxDeferHours: number;
}
