import type { INestApplication } from '@nestjs/common';
import type TestAgent from 'supertest/lib/agent';
import { MicrosoftGraphError, MicrosoftAuthError } from '../src/modules/integrations/services/microsoft/microsoft.types';
import {
  CHANNEL_SENDERS,
  DeliveryDispatcher,
  MICROSOFT_OAUTH,
  MICROSOFT_PROFILE,
  TEAMS_CALENDAR,
  type ChannelSender,
  type MicrosoftOAuth,
  type MicrosoftProfileReader,
  type MicrosoftTokens,
  type OnlineEventInput,
  type OutboundMessage,
  type TeamsCalendar,
} from '../src/modules/integrations';
import { buildProject, buildWorld, PASSWORD, type Person, type World } from './fixtures';
import { createTestApp, createUser, loginWithPassword, newAgent, resetDatabase } from './helpers';

/** OAuth falso: el `code` lleva el correo de la cuenta de Microsoft que se vincula. */
class FakeOAuth implements MicrosoftOAuth {
  /** `tid` del id_token que devuelve el intercambio; null = sin id_token. */
  tid: string | null = 'f8cdef31-a31e-4b4a-93e4-5f571e91255a';
  refreshError: Error | null = null;
  refreshed = 0;
  authorizeUrl(state: string, challenge: string) {
    return `https://login.example.test/authorize?state=${encodeURIComponent(state)}&challenge=${challenge}`;
  }
  async exchangeCode(code: string): Promise<MicrosoftTokens> {
    const part = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const idToken = this.tid === null ? null : `${part({ alg: 'none' })}.${part({ tid: this.tid })}.firma`;
    return { accessToken: `at:${code}`, refreshToken: `rt:${code}`, expiresAt: new Date(Date.now() + 3_600_000), scopes: 'Calendars.ReadWrite', idToken };
  }
  async refresh(refreshToken: string): Promise<MicrosoftTokens> {
    if (this.refreshError) throw this.refreshError;
    this.refreshed++;
    return { accessToken: refreshToken.replace('rt:', 'at2:'), refreshToken, expiresAt: new Date(Date.now() + 3_600_000), scopes: 'Calendars.ReadWrite' };
  }
}

class FakeProfile implements MicrosoftProfileReader {
  async getMe(accessToken: string) {
    const email = accessToken.replace(/^at\d?:/, '');
    return { id: `oid-${email}`, email };
  }
}

/** Calendario de Teams falso: guarda los eventos creados y cancelados. */
class FakeCalendar implements TeamsCalendar {
  created: { token: string; input: OnlineEventInput }[] = [];
  cancelled: { token: string; eventId: string; comment: string }[] = [];
  failWith: Error | null = null;
  async createOnlineEvent(token: string, input: OnlineEventInput) {
    if (this.failWith) throw this.failWith;
    this.created.push({ token, input });
    const n = this.created.length;
    return { eventId: `evento-${n}`, joinUrl: input.joinUrl ?? `https://teams.example.test/reunion-${n}`, webLink: null };
  }
  async cancelEvent(token: string, eventId: string, comment: string) {
    this.cancelled.push({ token, eventId, comment });
  }
}

class FakeSender implements ChannelSender {
  sent: { address: string; message: OutboundMessage }[] = [];
  constructor(readonly channel: 'EMAIL' | 'WHATSAPP') {}
  async send(address: string, message: OutboundMessage) {
    this.sent.push({ address, message });
  }
}

