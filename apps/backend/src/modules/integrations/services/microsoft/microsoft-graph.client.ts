import {
  MicrosoftGraphError,
  type MicrosoftProfile,
  type OnlineEvent,
  type OnlineEventInput,
  type TeamsCalendar,
} from './microsoft.types';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const GRAPH_TIMEOUT_MS = 15_000;

const MISSING_TEAMS_LINK_MESSAGE =
  'Microsoft no generó el enlace de Teams; la cuenta vinculada debe ser laboral o educativa con Teams.';

interface GraphEventPayload {
  id?: unknown;
  webLink?: unknown;
  onlineMeeting?: { joinUrl?: unknown } | null;
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Fecha ISO en UTC sin la `Z` final, como exige Microsoft Graph. */
function graphDateTime(date: Date): string {
  return date.toISOString().slice(0, -1);
}

/** Extrae `error.message` del cuerpo de error de Microsoft Graph, si existe. */
function graphErrorMessage(payload: unknown): string | null {
  const body = readJsonObject(payload);
  const error = readJsonObject(body?.error);
  return readNonEmptyString(error?.message);
}

export class MicrosoftGraphClient implements TeamsCalendar {
  constructor(private readonly fetchFn: typeof fetch = globalThis.fetch) {}

  async getMe(accessToken: string): Promise<MicrosoftProfile> {
    const response = await this.send(accessToken, 'GET', '/me?$select=id,mail,userPrincipalName');
    await this.assertOk(response);

    const payload = readJsonObject(await this.readJson(response));
    const id = readNonEmptyString(payload?.id);
    const email =
      readNonEmptyString(payload?.mail) ??
      readNonEmptyString(payload?.userPrincipalName);

    if (id === null || email === null) {
      throw new MicrosoftGraphError(
        'Microsoft Graph devolvió un perfil sin identificador o correo.',
        response.status,
      );
    }

    return { id, email };
  }

  async createOnlineEvent(
    accessToken: string,
    input: OnlineEventInput,
  ): Promise<OnlineEvent> {
    const end = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
    const requestBody = {
      subject: input.subject,
      body: { contentType: 'text', content: input.body },
      start: { dateTime: graphDateTime(input.startsAt), timeZone: 'UTC' },
      end: { dateTime: graphDateTime(end), timeZone: 'UTC' },
      attendees: input.attendees.map((attendee) => ({
        emailAddress: { address: attendee.email, name: attendee.name },
        type: 'required',
      })),
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
      allowNewTimeProposals: false,
    };

    const response = await this.send(accessToken, 'POST', '/me/events', requestBody, {
      Prefer: 'outlook.timezone="UTC"',
    });
    await this.assertOk(response);

    const payload = (readJsonObject(await this.readJson(response)) ??
      {}) as GraphEventPayload;
    const eventId = readNonEmptyString(payload.id) ?? '';
    const joinUrl = readNonEmptyString(payload.onlineMeeting?.joinUrl);

    if (joinUrl === null) {
      if (eventId !== '') {
        await this.deleteEventIgnoringErrors(accessToken, eventId);
      }
      throw new MicrosoftGraphError(MISSING_TEAMS_LINK_MESSAGE, 422);
    }

    if (eventId === '') {
      throw new MicrosoftGraphError(
        'Microsoft Graph devolvió un evento sin identificador.',
        response.status,
      );
    }

    return {
      eventId,
      joinUrl,
      webLink: readNonEmptyString(payload.webLink),
    };
  }

  async cancelEvent(
    accessToken: string,
    eventId: string,
    comment: string,
  ): Promise<void> {
    const response = await this.send(
      accessToken,
      'POST',
      `/me/events/${encodeURIComponent(eventId)}/cancel`,
      { comment },
    );

    if (response.status === 404) {
      // El evento ya no existe: se considera cancelado.
      return;
    }

    await this.assertOk(response);
  }

  private async deleteEventIgnoringErrors(
    accessToken: string,
    eventId: string,
  ): Promise<void> {
    try {
      await this.send(accessToken, 'DELETE', `/me/events/${encodeURIComponent(eventId)}`);
    } catch {
      // El evento puede quedar huérfano; el error relevante es la falta de enlace.
    }
  }

  private async send(
    accessToken: string,
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      ...extraHeaders,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      return await this.fetchFn(`${GRAPH_BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
      });
    } catch {
      throw new MicrosoftGraphError('No se pudo contactar a Microsoft Graph.', 0);
    }
  }

  private async assertOk(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }

    const detail = graphErrorMessage(await this.readJson(response));
    const message =
      detail === null
        ? `Microsoft Graph respondió ${response.status}.`
        : `Microsoft Graph respondió ${response.status}: ${detail}`;
    throw new MicrosoftGraphError(message, response.status);
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}
