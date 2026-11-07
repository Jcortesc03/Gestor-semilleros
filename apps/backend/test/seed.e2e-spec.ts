import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { PasswordService } from '../src/modules/auth';
import { SEED_USERS, seedDatabase } from '../src/cli/seed-database';
import { createTestApp, loginWithPassword, newAgent, resetDatabase } from './helpers';

const SEED_PASSWORD = 'Clave-Semilla-123';

describe('Seed de desarrollo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const run = () => seedDatabase(prisma, app.get(PasswordService), SEED_PASSWORD);
  const counts = async () => ({
    users: await prisma.user.count(),
    roles: await prisma.userRole.count(),
    areas: await prisma.area.count(),
    managers: await prisma.areaManager.count(),
    faculties: await prisma.faculty.count(),
    deans: await prisma.facultyDean.count(),
    projects: await prisma.project.count(),
    projectFaculties: await prisma.projectFaculty.count(),
    members: await prisma.projectMember.count(),
  });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(app);
  });

  it('crea los 6 usuarios con sus roles globales', async () => {
    const summary = await run();
    expect(summary.users).toHaveLength(6);
    const users = await prisma.user.findMany({ include: { roles: true } });
    expect(users).toHaveLength(6);
    const rolesByEmail = Object.fromEntries(users.map((u) => [u.email, u.roles.map((r) => r.role)]));
    expect(rolesByEmail).toEqual({
      'admin@example.test': ['ADMIN'],
      'encargado.area@example.test': ['AREA_MANAGER'],
      'decano@example.test': ['DEAN'],
      'tutor@example.test': ['TUTOR'],
      'lider@example.test': ['STUDENT'],
      'estudiante@example.test': ['STUDENT'],
    });
  });

  it.each(SEED_USERS.map((u) => [u.email, u.roles] as const))('%s inicia sesión y /api/me devuelve sus roles', async (email, roles) => {
    await run();
    const agent = newAgent(app);
    const login = await loginWithPassword(agent, email, SEED_PASSWORD);
    expect(login.status).toBeLessThan(400);
    const me = await agent.get('/api/me').expect(200);
    expect(me.body).toMatchObject({ email });
    expect([...me.body.roles].sort()).toEqual([...roles].sort());
  });

  it('crea el contexto institucional y las membresías esperadas', async () => {
    await run();
    const byEmail = async (email: string) => prisma.user.findUniqueOrThrow({ where: { email } });
    const project = await prisma.project.findFirstOrThrow({ include: { faculties: true, area: true } });
    expect(project.area.name).toBe('Semillero de investigación');
    expect(project.faculties).toHaveLength(1);
    expect(project.createdById).toBe((await byEmail('decano@example.test')).id);

    const dean = await prisma.facultyDean.findFirstOrThrow({ where: { endsAt: null } });
    expect(dean.userId).toBe((await byEmail('decano@example.test')).id);
    expect(await prisma.areaManager.count({ where: { userId: (await byEmail('encargado.area@example.test')).id } })).toBe(1);

    const members = await prisma.projectMember.findMany({ include: { user: true } });
    const summary = Object.fromEntries(members.map((m) => [m.user.email, [m.projectRole, m.isPrimary, m.status, m.leftAt]]));
    expect(summary).toEqual({
      'tutor@example.test': ['TUTOR', true, 'ACTIVE', null],
      'lider@example.test': ['STUDENT_LEADER', false, 'ACTIVE', null],
      'estudiante@example.test': ['STUDENT', false, 'ACTIVE', null],
    });
  });

  it('es idempotente: dos ejecuciones dan los mismos conteos y la contraseña se restablece', async () => {
    await run();
    const first = await counts();
    await prisma.user.update({ where: { email: 'admin@example.test' }, data: { status: 'INACTIVE', passwordHash: null } });

    await run();
    expect(await counts()).toEqual(first);
    expect(first).toMatchObject({ users: 6, areas: 1, faculties: 1, deans: 1, projects: 1, projectFaculties: 1, members: 3 });

    const agent = newAgent(app);
    await loginWithPassword(agent, 'admin@example.test', SEED_PASSWORD);
    await agent.get('/api/me').expect(200);
  });
});
