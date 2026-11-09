import type { INestApplication } from '@nestjs/common';
import { buildProject, buildWorld, type World } from './fixtures';
import { createTestApp, newAgent, resetDatabase } from './helpers';

describe('Analítica (e2e)', () => {
  let app: INestApplication;
  let world: World;
  let projectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    world = await buildWorld(app);
    projectId = (await buildProject(world)).id;
    const { prisma, ids } = world;

    // Proyecto en la facultad B (fuera del alcance del decano de A).
    otherProjectId = (
      await prisma.project.create({
        data: { title: 'Otro proyecto', areaId: world.area.id, createdById: ids.admin, faculties: { create: [{ facultyId: world.facultyB.id }] } },
      })
    ).id;

    const board = await prisma.board.create({
      data: { projectId, title: 'Tablero', dueDate: new Date('2026-10-15'), responsibleTutorId: ids.tutor, responsibleStudentId: ids.leader },
    });
    const onTime = await prisma.activity.create({
      data: { boardId: board.id, authorId: ids.leader, title: 'A tiempo', progressStatus: 'DONE', completedAt: new Date('2026-10-14T15:00:00Z'), createdAt: new Date('2026-10-01T15:00:00Z') },
    });
    await prisma.activity.create({
      data: { boardId: board.id, authorId: ids.leader, title: 'Tarde', progressStatus: 'DONE', completedAt: new Date('2026-10-20T15:00:00Z'), createdAt: new Date('2026-10-01T15:00:00Z') },
    });
    await prisma.activity.create({ data: { boardId: board.id, authorId: ids.leader, title: 'Pendiente', createdAt: new Date('2026-10-02T15:00:00Z') } });
    await prisma.activityAssignee.create({ data: { activityId: onTime.id, userId: ids.student, assignedById: ids.leader } });
    await prisma.activityAttachment.create({ data: { activityId: onTime.id, kind: 'LINK', url: 'https://example.test/evidencia', createdById: ids.student } });
    await prisma.meeting.create({
      data: { projectId, organizerId: ids.tutor, reason: 'Seguimiento', startsAt: new Date('2026-10-05T15:00:00Z'), durationMinutes: 45, status: 'FINISHED', participants: { create: [{ userId: ids.student }] } },
    });

    const other = await prisma.board.create({
      data: { projectId: otherProjectId, title: 'Ajeno', dueDate: new Date('2026-12-01'), responsibleTutorId: ids.tutor2, responsibleStudentId: ids.outsider },
    });
    await prisma.activity.create({ data: { boardId: other.id, authorId: ids.outsider, title: 'Ajena', createdAt: new Date('2026-10-03T15:00:00Z') } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('exige sesión y uno de los roles permitidos', async () => {
    await newAgent(app).get('/api/analytics').expect(401);
    await (await world.as('tutor')).get('/api/analytics').expect(403);
    await (await world.as('student')).get('/api/analytics/filters').expect(403);
  });

  it('el administrador ve todo, con totales de la plataforma', async () => {
    const res = await (await world.as('admin')).get('/api/analytics').expect(200);
    const body = res.body;
    expect(body.scope.global).toBe(true);
    expect(body.users.platform.total).toBe(10);
    expect(body.activities.total).toBe(4);
    expect(body.activities.onTime).toEqual({ evaluated: 2, onTime: 1, late: 1, rate: 0.5 });
    expect(body.meetings).toMatchObject({ total: 1, totalMinutes: 45 });
    expect(body.attachments).toMatchObject({ total: 1, byKind: { LINK: 1, DOCUMENT: 0 } });
    expect(body.faculties.map((f: { name: string }) => f.name)).toEqual(['Facultad A', 'Facultad B']);
    expect(body.tutors[0]).toMatchObject({ id: world.ids.tutor, done: 2, meetingsOrganized: 1 });
    expect(body.weekdays).toHaveLength(7);
  });

  it('el decano solo ve sus facultades y recibe 403 fuera de su alcance', async () => {
    const dean = await world.as('dean');
    const filters = (await dean.get('/api/analytics/filters').expect(200)).body;
    expect(filters.projects).toEqual([{ id: projectId, name: 'Proyecto de prueba' }]);
    expect(filters.tutors).toEqual([{ id: world.ids.tutor, name: expect.any(String) }]);

    const body = (await dean.get('/api/analytics').expect(200)).body;
    expect(body.users.platform).toBeNull();
    expect(body.activities.total).toBe(3);
    expect(body.deans.map((d: { id: string }) => d.id)).toEqual([world.ids.dean]);

    await dean.get(`/api/analytics?projectId=${otherProjectId}`).expect(403);
    await dean.get(`/api/analytics?facultyId=${world.facultyB.id}`).expect(403);
  });

  it('en un proyecto compartido el decano no ve la otra facultad ni a su decano', async () => {
    await world.prisma.projectFaculty.create({ data: { projectId, facultyId: world.facultyB.id } });
    const dean = await world.as('dean');
    const body = (await dean.get('/api/analytics').expect(200)).body;
    expect(body.faculties.map((f: { id: string }) => f.id)).toEqual([world.facultyA.id]);
    expect(body.deans.map((d: { id: string }) => d.id)).toEqual([world.ids.dean]);
    const filters = (await dean.get('/api/analytics/filters').expect(200)).body;
    expect(filters.faculties.map((f: { id: string }) => f.id)).toEqual([world.facultyA.id]);
    await dean.get(`/api/analytics?facultyId=${world.facultyB.id}`).expect(403);

    // El administrador sí ve ambas facultades del proyecto compartido.
    const admin = (await (await world.as('admin')).get(`/api/analytics?projectId=${projectId}`).expect(200)).body;
    expect(admin.faculties).toHaveLength(2);
  });

  it('aplica filtros y compara periodos', async () => {
    const admin = await world.as('admin');
    const body = (await admin.get(`/api/analytics?from=2026-10-02&to=2026-10-31&projectId=${projectId}`).expect(200)).body;
    expect(body.period).toEqual({ from: '2026-10-02', to: '2026-10-31' });
    expect(body.users.platform).toBeNull();
    expect(body.activities.total).toBe(1);
    expect(body.activities.onTime.evaluated).toBe(2);
    expect(body.comparison.previousPeriod).toEqual({ from: '2026-09-02', to: '2026-10-01' });
    expect(body.comparison.previous.activitiesCreated).toBe(2);
  });

  it('valida la consulta', async () => {
    const admin = await world.as('admin');
    const res = await admin.get('/api/analytics?from=2026-12-01&to=2026-01-01').expect(400);
    expect(res.body.errors).toContain('from no puede ser posterior a to.');
    await admin.get('/api/analytics?areaId=00000000-0000-4000-8000-000000000000').expect(404);
  });
});
