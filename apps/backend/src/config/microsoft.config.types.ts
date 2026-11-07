/** Integración con Microsoft Teams mediante Microsoft Graph (OAuth delegado, ADR 0007). */
export interface MicrosoftConfig {
  /** Inquilino de Entra ID: un GUID, un dominio, o `organizations` (cuentas laborales o educativas). */
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** URL registrada en Entra ID a la que Microsoft devuelve el código: `<backend>/api/integrations/microsoft/callback`. */
  redirectUri: string;
  /** Clave AES-256 (32 bytes) para cifrar los tokens y el `state` de OAuth. */
  tokenEncryptionKey: Buffer;
  /** Adónde redirigir el navegador al terminar la vinculación (p. ej. la app web). Null → respuesta JSON. */
  linkRedirectUrl: string | null;
}

/** Zona horaria con la que se muestran las fechas de las reuniones en los avisos (IANA). */
export const DEFAULT_MEETINGS_TIME_ZONE = 'America/Bogota';
