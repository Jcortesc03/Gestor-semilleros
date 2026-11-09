import type { INestApplication } from '@nestjs/common';
import { CHANNEL_SENDERS, DeliveryDispatcher, DeliveryError, type ChannelSender, type OutboundMessage } from '../src/modules/integrations';
import type { NotificationChannel } from '../src/generated/prisma/enums';
import { buildProject, buildWorld, type Person, type World } from './fixtures';
import { createTestApp, resetDatabase } from './helpers';

/** Canal falso: guarda lo enviado y permite simular fallos. */
class FakeSender implements ChannelSender {
  sent: { address: string; message: OutboundMessage }[] = [];
  failWith: Error | null = null;
  constructor(readonly channel: NotificationChannel) {}
  async send(address: string, message: OutboundMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push({ address, message });
  }
}

describe('Novedades, notificaciones y copias por correo/WhatsApp (e2e)', () => {
  const email = new FakeSender('EMAIL');
  const whatsapp = new FakeSender('WHATSAPP');
  let app: INestApplication;
  let world: World;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp([{ token: CHANNEL_SENDERS, value: [email, whatsapp] }]);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    world = await buildWorld(app);
    projectId = (await buildProject(world)).id;
    for (const s of [email, whatsapp]) {
      s.sent = [];
      s.failWith = null;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const dispatch = () => app.get(DeliveryDispatcher).runOnce();
  const publish = async (by: Person, body: Record<string, unknown>, status = 201) =>
    (await (await world.as(by)).post('/api/announcements').send({ title: 'Convocatoria', content: 'Detalles', ...body }).expect(status)).body;
  const feedTitles = async (person: Person) =>
    ((await (await world.as(person)).get('/api/announcements').expect(200)).body.items as { title: string }[]).map((a) => a.title);
  const emailOf = (person: Person) => `${person.toLowerCase()}@example.test`;

  describe('publicación y audiencias', () => {
    it('el administrador publica para todos y cada usuario recibe copia por correo', async () => {
      const created = await publish('admin', { kind: 'NEWS', audiences: [{ type: 'ALL' }] });
      expect(created).toMatchObject({
        kind: 'NEWS',
        title: 'Convocatoria',
        author: { id: world.ids.admin },
        audiences: [{ type: 'ALL' }],
        queuedDeliveries: 9, // todos menos el autor; WhatsApp está desactivado por defecto
      });

      expect(await feedTitles('outsider')).toEqual(['Convocatoria']);
      expect(await dispatch()).toEqual({ sent: 9, retrying: 0, failed: 0, skipped: 0, deferred: 0 });
      expect(email.sent.map((s) => s.address).sort()).not.toContain(emailOf('admin'));
      expect(email.sent[0].message).toEqual({ kind: 'NEWS', subject: '[Noticia] Convocatoria', body: expect.stringContaining('Detalles') });
      expect(whatsapp.sent).toEqual([]);
      expect(await dispatch()).toEqual({ sent: 0, retrying: 0, failed: 0, skipped: 0, deferred: 0 });
    });

    it('el encargado de área publica para su área: llega a los participantes de sus proyectos', async () => {
      const created = await publish('areaManager', { kind: 'NEWS', audiences: [{ type: 'AREA', areaId: world.area.id }] });
      expect(created.queuedDeliveries).toBe(4); // tutor, líder y dos estudiantes; el autor no cuenta
      for (const p of ['areaManager', 'tutor', 'leader', 'student', 'student2'] as const) expect(await feedTitles(p)).toEqual(['Convocatoria']);
      for (const p of ['outsider', 'dean', 'tutor2'] as const) expect(await feedTitles(p)).toEqual([]);
    });

    it('una audiencia por rol solo llega a ese rol', async () => {
      await publish('admin', { audiences: [{ type: 'ROLE', role: 'TUTOR' }] });
      expect(await feedTitles('tutor')).toEqual(['Convocatoria']);
      expect(await feedTitles('tutor2')).toEqual(['Convocatoria']);
      expect(await feedTitles('student')).toEqual([]);
    });

    it('el encargado de área publica AREA de sus áreas y ROLE, pero no ALL, FACULTY ni PROJECT (ADR 0010, sección 9)', async () => {
      const otherArea = await world.prisma.area.create({ data: { name: 'Otra área' } });
      await publish('areaManager', { kind: 'NOTIFICATION', audiences: [{ type: 'AREA', areaId: world.area.id }] }, 403);
      await publish('areaManager', { audiences: [{ type: 'ALL' }] }, 403);
      await publish('areaManager', { audiences: [{ type: 'FACULTY', facultyId: world.facultyA.id }] }, 403);
      await publish('areaManager', { audiences: [{ type: 'PROJECT', projectId }] }, 403);
      await publish('areaManager', { audiences: [{ type: 'AREA', areaId: otherArea.id }] }, 403);
      await publish('areaManager', { audiences: [{ type: 'AREA', areaId: world.area.id }] }, 201);
      await publish('areaManager', { audiences: [{ type: 'ROLE', role: 'TUTOR' }] }, 201);
    });

    it('el decano notifica a su facultad: llega a los participantes de sus proyectos (RN-52)', async () => {
      const created = await publish('dean', { kind: 'NOTIFICATION', audiences: [{ type: 'FACULTY', facultyId: world.facultyA.id }] });
      expect(created.audiences).toEqual([{ type: 'FACULTY', faculty: { id: world.facultyA.id, name: 'Facultad A' } }]);
      expect(created.queuedDeliveries).toBe(4);

      for (const p of ['tutor', 'leader', 'student', 'student2', 'dean'] as const) expect(await feedTitles(p)).toEqual(['Convocatoria']);
      for (const p of ['outsider', 'otherDean', 'tutor2'] as const) expect(await feedTitles(p)).toEqual([]);
      await (await world.as('outsider')).get(`/api/announcements/${created.id}`).expect(404);
    });

    it('el decano publica para proyectos de sus facultades, no para facultades ajenas ni para todos', async () => {
      await publish('dean', { audiences: [{ type: 'PROJECT', projectId }] }, 201);
      await publish('dean', { audiences: [{ type: 'FACULTY', facultyId: world.facultyB.id }] }, 403);
      await publish('dean', { audiences: [{ type: 'ALL' }] }, 403);
      await publish('otherDean', { audiences: [{ type: 'PROJECT', projectId }] }, 403);
    });

    it('el tutor publica solo a sus proyectos; no a facultades, áreas, todos, roles ni notificaciones (ADR 0010)', async () => {
      const otherProjectId = (
        await (await world.as('admin'))
          .post('/api/projects')
          .send({ title: 'Otro proyecto', areaId: world.area.id, facultyIds: [world.facultyB.id] })
          .expect(201)
      ).body.id as string;
      await publish('tutor', { audiences: [{ type: 'PROJECT', projectId }] }, 201);
      await publish('tutor', { kind: 'CHANGE', audiences: [{ type: 'PROJECT', projectId }] }, 201);
      await publish('tutor', { audiences: [{ type: 'PROJECT', projectId: otherProjectId }] }, 403);
      await publish('tutor2', { audiences: [{ type: 'PROJECT', projectId }] }, 403);
      await publish('tutor', { audiences: [{ type: 'FACULTY', facultyId: world.facultyA.id }] }, 403);
      await publish('tutor', { audiences: [{ type: 'AREA', areaId: world.area.id }] }, 403);
      await publish('tutor', { audiences: [{ type: 'ROLE', role: 'STUDENT' }] }, 403);
      await publish('tutor', { audiences: [{ type: 'ALL' }] }, 403);
      await publish('tutor', { kind: 'NOTIFICATION', audiences: [{ type: 'PROJECT', projectId }] }, 403);

      // Un tutor con membresía inactiva deja de publicar en ese proyecto.
      await world.prisma.projectMember.updateMany({ where: { userId: world.ids.tutor, projectId }, data: { status: 'INACTIVE', leftAt: new Date() } });
      await publish('tutor', { audiences: [{ type: 'PROJECT', projectId }] }, 403);
    });

    it('el estudiante no publica', async () => {
      await publish('student', { audiences: [{ type: 'PROJECT', projectId }] }, 403);
      await publish('leader', { audiences: [{ type: 'PROJECT', projectId }] }, 403);
    });

    it('los roles se suman: el decano que también es encargado de área publica en ambos alcances', async () => {
      const otherArea = await world.prisma.area.create({ data: { name: 'Otra área' } });
      await world.prisma.userRole.create({ data: { userId: world.ids.dean, role: 'AREA_MANAGER' } });
      await world.prisma.areaManager.create({ data: { areaId: otherArea.id, userId: world.ids.dean } });
      await publish('dean', { audiences: [{ type: 'AREA', areaId: otherArea.id }] }, 201);
      await publish('dean', { audiences: [{ type: 'FACULTY', facultyId: world.facultyA.id }] }, 201);
      await publish('dean', { kind: 'NOTIFICATION', audiences: [{ type: 'AREA', areaId: otherArea.id }] }, 201);
      await publish('dean', { audiences: [{ type: 'ALL' }] }, 403);
    });

    it('los roles se suman: el tutor que también es encargado de área publica para su área y su proyecto', async () => {
      const otherArea = await world.prisma.area.create({ data: { name: 'Otra área' } });
      await world.prisma.userRole.create({ data: { userId: world.ids.tutor, role: 'AREA_MANAGER' } });
      await world.prisma.areaManager.create({ data: { areaId: otherArea.id, userId: world.ids.tutor } });
      await publish('tutor', { audiences: [{ type: 'AREA', areaId: otherArea.id }] }, 201);
      await publish('tutor', { audiences: [{ type: 'PROJECT', projectId }] }, 201);
      await publish('tutor', { kind: 'NOTIFICATION', audiences: [{ type: 'PROJECT', projectId }] }, 403);
      await publish('tutor', { audiences: [{ type: 'FACULTY', facultyId: world.facultyA.id }] }, 403);
    });

    it('valida el cuerpo y que existan los destinos', async () => {
      const invalid = await publish('admin', { title: '', audiences: [] }, 400);
      expect(invalid.message).toBe('Datos inválidos.');
      const missing = await publish('admin', { audiences: [{ type: 'PROJECT', projectId: crypto.randomUUID() }] }, 400);
      expect(missing.errors).toEqual(['Alguno de los proyectos indicados no existe.']);
    });

    it('filtra el feed por tipo y lo pagina (ADR 0017)', async () => {
      await publish('admin', { title: 'Uno', kind: 'NEWS', audiences: [{ type: 'ALL' }] });
      await publish('admin', { title: 'Dos', kind: 'NOTIFICATION', audiences: [{ type: 'ALL' }] });
      await publish('admin', { title: 'Tres', kind: 'NEWS', audiences: [{ type: 'ALL' }] });
      const student = await world.as('student');
      const notifications = (await student.get('/api/announcements?kind=NOTIFICATION').expect(200)).body;
      expect(notifications).toMatchObject({ total: 1, page: 1, pageSize: 50 });
      expect(notifications.items.map((a: { title: string }) => a.title)).toEqual(['Dos']);

      const first = (await student.get('/api/announcements?pageSize=2').expect(200)).body;
      expect(first).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(first.items.map((a: { title: string }) => a.title)).toEqual(['Tres', 'Dos']);
      const second = (await student.get('/api/announcements?page=2&pageSize=2').expect(200)).body;
      expect(second.items.map((a: { title: string }) => a.title)).toEqual(['Uno']);
      expect((await student.get('/api/announcements?page=3&pageSize=2').expect(200)).body).toEqual({ items: [], total: 3, page: 3, pageSize: 2 });

      expect((await student.get('/api/announcements?pageSize=0').expect(400)).body.errors).toEqual(['pageSize debe ser un entero entre 1 y 100.']);
      expect((await student.get('/api/announcements?page=0').expect(400)).body.errors).toEqual(['page debe ser un entero mayor o igual que 1.']);
      expect((await student.get('/api/announcements?limit=1').expect(400)).body.errors).toEqual(['Campos no permitidos: limit.']);
    });
  });

  describe('preferencias', () => {
    it('por defecto: correo activado y WhatsApp desactivado en todos los tipos', async () => {
      const res = await (await world.as('student')).get('/api/me/notification-preferences').expect(200);
      expect(res.body.phone).toBeNull();
      expect(res.body.preferences).toHaveLength(10);
      for (const p of res.body.preferences) expect(p.enabled).toBe(p.channel === 'EMAIL');
    });

    it('activar WhatsApp exige teléfono', async () => {
      const res = await (await world.as('student'))
        .put('/api/me/notification-preferences')
        .send({ preferences: [{ kind: 'NOTIFICATION', channel: 'WHATSAPP', enabled: true }] })
        .expect(400);
      expect(res.body.errors).toEqual(['Para recibir copias por WhatsApp debes registrar un teléfono.']);
    });

    it('cada usuario elige qué tipos recibe y por qué canal', async () => {
      const student = await world.as('student');
      const res = await student
        .put('/api/me/notification-preferences')
        .send({
          phone: '+57 300 000 0001',
          preferences: [
            { kind: 'NOTIFICATION', channel: 'WHATSAPP', enabled: true },
            { kind: 'NOTIFICATION', channel: 'EMAIL', enabled: false },
          ],
        })
        .expect(200);
      expect(res.body.phone).toBe('+573000000001');
      expect(res.body.preferences).toEqual(
        expect.arrayContaining([
          { kind: 'NOTIFICATION', channel: 'WHATSAPP', enabled: true },
          { kind: 'NOTIFICATION', channel: 'EMAIL', enabled: false },
          { kind: 'NEWS', channel: 'EMAIL', enabled: true },
        ]),
      );
      // Persisten.
      expect((await student.get('/api/me/notification-preferences').expect(200)).body).toEqual(res.body);

      await publish('dean', { kind: 'NOTIFICATION', audiences: [{ type: 'PROJECT', projectId }] });
      await dispatch();
      expect(whatsapp.sent.map((s) => s.address)).toEqual(['+573000000001']);
      expect(email.sent.map((s) => s.address).sort()).toEqual([emailOf('leader'), emailOf('student2'), emailOf('tutor')].sort());

      // Las novedades de otro tipo siguen llegando por correo.
      email.sent = [];
      await publish('admin', { kind: 'NEWS', audiences: [{ type: 'ROLE', role: 'STUDENT' }] });
      await dispatch();
      expect(email.sent.map((s) => s.address)).toContain(emailOf('student'));
    });

    it('requiere sesión', async () => {
      const { default: request } = await import('supertest');
      await request(app.getHttpServer()).get('/api/me/notification-preferences').expect(401);
    });
  });

  describe('conexión de WhatsApp (BuilderBot)', () => {
    it('el administrador consulta el estado; con transporte log no hay conexión ni QR', async () => {
      const admin = await world.as('admin');
      expect((await admin.get('/api/integrations/whatsapp/status').expect(200)).body).toEqual({ transport: 'log' });
      const qr = await admin.get('/api/integrations/whatsapp/qr').expect(404);
      expect(qr.body.message).toBe('No hay un QR pendiente de escanear.');
    });

    it('solo el administrador accede', async () => {
      await (await world.as('dean')).get('/api/integrations/whatsapp/status').expect(403);
      await (await world.as('student')).get('/api/integrations/whatsapp/qr').expect(403);
    });
  });

  describe('envíos', () => {
    it('reintenta los fallos transitorios y marca como fallidos los definitivos', async () => {
      const created = await publish('dean', { audiences: [{ type: 'PROJECT', projectId }] });
      email.failWith = new DeliveryError('Servidor no disponible.', true);
      expect(await dispatch()).toEqual({ sent: 0, retrying: 4, failed: 0, skipped: 0, deferred: 0 });
      // El próximo intento está programado en el futuro: no se reenvía de inmediato.
      expect(await dispatch()).toEqual({ sent: 0, retrying: 0, failed: 0, skipped: 0, deferred: 0 });

      await world.prisma.notificationDelivery.updateMany({ data: { nextAttemptAt: new Date(0) } });
      email.failWith = new DeliveryError('Destinatario rechazado.', false);
      expect(await dispatch()).toEqual({ sent: 0, retrying: 0, failed: 4, skipped: 0, deferred: 0 });

      const summary = await (await world.as('dean')).get(`/api/announcements/${created.id}/deliveries`).expect(200);
      expect(summary.body.EMAIL).toEqual({ PENDING: 0, SENT: 0, FAILED: 4, SKIPPED: 0 });
      const stored = await world.prisma.notificationDelivery.findFirstOrThrow();
      expect(stored).toMatchObject({ attempts: 2, lastError: 'Destinatario rechazado.' });

      await (await world.as('student')).get(`/api/announcements/${created.id}/deliveries`).expect(403);
    });

    it('si WhatsApp no está conectado la copia espera sin gastar intentos y sale al reconectar', async () => {
      await (await world.as('student'))
        .put('/api/me/notification-preferences')
        .send({ phone: '+573000000001', preferences: [{ kind: 'NEWS', channel: 'WHATSAPP', enabled: true }] })
        .expect(200);
      await publish('dean', { audiences: [{ type: 'PROJECT', projectId }] });

      whatsapp.failWith = new DeliveryError('WhatsApp no está conectado; la copia espera a que se reconecte.', true, true);
      expect(await dispatch()).toEqual({ sent: 4, retrying: 0, failed: 0, skipped: 0, deferred: 1 });
      const waiting = await world.prisma.notificationDelivery.findFirstOrThrow({ where: { channel: 'WHATSAPP' } });
      expect(waiting).toMatchObject({ status: 'PENDING', attempts: 0 });

      // Muchos ciclos sin conexión no agotan los intentos.
      for (let i = 0; i < 8; i++) {
        await world.prisma.notificationDelivery.updateMany({ where: { channel: 'WHATSAPP' }, data: { nextAttemptAt: new Date(0) } });
        expect((await dispatch()).deferred).toBe(1);
      }
      expect(await world.prisma.notificationDelivery.findFirstOrThrow({ where: { channel: 'WHATSAPP' } })).toMatchObject({
        status: 'PENDING',
        attempts: 0,
      });

      whatsapp.failWith = null;
      await world.prisma.notificationDelivery.updateMany({ where: { channel: 'WHATSAPP' }, data: { nextAttemptAt: new Date(0) } });
      expect(await dispatch()).toEqual({ sent: 1, retrying: 0, failed: 0, skipped: 0, deferred: 0 });
      expect(whatsapp.sent.map((s) => s.address)).toEqual(['+573000000001']);
    });

    it('descarta las copias que llevan más de 24 h sin poder enviarse', async () => {
      await publish('dean', { audiences: [{ type: 'PROJECT', projectId }] });
      email.failWith = new DeliveryError('Canal no disponible.', true, true);
      expect((await dispatch()).deferred).toBe(4);

      const dayAndAHourAgo = new Date(Date.now() - 25 * 3_600_000);
      await world.prisma.notificationDispatch.updateMany({ data: { scheduledFor: dayAndAHourAgo } });
      await world.prisma.notificationDelivery.updateMany({ data: { nextAttemptAt: new Date(0) } });
      email.failWith = null; // aunque el canal ya volvió, la copia está vencida
      expect(await dispatch()).toEqual({ sent: 0, retrying: 0, failed: 0, skipped: 4, deferred: 0 });
      expect(email.sent).toEqual([]);
      const stored = await world.prisma.notificationDelivery.findFirstOrThrow();
      expect(stored.status).toBe('SKIPPED');
      expect(stored.lastError).toMatch(/24 h/);
    });

    it('omite a los usuarios desactivados después de encolar', async () => {
      await publish('dean', { audiences: [{ type: 'PROJECT', projectId }] });
      await world.prisma.user.update({ where: { id: world.ids.student }, data: { status: 'INACTIVE' } });
      expect(await dispatch()).toEqual({ sent: 3, retrying: 0, failed: 0, skipped: 1, deferred: 0 });
    });

    it('un usuario desactivado no recibe copias externas ni aparece como destinatario (ADR 0011)', async () => {
      await (await world.as('admin')).post(`/api/users/${world.ids.student}/deactivate`).expect(200);
      const created = await publish('dean', { audiences: [{ type: 'PROJECT', projectId }] });
      expect(created.queuedDeliveries).toBe(3);
      expect(await dispatch()).toEqual({ sent: 3, retrying: 0, failed: 0, skipped: 0, deferred: 0 });
      expect(email.sent.map((s) => s.address)).not.toContain(emailOf('student'));
    });

    it('el tutor elimina sus propias novedades, no las ajenas', async () => {
      const created = await publish('tutor', { audiences: [{ type: 'PROJECT', projectId }] });
      await (await world.as('tutor2')).delete(`/api/announcements/${created.id}`).expect(404);
      await (await world.as('student')).delete(`/api/announcements/${created.id}`).expect(403);
      await (await world.as('tutor')).delete(`/api/announcements/${created.id}`).expect(204);
      expect(await feedTitles('student')).toEqual([]);
    });

    it('al eliminar la novedad se cancelan las copias pendientes', async () => {
      const created = await publish('dean', { audiences: [{ type: 'PROJECT', projectId }] });
      await (await world.as('otherDean')).delete(`/api/announcements/${created.id}`).expect(404);
      await (await world.as('student')).delete(`/api/announcements/${created.id}`).expect(403);
      await (await world.as('dean')).delete(`/api/announcements/${created.id}`).expect(204);

      expect(await dispatch()).toEqual({ sent: 0, retrying: 0, failed: 0, skipped: 0, deferred: 0 });
      expect(email.sent).toEqual([]);
      expect(await feedTitles('student')).toEqual([]);
      await (await world.as('dean')).get(`/api/announcements/${created.id}`).expect(404);
    });
  });
});