describe('Reuniones con Microsoft Teams (e2e)', () => {
  const oauth = new FakeOAuth();
  const calendar = new FakeCalendar();
  const email = new FakeSender('EMAIL');
  let app: INestApplication;
  let world: World;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp([
      { token: MICROSOFT_OAUTH, value: oauth },
      { token: MICROSOFT_PROFILE, value: new FakeProfile() },
      { token: TEAMS_CALENDAR, value: calendar },
      { token: CHANNEL_SENDERS, value: [email] },
    ]);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    world = await buildWorld(app);
    projectId = (await buildProject(world)).id;
    calendar.created = [];
    calendar.cancelled = [];
    calendar.failWith = null;
    oauth.refreshError = null;
    oauth.refreshed = 0;
    email.sent = [];
  });

  afterAll(async () => {
    await app.close();
  });

  const emailOf = (p: Person) => `${p.toLowerCase()}@example.test`;
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);
  const dispatch = () => app.get(DeliveryDispatcher).runOnce();

  /** Vincula la cuenta de Microsoft de una persona siguiendo connect → callback. */
  async function linkWith(agent: TestAgent, msEmail: string) {
    const { url } = (await agent.get('/api/integrations/microsoft/connect?format=json').expect(200)).body as { url: string };
    const state = new URL(url).searchParams.get('state')!;
    return agent.get('/api/integrations/microsoft/callback').query({ code: msEmail, state });
  }

  async function link(person: Person, msEmail = `ms.${emailOf(person)}`) {
    return linkWith(await world.as(person), msEmail);
  }

  const meetingBody = (over: Record<string, unknown> = {}) => ({
    reason: 'Revisión de avances',
    startsAt: inDays(3).toISOString(),
    durationMinutes: 60,
    projectId,
    participantIds: [world.ids.leader, world.ids.student],
    ...over,
  });

  const create = async (over: Record<string, unknown> = {}, status = 201, by: Person = 'tutor') =>
    (await (await world.as(by)).post('/api/meetings').send(meetingBody(over)).expect(status)).body;

  describe('vinculación de la cuenta de Microsoft', () => {
    it('vincula, informa el estado y guarda los tokens cifrados', async () => {
      const tutor = await world.as('tutor');
      expect((await tutor.get('/api/integrations/microsoft/status').expect(200)).body).toEqual({
        configured: true,
        linked: false,
        email: null,
        linkedAt: null,
        accountType: null,
      });

      const res = await link('tutor', 'tutor.ms@example.test');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ configured: true, linked: true, email: 'tutor.ms@example.test', accountType: 'WORK_OR_SCHOOL' });

      const stored = await world.prisma.microsoftAccount.findUniqueOrThrow({ where: { userId: world.ids.tutor } });
      expect(stored.accessTokenEncrypted).not.toContain('tutor.ms');
      expect(stored.refreshTokenEncrypted.startsWith('v1.')).toBe(true);

      await tutor.delete('/api/integrations/microsoft/link').expect(204);
      expect((await tutor.get('/api/integrations/microsoft/status').expect(200)).body.linked).toBe(false);
    });

    it('connect redirige a Microsoft', async () => {
      const res = await (await world.as('tutor')).get('/api/integrations/microsoft/connect').expect(302);
      expect(res.headers.location).toMatch(/^https:\/\/login\.example\.test\/authorize\?state=/);
    });

    it('rechaza un state ajeno, manipulado o ausente', async () => {
      const tutorUrl = (await (await world.as('tutor')).get('/api/integrations/microsoft/connect?format=json')).body.url as string;
      const state = new URL(tutorUrl).searchParams.get('state')!;
      const other = await world.as('tutor2');
      const res = await other.get('/api/integrations/microsoft/callback').query({ code: 'x@example.test', state }).expect(400);
      expect(res.body.message).toMatch(/no es válido o expiró/);
      await other.get('/api/integrations/microsoft/callback').query({ code: 'x@example.test', state: `${state}x` }).expect(400);
      await other.get('/api/integrations/microsoft/callback').query({ code: 'x@example.test' }).expect(400);
      await other.get('/api/integrations/microsoft/callback').query({ error: 'access_denied' }).expect(400);
    });

    it('una cuenta de Microsoft no se vincula a dos usuarios', async () => {
      expect((await link('tutor', 'compartida@example.test')).status).toBe(200);
      const res = await link('tutor2', 'compartida@example.test');
      expect(res.status).toBe(409);
    });

    it('requiere sesión', async () => {
      const { default: request } = await import('supertest');
      await request(app.getHttpServer()).get('/api/integrations/microsoft/connect').expect(401);
    });
  });

  describe('crear reuniones', () => {
    it('detecta la cuenta personal por el tid, la guarda (también al re-vincular) y status la informa', async () => {
      oauth.tid = '9188040d-6c67-4c5b-b112-36a304b66dad';
      const res = await link('tutor', 'tutor.personal@outlook.test');
      expect(res.body).toMatchObject({ linked: true, accountType: 'PERSONAL' });
      const stored = await world.prisma.microsoftAccount.findUniqueOrThrow({ where: { userId: world.ids.tutor } });
      expect(stored.accountType).toBe('PERSONAL');
      expect((await (await world.as('tutor')).get('/api/integrations/microsoft/status')).body.accountType).toBe('PERSONAL');

      oauth.tid = 'f8cdef31-a31e-4b4a-93e4-5f571e91255a';
      expect((await link('tutor', 'tutor.personal@outlook.test')).body.accountType).toBe('WORK_OR_SCHOOL');
    });

    it('sin id_token se asume cuenta laboral o educativa', async () => {
      oauth.tid = null;
      expect((await link('tutor')).body.accountType).toBe('WORK_OR_SCHOOL');
    });

    it('exige la cuenta de Microsoft vinculada', async () => {
      const res = await create({}, 409);
      expect(res.message).toMatch(/Vincula tu cuenta de Microsoft/);
      expect(await world.prisma.meeting.count()).toBe(0);
    });

    it('agenda en Teams con los participantes y avisa: invitación ya, recordatorios 24 h y 1 h antes', async () => {
      await link('tutor');
      const startsAt = inDays(3);
      const meeting = await create({ startsAt: startsAt.toISOString() });
      expect(meeting).toMatchObject({
        reason: 'Revisión de avances',
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 3_600_000).toISOString(),
        status: 'SCHEDULED',
        joinUrl: 'https://teams.example.test/reunion-1',
        recordingUrl: null,
        project: { id: projectId, title: 'Proyecto de prueba' },
        organizer: { id: world.ids.tutor },
      });
      expect(meeting.participants.map((p: { id: string }) => p.id).sort()).toEqual([world.ids.leader, world.ids.student].sort());
      expect(meeting).not.toHaveProperty('externalId');

      expect(calendar.created).toHaveLength(1);
      expect(calendar.created[0].token).toBe(`at:ms.${emailOf('tutor')}`);
      expect(calendar.created[0].input).toMatchObject({ subject: 'Revisión de avances', durationMinutes: 60 });
      expect(calendar.created[0].input.attendees.map((a) => a.email).sort()).toEqual([emailOf('leader'), emailOf('student')].sort());

      const dispatches = await world.prisma.notificationDispatch.findMany({ orderBy: { scheduledFor: 'asc' } });
      expect(dispatches.map((d) => d.purpose)).toEqual(['MEETING_INVITATION', 'MEETING_REMINDER', 'MEETING_REMINDER']);
      expect(dispatches.map((d) => d.kind)).toEqual(['MEETING', 'MEETING', 'MEETING']);
      expect(dispatches[1].scheduledFor.getTime()).toBe(startsAt.getTime() - 24 * 3_600_000);
      expect(dispatches[2].scheduledFor.getTime()).toBe(startsAt.getTime() - 3_600_000);
      expect(dispatches[1].subject).toBe('[Recordatorio] Revisión de avances (mañana)');

      // Solo sale la invitación (los recordatorios están en el futuro), con el enlace de Teams.
      await dispatch();
      expect(email.sent.map((s) => s.address).sort()).toEqual([emailOf('leader'), emailOf('student')].sort());
      expect(email.sent[0].message.subject).toBe('[Reunión] Revisión de avances');
      expect(email.sent[0].message.body).toContain('https://teams.example.test/reunion-1');

      // El recordatorio incluye al organizador.
      email.sent = [];
      await world.prisma.notificationDispatch.updateMany({ where: { purpose: 'MEETING_REMINDER' }, data: { scheduledFor: new Date() } });
      await world.prisma.notificationDelivery.updateMany({ where: { status: 'PENDING' }, data: { nextAttemptAt: new Date(0) } });
      await dispatch();
      expect(new Set(email.sent.map((s) => s.address))).toEqual(new Set([emailOf('leader'), emailOf('student'), emailOf('tutor')]));
    });

    describe('enlace de la reunión según el tipo de cuenta (ADR 0014)', () => {
      const personalLink = 'https://meet.example.test/sala-abierta';
      beforeEach(() => {
        oauth.tid = '9188040d-6c67-4c5b-b112-36a304b66dad';
      });
      afterEach(() => {
        oauth.tid = 'f8cdef31-a31e-4b4a-93e4-5f571e91255a';
      });

      it('cuenta personal sin joinUrl: 400 y no se crea nada', async () => {
        await link('tutor');
        const res = await create({}, 400);
        expect(JSON.stringify(res)).toContain('Con una cuenta personal de Microsoft debes indicar el enlace de la reunión.');
        expect(calendar.created).toHaveLength(0);
        expect(await world.prisma.meeting.count()).toBe(0);
      });

      it('cuenta personal con joinUrl: crea la reunión con ese enlace y el evento lleva el enlace', async () => {
        await link('tutor');
        const meeting = await create({ joinUrl: personalLink });
        expect(meeting.joinUrl).toBe(personalLink);
        expect(calendar.created).toHaveLength(1);
        expect(calendar.created[0].input.joinUrl).toBe(personalLink);
        expect(calendar.created[0].input.body).toContain(personalLink);
        await dispatch();
        expect(email.sent[0].message.body).toContain(personalLink);
      });

      it('cuenta personal con un joinUrl inválido: 400', async () => {
        await link('tutor');
        await create({ joinUrl: 'http://inseguro.example.test' }, 400);
      });

      it('cuenta laboral con joinUrl: 400; sin joinUrl el flujo de Teams sigue igual', async () => {
        oauth.tid = 'f8cdef31-a31e-4b4a-93e4-5f571e91255a';
        await link('tutor');
        await create({ joinUrl: personalLink }, 400);
        expect(calendar.created).toHaveLength(0);
        const meeting = await create({});
        expect(meeting.joinUrl).toMatch(/^https:\/\/teams\.example\.test\/reunion-/);
        expect(calendar.created[0].input.joinUrl ?? null).toBeNull();
      });
    });

    it('si falta menos de una hora no programa recordatorios', async () => {
      await link('tutor');
      await create({ startsAt: new Date(Date.now() + 30 * 60_000).toISOString() });
      const purposes = (await world.prisma.notificationDispatch.findMany()).map((d) => d.purpose);
      expect(purposes).toEqual(['MEETING_INVITATION']);
    });

    it('si Teams falla no se crea la reunión (502), y pasa el motivo de una cuenta sin Teams (422)', async () => {
      await link('tutor');
      calendar.failWith = new MicrosoftGraphError('Microsoft Graph respondió 500: error', 500);
      expect((await create({}, 502)).message).toMatch(/No se pudo crear la reunión en Microsoft Teams/);
      calendar.failWith = new MicrosoftGraphError('Microsoft no generó el enlace de Teams; la cuenta vinculada debe ser laboral o educativa con Teams.', 422);
      expect((await create({}, 422)).message).toMatch(/laboral o educativa/);
      expect(await world.prisma.meeting.count()).toBe(0);
      expect(await world.prisma.notificationDispatch.count()).toBe(0);
    });

    it('crean el administrador, el tutor del proyecto, el decano de su facultad y el encargado de su área', async () => {
      for (const p of ['tutor', 'tutor2', 'admin', 'dean', 'otherDean', 'areaManager'] as const) await link(p);
      await create({}, 403, 'student'); // rol sin permiso
      await create({}, 404, 'tutor2'); // tutor ajeno al proyecto
      await create({}, 404, 'otherDean'); // decano de otra facultad
      await create({}, 201, 'admin');
      await create({}, 201, 'dean'); // decano de la facultad del proyecto
      await create({}, 201, 'areaManager'); // encargado del área del proyecto

      // Sin proyecto, cualquiera de los cuatro roles puede crear.
      await create({ projectId: null }, 201, 'dean');
      await create({ projectId: null }, 201, 'areaManager');

      const res = await create({ participantIds: [world.ids.outsider] }, 400);
      expect(res.errors).toEqual(['Todos los participantes deben ser usuarios activos y miembros activos del proyecto.']);
    });

    it('el encargado de otra área no puede crear con ese proyecto, pero sí sin proyecto', async () => {
      const otherArea = await world.prisma.area.create({ data: { name: 'Otra área' } });
      const otherManager = await createUser(app, {
        email: 'encargado.otro@example.test',
        password: PASSWORD,
        roles: ['AREA_MANAGER'],
      });
      await world.prisma.areaManager.create({ data: { areaId: otherArea.id, userId: otherManager.id } });
      const agent = newAgent(app);
      await loginWithPassword(agent, 'encargado.otro@example.test', PASSWORD);
      await linkWith(agent, 'ms.encargado.otro@example.test');

      await agent.post('/api/meetings').send(meetingBody()).expect(404);
      const meeting = await agent.post('/api/meetings').send(meetingBody({ projectId: null })).expect(201);
      expect(meeting.body.project).toBeNull();
    });

    it('sin proyecto, el tutor invita a usuarios activos del sistema', async () => {
      await link('tutor2');
      const meeting = await create({ projectId: null, participantIds: [world.ids.outsider, world.ids.tutor2] }, 201, 'tutor2');
      expect(meeting.project).toBeNull();
      expect(meeting.participants.map((p: { id: string }) => p.id)).toEqual([world.ids.outsider]); // el organizador no se repite
    });

    it('valida el cuerpo', async () => {
      await link('tutor');
      const res = await create({ startsAt: '2020-01-01T10:00:00Z', durationMinutes: 0 }, 400);
      expect(res.message).toBe('Datos inválidos.');
    });

    it('renueva el token vencido y, si Microsoft lo revocó, pide volver a vincular', async () => {
      await link('tutor');
      await world.prisma.microsoftAccount.update({ where: { userId: world.ids.tutor }, data: { accessTokenExpiresAt: new Date(0) } });
      await create();
      expect(oauth.refreshed).toBe(1);
      expect(calendar.created[0].token).toBe(`at2:ms.${emailOf('tutor')}`);

      await world.prisma.microsoftAccount.update({ where: { userId: world.ids.tutor }, data: { accessTokenExpiresAt: new Date(0) } });
      oauth.refreshError = new MicrosoftAuthError('invalid_grant', true);
      expect((await create({}, 409)).message).toMatch(/vuelve a vincular/);
      expect(await world.prisma.microsoftAccount.count()).toBe(0);
    });
  });

  describe('estado, cancelación y grabación', () => {
    beforeEach(async () => {
      await link('tutor');
    });

    it('cambia solo según el horario: programada → en proceso → finalizada', async () => {
      const { id } = await create();
      const tutor = await world.as('tutor');
      await world.prisma.meeting.update({ where: { id }, data: { startsAt: new Date(Date.now() - 10 * 60_000) } });
      expect((await tutor.get(`/api/meetings/${id}`).expect(200)).body.status).toBe('IN_PROGRESS');
      await world.prisma.meeting.update({ where: { id }, data: { startsAt: new Date(Date.now() - 2 * 3_600_000) } });
      expect((await tutor.get(`/api/meetings/${id}`).expect(200)).body.status).toBe('FINISHED');
      expect((await tutor.get('/api/meetings?status=FINISHED').expect(200)).body).toHaveLength(1);
    });

    it('el organizador la inicia y la finaliza a mano; los participantes no', async () => {
      const { id } = await create();
      await (await world.as('student')).patch(`/api/meetings/${id}/status`).send({ status: 'IN_PROGRESS' }).expect(403);
      const tutor = await world.as('tutor');
      await tutor.patch(`/api/meetings/${id}/status`).send({ status: 'FINISHED' }).expect(409);
      expect((await tutor.patch(`/api/meetings/${id}/status`).send({ status: 'IN_PROGRESS' }).expect(200)).body.status).toBe('IN_PROGRESS');
      expect((await tutor.patch(`/api/meetings/${id}/status`).send({ status: 'FINISHED' }).expect(200)).body.status).toBe('FINISHED');
      const res = await tutor.patch(`/api/meetings/${id}/status`).send({ status: 'CANCELLED' }).expect(409);
      expect(res.body.message).toBe('No se puede pasar una reunión de Finalizada a Cancelada.');
    });

    it('cancelarla la cancela en Teams, anula los recordatorios y avisa a los participantes', async () => {
      const { id } = await create();
      await dispatch(); // sale la invitación
      email.sent = [];

      const res = await (await world.as('tutor'))
        .patch(`/api/meetings/${id}/status`)
        .send({ status: 'CANCELLED', comment: 'Se movió el seminario' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'CANCELLED', teamsSynced: true, cancelledAt: expect.any(String) });
      expect(calendar.cancelled).toEqual([{ token: `at:ms.${emailOf('tutor')}`, eventId: 'evento-1', comment: 'Se movió el seminario' }]);

      const reminders = await world.prisma.notificationDelivery.findMany({ where: { dispatch: { purpose: 'MEETING_REMINDER' } } });
      expect(reminders.every((d) => d.status === 'SKIPPED' && d.lastError === 'Reunión cancelada.')).toBe(true);

      await dispatch();
      expect(email.sent.map((s) => s.address).sort()).toEqual([emailOf('leader'), emailOf('student')].sort());
      expect(email.sent[0].message.subject).toBe('[Reunión cancelada] Revisión de avances');
      expect(email.sent[0].message.body).toContain('Motivo: Se movió el seminario');
      expect(email.sent[0].message.body).not.toContain('teams.example.test');
    });

    it('registra el enlace de la grabación (opcional)', async () => {
      const { id } = await create();
      const tutor = await world.as('tutor');
      await (await world.as('leader')).put(`/api/meetings/${id}/recording`).send({ recordingUrl: 'https://example.test/g' }).expect(403);
      await tutor.put(`/api/meetings/${id}/recording`).send({ recordingUrl: 'javascript:alert(1)' }).expect(400);
      const saved = await tutor.put(`/api/meetings/${id}/recording`).send({ recordingUrl: 'https://stream.example.test/grabacion' }).expect(200);
      expect(saved.body.recordingUrl).toBe('https://stream.example.test/grabacion');
      expect((await tutor.put(`/api/meetings/${id}/recording`).send({ recordingUrl: null }).expect(200)).body.recordingUrl).toBeNull();

      await tutor.patch(`/api/meetings/${id}/status`).send({ status: 'CANCELLED' }).expect(200);
      await tutor.put(`/api/meetings/${id}/recording`).send({ recordingUrl: 'https://example.test/g' }).expect(409);
    });

    it('cada usuario ve solo sus reuniones (organizador o participante)', async () => {
      const { id } = await create();
      expect((await (await world.as('student')).get('/api/meetings').expect(200)).body.map((m: { id: string }) => m.id)).toEqual([id]);
      expect((await (await world.as('student2')).get('/api/meetings').expect(200)).body).toEqual([]);
      await (await world.as('outsider')).get(`/api/meetings/${id}`).expect(404);
      await (await world.as('admin')).get(`/api/meetings/${id}`).expect(200);
    });
  });
});
