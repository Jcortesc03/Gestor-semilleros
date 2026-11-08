import type { INestApplication } from '@nestjs/common';
import { buildProject, buildWorld, type World } from './fixtures';
import { createTestApp, createUser, loginWithPassword, newAgent, resetDatabase } from './helpers';

interface Section {
  role: string;
  scope: { areas: Array<{ id: string; name: string }>; faculties: Array<{ id: string; name: string }> };
  projects: { total: number; byStatus: Record<string, number>; items: Array<{ id: string; projectRole: string | null; boards: number; activities: number; activitiesDone: number }> };
  boards: { total: number; byProgress: Record<string, number>; overdue: number };
  activities: { total: number; byProgress: Record<string, number>; pendingApproval: number };
}

describe('Panel por rol (e2e)', () => {
  let app: INestApplication;
  let world: World;
  let projectId: string;
  let otherProjectId: string;
  let boardId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    world = await buildWorld(app);
    projectId = (await buildProject(world)).id;
    const { prisma, ids } = world;

    // Segundo proyecto en la facultad B, sin miembros.
    otherProjectId = (
      await prisma.project.create({
        data: {
          title: 'Otro proyecto',
          areaId: world.area.id,
          createdById: ids.admin,
          faculties: { create: [{ facultyId: world.facultyB.id }] },
        },
      })
    ).id;

    // Tablero vencido con tres actividades en el proyecto principal.
    const board = await prisma.board.create({
      data: {
        projectId,
        title: 'Tablero vencido',
        dueDate: new Date('2020-01-01'),
        responsibleTutorId: ids.tutor,
        responsibleStudentId: ids.leader,
      },
    });
    boardId = board.id;
    const mk = (title: string, progressStatus: 'PENDING' | 'DONE') =>
      prisma.activity.create({ data: { boardId, authorId: ids.leader, title, progressStatus } });
    const a1 = await mk('Hecha pendiente de aprobar', 'DONE');
    await mk('Pendiente', 'PENDING');
    const a3 = await mk('Hecha asignada', 'DONE');
    await prisma.activityAssignee.createMany({
      data: [
        { activityId: a1.id, userId: ids.student, assignedById: ids.leader },
        { activityId: a3.id, userId: ids.student2, assignedById: ids.leader },
      ],
    });

    // Un tablero y una actividad en el otro proyecto.
    const ob = await prisma.board.create({
      data: {
        projectId: otherProjectId,
        title: 'Tablero ajeno',
        dueDate: new Date('2999-01-01'),
        responsibleTutorId: ids.tutor2,
        responsibleStudentId: ids.outsider,
      },
    });
    await prisma.activity.create({ data: { boardId: ob.id, authorId: ids.outsider, title: 'Ajena' } });
  });

  afterAll(async () => {
    await app.close();
  });

  async function dashboard(person: Parameters<World['as']>[0]) {
    const res = await (await world.as(person)).get('/api/dashboard').expect(200);
    return res.body as { generatedAt: string; sections: Section[] };
  }

  it('responde 401 sin sesión', async () => {
    const res = await newAgent(app).get('/api/dashboard').expect(401);
    expect(res.body.message).toBe('Sesión no válida o expirada.');
  });

  it('el administrador ve todos los proyectos y actividades', async () => {
    const { sections } = await dashboard('admin');
    expect(sections.map((s) => s.role)).toEqual(['ADMIN']);
    const s = sections[0]!;
    expect(s.scope).toEqual({ areas: [], faculties: [] });
    expect(s.projects.total).toBe(2);
    expect(s.projects.byStatus).toEqual({ ACTIVE: 2, FINISHED: 0, CANCELLED: 0 });
    expect(s.boards).toMatchObject({ total: 2, overdue: 1 });
    expect(s.boards.byProgress).toEqual({ PENDING: 2, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 });
    expect(s.activities).toMatchObject({ total: 4, pendingApproval: 2 });
  });

  it('el encargado de área ve solo sus áreas asignadas', async () => {
    const other = await world.prisma.area.create({ data: { name: 'Área ajena' } });
    await world.prisma.project.create({
      data: { title: 'En área ajena', areaId: other.id, createdById: world.ids.admin, faculties: { create: [{ facultyId: world.facultyA.id }] } },
    });
    const s = (await dashboard('areaManager')).sections[0]!;
    expect(s.role).toBe('AREA_MANAGER');
    expect(s.scope.areas).toEqual([{ id: world.area.id, name: world.area.name }]);
    expect(s.projects.total).toBe(2);
    expect(s.projects.items.every((i) => i.projectRole === null)).toBe(true);
    expect(s.activities.total).toBe(4);
  });

  it('el decano ve solo proyectos de sus facultades vigentes', async () => {
    const s = (await dashboard('dean')).sections[0]!;
    expect(s.scope.faculties).toEqual([{ id: world.facultyA.id, name: 'Facultad A' }]);
    expect(s.projects.total).toBe(1);
    expect(s.projects.items[0]!.id).toBe(projectId);
    expect(s.activities.total).toBe(3);
  });

  it('el decano con decanato terminado no ve esa facultad', async () => {
    await world.prisma.facultyDean.updateMany({
      where: { userId: world.ids.dean },
      data: { startsAt: new Date('2019-01-01'), endsAt: new Date('2020-01-01') },
    });
    const s = (await dashboard('dean')).sections[0]!;
    expect(s.scope.faculties).toEqual([]);
    expect(s.projects.total).toBe(0);
    expect(s.activities.total).toBe(0);
  });

  it('el tutor ve solo sus proyectos con su rol', async () => {
    const s = (await dashboard('tutor')).sections[0]!;
    expect(s.role).toBe('TUTOR');
    expect(s.projects.total).toBe(1);
    expect(s.projects.items[0]).toMatchObject({ id: projectId, projectRole: 'TUTOR', boards: 1, activities: 3, activitiesDone: 2 });
    expect(s.boards.overdue).toBe(1);
    expect(s.activities.pendingApproval).toBe(2);
    expect(s.scope).toEqual({ areas: [], faculties: [] });
  });

  it('el estudiante ve solo actividades asignadas y pendingApproval 0', async () => {
    const s = (await dashboard('student')).sections[0]!;
    expect(s.role).toBe('STUDENT');
    expect(s.projects.items[0]).toMatchObject({ id: projectId, projectRole: 'STUDENT', boards: 1, activities: 1, activitiesDone: 1 });
    expect(s.activities).toMatchObject({ total: 1, pendingApproval: 0 });
    expect(s.activities.byProgress).toEqual({ PENDING: 0, IN_PROGRESS: 0, DONE: 1, CANCELLED: 0 });
  });

  it('un estudiante fuera de proyectos recibe cero', async () => {
    const s = (await dashboard('outsider')).sections[0]!;
    expect(s.projects.total).toBe(0);
    expect(s.activities.total).toBe(0);
  });

  it('un usuario con DEAN y TUTOR recibe dos secciones en orden', async () => {
    await world.prisma.userRole.create({ data: { userId: world.ids.tutor, role: 'DEAN' } });
    const facultyC = await world.prisma.faculty.create({ data: { name: 'Facultad C' } });
    await world.prisma.facultyDean.create({ data: { facultyId: facultyC.id, userId: world.ids.tutor } });
    const { sections } = await dashboard('tutor');
    expect(sections.map((s) => s.role)).toEqual(['DEAN', 'TUTOR']);
    expect(sections[0]!.scope.faculties).toEqual([{ id: facultyC.id, name: 'Facultad C' }]);
    expect(sections[0]!.projects.total).toBe(0);
    expect(sections[1]!.projects.total).toBe(1);
  });

  it('un usuario sin roles recibe sections vacío', async () => {
    const user = await createUser(app, { email: 'sinroles@example.test', password: 'Clave-Prueba-123', roles: [] });
    expect(user.id).toBeDefined();
    const agent = newAgent(app);
    await loginWithPassword(agent, 'sinroles@example.test', 'Clave-Prueba-123');
    const res = await agent.get('/api/dashboard').expect(200);
    expect(res.body.sections).toEqual([]);
  });

  it('excluye proyectos, tableros y actividades archivados', async () => {
    const now = new Date();
    await world.prisma.activity.updateMany({ where: { title: 'Pendiente' }, data: { deletedAt: now } });
    await world.prisma.project.update({ where: { id: otherProjectId }, data: { deletedAt: now } });
    const s = (await dashboard('admin')).sections[0]!;
    expect(s.projects.total).toBe(1);
    expect(s.activities.total).toBe(2);
    expect(s.boards.total).toBe(1);

    await world.prisma.board.update({ where: { id: boardId }, data: { deletedAt: now } });
    const t = (await dashboard('tutor')).sections[0]!;
    expect(t.boards).toMatchObject({ total: 0, overdue: 0 });
    expect(t.activities.total).toBe(0);
  });

  it('no cuenta como vencido un tablero terminado', async () => {
    await world.prisma.board.update({ where: { id: boardId }, data: { progressStatus: 'DONE' } });
    const s = (await dashboard('admin')).sections[0]!;
    expect(s.boards.overdue).toBe(0);
  });
});
