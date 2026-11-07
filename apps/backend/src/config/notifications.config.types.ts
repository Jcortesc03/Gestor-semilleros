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

export interface WhatsAppCloudConfig {
  /** Versión de la Graph API de Meta, p. ej. `v21.0`. */
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
  /** Plantilla aprobada en Meta con dos parámetros de cuerpo: {{1}} asunto, {{2}} texto. */
  templateName: string;
  templateLanguage: string;
}

export type EmailConfig = { transport: 'smtp'; smtp: SmtpConfig } | { transport: 'log' | 'disabled' };
export type WhatsAppConfig = { transport: 'cloud-api'; cloud: WhatsAppCloudConfig } | { transport: 'log' | 'disabled' };

export interface NotificationsConfig {
  email: EmailConfig;
  whatsapp: WhatsAppConfig;
  /** Si es false, los envíos pendientes solo se procesan llamando al despachador. */
  autoDispatch: boolean;
  dispatchIntervalSeconds: number;
  maxAttempts: number;
}
