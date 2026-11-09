/** Permisos delegados que se piden a Microsoft (sin consentimiento de administrador obligatorio). */
export const MICROSOFT_SCOPES = 'offline_access openid profile email User.Read Calendars.ReadWrite';

export interface MicrosoftTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string;
  /** `id_token` de la respuesta de token (solo en el intercambio del código); puede faltar. */
  idToken?: string | null;
}

/** Tipo de cuenta de Microsoft (ADR 0014). */
export type MicrosoftAccountKind = 'WORK_OR_SCHOOL' | 'PERSONAL';

/** Inquilino de consumidores de Microsoft: el `tid` de todas las cuentas personales. */
export const MICROSOFT_CONSUMERS_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';

/**
 * Lee el `tid` del payload de un `id_token` SIN verificar la firma. Es aceptable porque el token
 * llega directamente del endpoint de token de Microsoft por TLS en la misma petición del
 * intercambio del código (no de un tercero) y solo se usa para clasificar la cuenta, nunca para
 * autenticar. Devuelve `null` si no es un JWT legible o no trae `tid`.
 */
export function tenantIdFromIdToken(idToken: string | null | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload !== 'object' || payload === null) return null;
    const tid = (payload as Record<string, unknown>).tid;
    return typeof tid === 'string' && tid.length > 0 ? tid : null;
  } catch {
    return null;
  }
}

/** `PERSONAL` si el `tid` es el inquilino de consumidores; `WORK_OR_SCHOOL` en cualquier otro caso. */
export function accountKindFromTenantId(tid: string | null): MicrosoftAccountKind {
  return tid !== null && tid.toLowerCase() === MICROSOFT_CONSUMERS_TENANT_ID ? 'PERSONAL' : 'WORK_OR_SCHOOL';
}

/** Fallo de OAuth. `invalidGrant`: el refresh token ya no sirve; hay que volver a vincular la cuenta. */
export class MicrosoftAuthError extends Error {
  constructor(
    message: string,
    readonly invalidGrant = false,
  ) {
    super(message);
    this.name = 'MicrosoftAuthError';
  }
}

/** Fallo de Microsoft Graph (status HTTP, 0 si fue de red). */
export class MicrosoftGraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'MicrosoftGraphError';
  }
}

export interface MicrosoftProfile {
  /** `id` del usuario en Graph (oid). */
  id: string;
  /** `mail`, o `userPrincipalName` si no tiene buzón. */
  email: string;
}

export interface OnlineEventInput {
  subject: string;
  /** Texto plano de la invitación. */
  body: string;
  startsAt: Date;
  durationMinutes: number;
  attendees: { email: string; name: string }[];
  /**
   * Enlace de la reunión aportado por el organizador (cuenta personal, ADR 0014). Si está, el
   * evento se crea sin reunión en línea de Teams y con este enlace en la ubicación y el cuerpo.
   */
  joinUrl?: string | null;
}

export interface OnlineEvent {
  eventId: string;
  joinUrl: string;
  webLink: string | null;
}

/** Operaciones de calendario de Teams que usan las reuniones (se reemplaza por uno falso en pruebas). */
export interface TeamsCalendar {
  createOnlineEvent(accessToken: string, input: OnlineEventInput): Promise<OnlineEvent>;
  cancelEvent(accessToken: string, eventId: string, comment: string): Promise<void>;
}
