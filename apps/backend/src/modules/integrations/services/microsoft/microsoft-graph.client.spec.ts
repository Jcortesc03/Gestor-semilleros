import { MicrosoftGraphClient } from './microsoft-graph.client';
import { MicrosoftGraphError, type OnlineEventInput } from './microsoft.types';

const TOKEN = 'token-acceso-privado';
const BASE = 'https://graph.microsoft.com/v1.0';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const input: OnlineEventInput = {
  subject: 'Reunión de seguimiento',
  body: 'Revisión del avance',
  startsAt: new Date('2026-11-10T15:00:00.000Z'),
  durationMinutes: 45,
  attendees: [{ email: 'tutor@example.test', name: 'Tutora Prueba' }],
};

describe('MicrosoftGraphClient', () => {
  const fetchFn = jest.fn();
  const client = new MicrosoftGraphClient(fetchFn as unknown as typeof fetch);

  beforeEach(() => {
    fetchFn.mockReset();
  });

  describe('getMe', () => {
    it('consulta /me con Bearer y devuelve id y correo', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ id: 'oid-1', mail: 'ana@example.test', userPrincipalName: 'upn@example.test' }));
      await expect(client.getMe(TOKEN)).resolves.toEqual({ id: 'oid-1', email: 'ana@example.test' });

      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/me?$select=id,mail,userPrincipalName`);
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('usa userPrincipalName si no hay mail', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ id: 'oid-1', mail: null, userPrincipalName: 'upn@example.test' }));
      await expect(client.getMe(TOKEN)).resolves.toEqual({ id: 'oid-1', email: 'upn@example.test' });
    });

    it('lanza error si faltan id o correo', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ mail: 'ana@example.test' }));
      await expect(client.getMe(TOKEN)).rejects.toBeInstanceOf(MicrosoftGraphError);
    });
  });

  describe('createOnlineEvent', () => {
    it('cuenta laboral: pide la reunión de Teams y no envía ubicación', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ id: 'ev-w', onlineMeeting: { joinUrl: 'https://teams.example.test/j' } }, 201));
      await client.createOnlineEvent(TOKEN, input);
      const sent = JSON.parse((fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
      expect(sent).toMatchObject({ isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' });
      expect(sent).not.toHaveProperty('location');
    });

    it('cuenta personal: sin Teams, con el enlace en la ubicación y sin exigir enlace de Teams', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ id: 'ev-p', webLink: 'https://outlook.example.test/ev-p' }, 201));
      const link = 'https://meet.example.test/sala';
      const event = await client.createOnlineEvent(TOKEN, { ...input, body: `Texto ${link}`, joinUrl: link });
      expect(event).toEqual({ eventId: 'ev-p', joinUrl: link, webLink: 'https://outlook.example.test/ev-p' });
      const sent = JSON.parse((fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
      expect(sent).not.toHaveProperty('isOnlineMeeting');
      expect(sent).not.toHaveProperty('onlineMeetingProvider');
      expect(sent.location).toEqual({ displayName: link });
      expect((sent.body as { content: string }).content).toContain(link);
    });

    it('envía el evento con el cuerpo, headers y zona UTC exactos', async () => {
      fetchFn.mockResolvedValue(
        jsonResponse({ id: 'ev-1', webLink: 'https://outlook.example.test/ev-1', onlineMeeting: { joinUrl: 'https://teams.example.test/join' } }, 201),
      );
      const event = await client.createOnlineEvent(TOKEN, input);
      expect(event).toEqual({
        eventId: 'ev-1',
        joinUrl: 'https://teams.example.test/join',
        webLink: 'https://outlook.example.test/ev-1',
      });

      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/me/events`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'outlook.timezone="UTC"',
      });
      expect(JSON.parse(init.body as string)).toEqual({
        subject: 'Reunión de seguimiento',
        body: { contentType: 'text', content: 'Revisión del avance' },
        start: { dateTime: '2026-11-10T15:00:00.000', timeZone: 'UTC' },
        end: { dateTime: '2026-11-10T15:45:00.000', timeZone: 'UTC' },
        attendees: [{ emailAddress: { address: 'tutor@example.test', name: 'Tutora Prueba' }, type: 'required' }],
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness',
        allowNewTimeProposals: false,
      });
    });

    it('webLink ausente se devuelve como null', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ id: 'ev-2', onlineMeeting: { joinUrl: 'https://teams.example.test/j' } }));
      const event = await client.createOnlineEvent(TOKEN, input);
      expect(event.webLink).toBeNull();
    });

    it('sin joinUrl borra el evento y lanza 422', async () => {
      fetchFn
        .mockResolvedValueOnce(jsonResponse({ id: 'ev/3', onlineMeeting: null }, 201))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
      const error = (await client.createOnlineEvent(TOKEN, input).catch((e: unknown) => e)) as MicrosoftGraphError;

      expect(error).toBeInstanceOf(MicrosoftGraphError);
      expect(error.status).toBe(422);
      expect(error.message).toBe(
        'Microsoft no generó el enlace de Teams; la cuenta vinculada debe ser laboral o educativa con Teams.',
      );
      expect(fetchFn).toHaveBeenCalledTimes(2);
      const [url, init] = fetchFn.mock.calls[1] as [string, RequestInit];
      expect(url).toBe(`${BASE}/me/events/ev%2F3`);
      expect(init.method).toBe('DELETE');
    });

    it('ignora el error del borrado y lanza igualmente el 422', async () => {
      fetchFn
        .mockResolvedValueOnce(jsonResponse({ id: 'ev-4' }, 201))
        .mockRejectedValueOnce(new Error('red caída'));
      const error = (await client.createOnlineEvent(TOKEN, input).catch((e: unknown) => e)) as MicrosoftGraphError;
      expect(error.status).toBe(422);
    });

    it('mapea errores HTTP sin incluir el token', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ error: { code: 'Forbidden', message: 'Acceso denegado' } }, 403));
      const error = (await client.createOnlineEvent(TOKEN, input).catch((e: unknown) => e)) as MicrosoftGraphError;
      expect(error).toBeInstanceOf(MicrosoftGraphError);
      expect(error.status).toBe(403);
      expect(error.message).toBe('Microsoft Graph respondió 403: Acceso denegado');
      expect(error.message).not.toContain(TOKEN);
    });

    it('un fallo de red produce status 0 sin el token', async () => {
      fetchFn.mockRejectedValue(new Error(`fallo con ${TOKEN}`));
      const error = (await client.createOnlineEvent(TOKEN, input).catch((e: unknown) => e)) as MicrosoftGraphError;
      expect(error.status).toBe(0);
      expect(error.message).toBe('No se pudo contactar a Microsoft Graph.');
      expect(error.message).not.toContain(TOKEN);
    });
  });

  describe('cancelEvent', () => {
    it('envía el cancel con el comentario y el id codificado', async () => {
      fetchFn.mockResolvedValue(new Response(null, { status: 202 }));
      await client.cancelEvent(TOKEN, 'ev/1=', 'Se cancela');

      const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/me/events/ev%2F1%3D/cancel`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
      expect(JSON.parse(init.body as string)).toEqual({ comment: 'Se cancela' });
    });

    it('trata 404 como ya cancelado', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ error: { message: 'no existe' } }, 404));
      await expect(client.cancelEvent(TOKEN, 'ev-1', 'x')).resolves.toBeUndefined();
    });

    it('lanza ante otros errores HTTP', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ error: { message: 'Fallo interno' } }, 500));
      const error = (await client.cancelEvent(TOKEN, 'ev-1', 'x').catch((e: unknown) => e)) as MicrosoftGraphError;
      expect(error.status).toBe(500);
      expect(error.message).toBe('Microsoft Graph respondió 500: Fallo interno');
      expect(error.message).not.toContain(TOKEN);
    });
  });
});
