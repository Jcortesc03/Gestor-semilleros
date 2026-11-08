/** Permisos delegados que se piden a Microsoft (sin consentimiento de administrador obligatorio). */
export const MICROSOFT_SCOPES = 'offline_access openid profile email User.Read Calendars.ReadWrite';

export interface MicrosoftTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string;
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
