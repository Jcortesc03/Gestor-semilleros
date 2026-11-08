import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { buildProject, buildWorld, PASSWORD, type World } from './fixtures';
import { createTestApp, createUser, loginWithPassword, newAgent, resetDatabase } from './helpers';

const ADMIN = { email: 'admin@example.test', password: 'Clave-Admin-123' };

describe('POST /api/users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  async function adminAgent() {
    await createUser(app, { ...ADMIN, roles: ['ADMIN'] });
    const agent = newAgent(app);
    await loginWithPassword(agent, ADMIN.email, ADMIN.password);
    return agent;
  }

  const newUser = { email: 'tutor.nuevo@example.test', fullName: 'Tutor Nuevo', roles: ['TUTOR'], password: 'Clave-Tutor-123' };

  describe('autorización', () => {
    it('responde 401 sin sesión', async () => {
      await request(app.getHttpServer()).post('/api/users').send(newUser).expect(401);
    });

    it('responde 403 si el usuario no es administrador', async () => {
      await createUser(app, { email: 'decano@example.test', password: 'Clave-Decano-1', roles: ['DEAN', 'TUTOR'] });
      const agent = newAgent(app);
      await loginWithPassword(agent, 'decano@example.test', 'Clave-Decano-1');

      const res = await agent.post('/api/users').send(newUser).expect(403);
      expect(res.body.message).toBe('No tienes permisos para realizar esta acción.');
      expect(await prisma.user.count({ where: { email: newUser.email } })).toBe(0);
    });

    it('responde 401 si el administrador fue desactivado después de iniciar sesión', async () => {
      const agent = await adminAgent();
      await prisma.user.update({ where: { email: ADMIN.email }, data: { status: 'INACTIVE' } });
      await agent.post('/api/users').send(newUser).expect(401);
    });
  });

  describe('alta', () => {
    it('crea el usuario con sus roles y sin exponer la contraseña', async () => {
      const agent = await adminAgent();
      const res = await agent.post('/api/users').send(newUser).expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        email: 'tutor.nuevo@example.test',
        fullName: 'Tutor Nuevo',
        status: 'ACTIVE',
        roles: ['TUTOR'],
        hasPassword: true,
        createdAt: expect.any(String),
      });
      expect(JSON.stringify(res.body)).not.toContain(newUser.password);

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('el usuario creado puede iniciar sesión con la contraseña asignada', async () => {
      const agent = await adminAgent();
      await agent.post('/api/users').send(newUser).expect(201);

      const tutor = newAgent(app);
      await loginWithPassword(tutor, newUser.email, newUser.password);
      const me = await tutor.get('/api/me').expect(200);
      expect(me.body).toMatchObject({ email: newUser.email, roles: ['TUTOR'] });
    });

    it('permite asignar varios roles (P-02)', async () => {
      const agent = await adminAgent();
      const res = await agent
        .post('/api/users')
        .send({ ...newUser, roles: ['TUTOR', 'DEAN'] })
        .expect(201);
      expect(res.body.roles.sort()).toEqual(['DEAN', 'TUTOR']);
    });

    it('crea usuarios sin contraseña que no pueden entrar con credenciales', async () => {
      const agent = await adminAgent();
      const { password: _omit, ...withoutPassword } = newUser;
      const res = await agent.post('/api/users').send(withoutPassword).expect(201);
      expect(res.body.hasPassword).toBe(false);

      const other = newAgent(app);
      await loginWithPassword(other, newUser.email, 'cualquier-clave');
      await other.get('/api/me').expect(401);
    });

    it('normaliza el correo a minúsculas', async () => {
      const agent = await adminAgent();
      const res = await agent
        .post('/api/users')
        .send({ ...newUser, email: '  Tutor.Nuevo@Example.TEST ' })
        .expect(201);
      expect(res.body.email).toBe('tutor.nuevo@example.test');
    });
  });

  describe('validación', () => {
    it('responde 409 si el correo ya existe, sin distinguir mayúsculas', async () => {
      const agent = await adminAgent();
      await agent.post('/api/users').send(newUser).expect(201);
      const res = await agent
        .post('/api/users')
        .send({ ...newUser, email: 'TUTOR.NUEVO@example.test' })
        .expect(409);
      expect(res.body.message).toBe('Ya existe un usuario con ese correo.');
      expect(await prisma.user.count({ where: { email: { equals: newUser.email, mode: 'insensitive' } } })).toBe(1);
    });

    it('responde 400 con la lista de errores', async () => {
      const agent = await adminAgent();
      const res = await agent
        .post('/api/users')
        .send({ email: 'no-es-correo', roles: ['SUPERUSER'], password: 'corta' })
        .expect(400);
      expect(res.body.message).toBe('Datos inválidos.');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          'email no es un correo válido.',
          'fullName es obligatorio.',
          expect.stringContaining('SUPERUSER'),
          expect.stringContaining('password'),
        ]),
      );
    });

    it('no permite fijar campos internos como el estado o el hash', async () => {
      const agent = await adminAgent();
      const res = await agent
        .post('/api/users')
        .send({ ...newUser, status: 'INACTIVE', passwordHash: 'x' })
        .expect(400);
      expect(res.body.errors[0]).toMatch(/Campos no permitidos/);
    });

    it('no crea nada si la validación falla', async () => {
      const agent = await adminAgent();
      await agent.post('/api/users').send({ ...newUser, roles: [] }).expect(400);
      expect(await prisma.user.count()).toBe(1); // solo el administrador
    });
  });
});

describe('GET /api/users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const PASSWORD = 'Clave-Directorio-1';

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    await createUser(app, { ...ADMIN, fullName: 'Adriana Administradora', roles: ['ADMIN'] });
    await createUser(app, { email: 'dean.dir@example.test', fullName: 'Dolores Decana', password: PASSWORD, roles: ['DEAN'] });
    await createUser(app, { email: 'tutor.dir@example.test', fullName: 'Tatiana Tutora', password: PASSWORD, roles: ['TUTOR'] });
    await createUser(app, { email: 'estudiante.dir@example.test', fullName: 'Esteban Estudiante', password: PASSWORD, roles: ['STUDENT'] });
    await createUser(app, { email: 'encargado.dir@example.test', fullName: 'Armando Encargado', password: PASSWORD, roles: ['AREA_MANAGER'] });
    await createUser(app, { email: 'jose.alvarez@example.test', fullName: 'José Álvarez', password: PASSWORD, roles: ['STUDENT', 'TUTOR'] });
    await createUser(app, { email: 'inactivo.dir@example.test', fullName: 'Ignacio Inactivo', status: 'INACTIVE', roles: ['TUTOR'] });
  });

  afterAll(async () => {
    await app.close();
  });

  async function sessionAs(email: string) {
    const agent = newAgent(app);
    await loginWithPassword(agent, email, email === ADMIN.email ? ADMIN.password : PASSWORD);
    return agent;
  }

  const names = (body: { fullName: string }[]) => body.map((u) => u.fullName);

  describe('autorización', () => {
    it('responde 401 sin sesión', async () => {
      await request(app.getHttpServer()).get('/api/users').expect(401);
    });

    it.each([
      ['estudiante', 'estudiante.dir@example.test'],
      ['encargado de área', 'encargado.dir@example.test'],
    ])('responde 403 si el usuario es %s', async (_rol, email) => {
      const agent = await sessionAs(email);
      const res = await agent.get('/api/users').expect(403);
      expect(res.body.message).toBe('No tienes permisos para realizar esta acción.');
    });

    it.each([
      ['administrador', ADMIN.email],
      ['decano', 'dean.dir@example.test'],
      ['tutor', 'tutor.dir@example.test'],
    ])('responde 200 al %s', async (_rol, email) => {
      const agent = await sessionAs(email);
      await agent.get('/api/users').expect(200);
    });
  });

  describe('listado', () => {
    it('devuelve solo usuarios activos, ordenados por nombre', async () => {
      const agent = await sessionAs('tutor.dir@example.test');
      const res = await agent.get('/api/users').expect(200);
      expect(names(res.body)).toEqual([
        'Adriana Administradora',
        'Armando Encargado',
        'Dolores Decana',
        'Esteban Estudiante',
        'José Álvarez',
        'Tatiana Tutora',
      ]);
    });

    it('expone exactamente id, fullName, email y roles', async () => {
      const agent = await sessionAs('tutor.dir@example.test');
      const res = await agent.get('/api/users').expect(200);
      for (const user of res.body) {
        expect(Object.keys(user).sort()).toEqual(['email', 'fullName', 'id', 'roles']);
      }
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|status|createdAt|phone/);
      expect(res.body.find((u: { email: string }) => u.email === 'jose.alvarez@example.test').roles.sort()).toEqual([
        'STUDENT',
        'TUTOR',
      ]);
    });

    it('busca por nombre sin distinguir mayúsculas ni tildes', async () => {
      const agent = await sessionAs('tutor.dir@example.test');
      expect(names((await agent.get('/api/users').query({ search: 'jose' }).expect(200)).body)).toEqual(['José Álvarez']);
      expect(names((await agent.get('/api/users').query({ search: 'JOSÉ' }).expect(200)).body)).toEqual(['José Álvarez']);
      expect(names((await agent.get('/api/users').query({ search: 'decana' }).expect(200)).body)).toEqual(['Dolores Decana']);
    });

    it('busca por correo', async () => {
      const agent = await sessionAs('tutor.dir@example.test');
      const res = await agent.get('/api/users').query({ search: 'TUTOR.DIR' }).expect(200);
      expect(names(res.body)).toEqual(['Tatiana Tutora']);
    });

    it('no encuentra a los inactivos aunque coincida el texto', async () => {
      const agent = await sessionAs('tutor.dir@example.test');
      const res = await agent.get('/api/users').query({ search: 'ignacio' }).expect(200);
      expect(res.body).toEqual([]);
    });

    it('filtra por rol global', async () => {
      const agent = await sessionAs('tutor.dir@example.test');
      expect(names((await agent.get('/api/users').query({ role: 'DEAN' }).expect(200)).body)).toEqual(['Dolores Decana']);
      expect(names((await agent.get('/api/users').query({ role: 'TUTOR' }).expect(200)).body)).toEqual([
        'José Álvarez',
        'Tatiana Tutora',
      ]);
      expect(names((await agent.get('/api/users').query({ role: 'STUDENT' }).expect(200)).body)).toEqual([
        'Esteban Estudiante',
        'José Álvarez',
      ]);
    });

    it('limita a 20 resultados por defecto y acepta hasta 50', async () => {
      for (let i = 1; i <= 22; i++) {
        await prisma.user.create({
          data: {
            email: `extra.${i}@example.test`,
            fullName: `Estudiante Extra ${String(i).padStart(2, '0')}`,
            roles: { create: [{ role: 'STUDENT' }] },
          },
        });
      }
      const agent = await sessionAs('tutor.dir@example.test');
      expect((await agent.get('/api/users').expect(200)).body).toHaveLength(20);
      expect((await agent.get('/api/users').query({ limit: 2 }).expect(200)).body).toHaveLength(2);
      expect((await agent.get('/api/users').query({ limit: 50 }).expect(200)).body).toHaveLength(28);
    });
  });

  describe('validación', () => {
    it.each([
      ['parámetro desconocido', { orderBy: 'id' }, 'Campos no permitidos: orderBy.'],
      ['búsqueda de un carácter', { search: 'a' }, 'search debe tener entre 2 y 100 caracteres.'],
      ['límite cero', { limit: '0' }, 'limit debe ser un entero entre 1 y 50.'],
      ['límite por encima del máximo', { limit: '51' }, 'limit debe ser un entero entre 1 y 50.'],
      ['límite no numérico', { limit: 'diez' }, 'limit debe ser un entero entre 1 y 50.'],
      ['rol desconocido', { role: 'SUPERUSER' }, 'role debe ser uno de'],
    ])('responde 400 por %s', async (_caso, query, expected) => {
      const agent = await sessionAs('tutor.dir@example.test');
      const res = await agent.get('/api/users').query(query).expect(400);
      expect(res.body.message).toBe('Datos inválidos.');
      expect(res.body.errors).toEqual([expect.stringContaining(expected)]);
    });
  });
});

describe('Gestión de usuarios (e2e, ADR 0011)', () => {
  let app: INestApplication;
  let world: World;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    world = await buildWorld(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const NEW_PASSWORD = 'Nueva-Clave-2026';

  async function loginAs(email: string, password: string) {
    const agent = newAgent(app);
    await loginWithPassword(agent, email, password);
    return agent;
  }

  describe('GET /api/users?status=', () => {
    beforeEach(async () => {
      await createUser(app, { email: 'inactivo@example.test', fullName: 'Ignacio Inactivo', status: 'INACTIVE', roles: ['TUTOR'] });
    });

    it('el administrador ve todos, solo activos o solo inactivos, con el campo status', async () => {
      const admin = await world.as('admin');
      const all = (await admin.get('/api/users').query({ status: 'ALL', limit: 50 }).expect(200)).body as { email: string; status: string }[];
      expect(all.find((u) => u.email === 'inactivo@example.test')?.status).toBe('INACTIVE');
      expect(all.find((u) => u.email === 'tutor@example.test')?.status).toBe('ACTIVE');

      const inactive = (await admin.get('/api/users').query({ status: 'INACTIVE' }).expect(200)).body as { email: string }[];
      expect(inactive.map((u) => u.email)).toEqual(['inactivo@example.test']);

      const active = (await admin.get('/api/users').query({ status: 'ACTIVE', limit: 50 }).expect(200)).body as { status: string }[];
      expect(active.every((u) => u.status === 'ACTIVE')).toBe(true);
    });

    it('por defecto solo lista activos y no expone status', async () => {
      const admin = await world.as('admin');
      const res = await admin.get('/api/users').query({ limit: 50 }).expect(200);
      expect(JSON.stringify(res.body)).not.toContain('inactivo@example.test');
      expect(Object.keys(res.body[0]).sort()).toEqual(['email', 'fullName', 'id', 'roles']);
    });

    it('responde 403 a un decano o tutor que usa status, y 400 al administrador con un valor inválido', async () => {
      await (await world.as('dean')).get('/api/users').query({ status: 'ALL' }).expect(403);
      await (await world.as('tutor')).get('/api/users').query({ status: 'ACTIVE' }).expect(403);
      const res = await (await world.as('admin')).get('/api/users').query({ status: 'TODOS' }).expect(400);
      expect(res.body.message).toBe('Datos inválidos.');
      expect(res.body.errors).toEqual([expect.stringContaining('status')]);
    });
  });

  describe('GET /api/users/:id', () => {
    it('devuelve el detalle sin el hash', async () => {
      const res = await (await world.as('admin')).get(`/api/users/${world.ids.tutor}`).expect(200);
      expect(res.body).toEqual({
        id: world.ids.tutor,
        email: 'tutor@example.test',
        fullName: 'Usuario de Prueba',
        status: 'ACTIVE',
        roles: ['TUTOR'],
        hasPassword: true,
        mustChangePassword: false,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash/);
    });

    it('401 sin sesión, 403 sin ser administrador y 404 si no existe o el id está mal formado', async () => {
      await request(app.getHttpServer()).get(`/api/users/${world.ids.tutor}`).expect(401);
      await (await world.as('tutor')).get(`/api/users/${world.ids.tutor}`).expect(403);
      const admin = await world.as('admin');
      await admin.get('/api/users/00000000-0000-4000-8000-000000000000').expect(404);
      const res = await admin.get('/api/users/no-es-uuid').expect(404);
      expect(res.body.message).toBe('Usuario no encontrado.');
    });
  });

  describe('PATCH /api/users/:id', () => {
    it('cambia nombre y roles', async () => {
      const admin = await world.as('admin');
      const res = await admin
        .patch(`/api/users/${world.ids.outsider}`)
        .send({ fullName: '  Nuevo   Nombre ', roles: ['STUDENT', 'TUTOR'] })
        .expect(200);
      expect(res.body.fullName).toBe('Nuevo Nombre');
      expect([...res.body.roles].sort()).toEqual(['STUDENT', 'TUTOR']);
      expect(res.body.updatedAt).not.toBe(res.body.createdAt);
    });

    it('401, 403, 404 y 400 con todos los errores', async () => {
      await request(app.getHttpServer()).patch(`/api/users/${world.ids.outsider}`).send({ fullName: 'X' }).expect(401);
      await (await world.as('tutor')).patch(`/api/users/${world.ids.outsider}`).send({ fullName: 'X' }).expect(403);
      const admin = await world.as('admin');
      await admin.patch('/api/users/00000000-0000-4000-8000-000000000000').send({ fullName: 'X' }).expect(404);

      const res = await admin.patch(`/api/users/${world.ids.outsider}`).send({ roles: [], email: 'otro@example.test' }).expect(400);
      expect(res.body.message).toBe('Datos inválidos.');
      expect(res.body.errors).toHaveLength(2);
      await admin.patch(`/api/users/${world.ids.outsider}`).send({}).expect(400);
    });

    describe('409 al quitar un rol que se ejerce', () => {
      it('tutor activo de un proyecto: nombra el proyecto y permite quitarlo tras retirarlo', async () => {
        const project = await buildProject(world);
        const admin = await world.as('admin');
        const res = await admin.patch(`/api/users/${world.ids.tutor}`).send({ roles: ['STUDENT'] }).expect(409);
        expect(res.body.message).toContain('tutor activo en los proyectos «Proyecto de prueba»');

        await world.prisma.projectMember.updateMany({
          where: { projectId: project.id, userId: world.ids.tutor },
          data: { status: 'INACTIVE', leftAt: new Date() },
        });
        await admin.patch(`/api/users/${world.ids.tutor}`).send({ roles: ['STUDENT'] }).expect(200);
      });

      it('un proyecto eliminado no cuenta', async () => {
        const project = await buildProject(world);
        await world.prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });
        await (await world.as('admin')).patch(`/api/users/${world.ids.tutor}`).send({ roles: ['DEAN'] }).expect(200);
      });

      it.each(['leader', 'student'] as const)('estudiante activo en un proyecto (%s)', async (person) => {
        await buildProject(world);
        const res = await (await world.as('admin')).patch(`/api/users/${world.ids[person]}`).send({ roles: ['TUTOR'] }).expect(409);
        expect(res.body.message).toContain('estudiante activo en los proyectos «Proyecto de prueba»');
      });

      it('decano vigente: nombra la facultad', async () => {
        const admin = await world.as('admin');
        const res = await admin.patch(`/api/users/${world.ids.dean}`).send({ roles: ['TUTOR'] }).expect(409);
        expect(res.body.message).toContain('decano vigente de las facultades «Facultad A»');

        await world.prisma.facultyDean.updateMany({ where: { userId: world.ids.dean }, data: { endsAt: new Date() } });
        await admin.patch(`/api/users/${world.ids.dean}`).send({ roles: ['TUTOR'] }).expect(200);
      });

      it('encargado de área: nombra el área', async () => {
        const admin = await world.as('admin');
        const res = await admin.patch(`/api/users/${world.ids.areaManager}`).send({ roles: ['TUTOR'] }).expect(409);
        expect(res.body.message).toContain('encargado de las áreas «Semillero de investigación»');

        await world.prisma.areaManager.deleteMany({ where: { userId: world.ids.areaManager } });
        await admin.patch(`/api/users/${world.ids.areaManager}`).send({ roles: ['TUTOR'] }).expect(200);
      });

      it('lista como máximo 5 nombres', async () => {
        for (let i = 1; i <= 7; i++) {
          const project = await world.prisma.project.create({
            data: { title: `Proyecto ${i}`, areaId: world.area.id, createdById: world.ids.admin },
          });
          await world.prisma.projectMember.create({
            data: { projectId: project.id, userId: world.ids.tutor2, projectRole: 'TUTOR' },
          });
        }
        const res = await (await world.as('admin')).patch(`/api/users/${world.ids.tutor2}`).send({ roles: ['STUDENT'] }).expect(409);
        expect(res.body.message).toContain('y 2 más');
        expect(res.body.message.match(/«/g)).toHaveLength(5);
      });

      it('no bloquea si solo se añaden roles o se cambia el nombre', async () => {
        await buildProject(world);
        const admin = await world.as('admin');
        await admin.patch(`/api/users/${world.ids.tutor}`).send({ roles: ['TUTOR', 'DEAN'] }).expect(200);
        await admin.patch(`/api/users/${world.ids.tutor}`).send({ fullName: 'Tutor Renombrado' }).expect(200);
      });
    });

    it('409 si el administrador intenta quitarse el rol ADMIN', async () => {
      const res = await (await world.as('admin')).patch(`/api/users/${world.ids.admin}`).send({ roles: ['ADMIN', 'TUTOR'] }).expect(200);
      expect(res.body.roles).toEqual(expect.arrayContaining(['ADMIN', 'TUTOR']));
      const denied = await (await world.as('admin')).patch(`/api/users/${world.ids.admin}`).send({ roles: ['TUTOR'] }).expect(409);
      expect(denied.body.message).toBe('No puedes quitarte el rol de Administrador a ti mismo.');
    });

    it('un administrador puede quitarle ADMIN a otro mientras quede uno activo', async () => {
      const other = await createUser(app, { email: 'otro.admin@example.test', roles: ['ADMIN'] });
      await (await world.as('admin')).patch(`/api/users/${other.id}`).send({ roles: ['TUTOR'] }).expect(200);
    });
  });

  describe('POST /api/users/:id/deactivate y /activate', () => {
    it('desactiva: pierde el acceso al instante, conserva su historial y no aparece en el directorio', async () => {
      const project = await buildProject(world);
      const student = await world.as('student');
      await student.get('/api/me').expect(200);

      const admin = await world.as('admin');
      const res = await admin.post(`/api/users/${world.ids.student}/deactivate`).expect(200);
      expect(res.body.status).toBe('INACTIVE');

      await student.get('/api/me').expect(401);
      const login = await loginWithPassword(newAgent(app), 'student@example.test', PASSWORD);
      expect(login.headers.location).toContain('error=CredentialsSignin');

      const membership = await world.prisma.projectMember.findFirstOrThrow({ where: { projectId: project.id, userId: world.ids.student } });
      expect(membership.status).toBe('ACTIVE');
      const directory = (await admin.get('/api/users').query({ search: 'student', limit: 50 }).expect(200)).body as { email: string }[];
      expect(directory.map((u) => u.email)).not.toContain('student@example.test');
    });

    it('reactivar devuelve el acceso y las participaciones', async () => {
      const project = await buildProject(world);
      const admin = await world.as('admin');
      await admin.post(`/api/users/${world.ids.student}/deactivate`).expect(200);
      const res = await admin.post(`/api/users/${world.ids.student}/activate`).expect(200);
      expect(res.body.status).toBe('ACTIVE');

      const student = await loginAs('student@example.test', PASSWORD);
      await student.get('/api/me').expect(200);
      await student.get(`/api/projects/${project.id}`).expect(200);
    });

    it('409 al repetir la operación, al auto-desactivarse; 404 si no existe; 403 sin ser administrador', async () => {
      const admin = await world.as('admin');
      await admin.post(`/api/users/${world.ids.student}/activate`).expect(409);
      await admin.post(`/api/users/${world.ids.student}/deactivate`).expect(200);
      const again = await admin.post(`/api/users/${world.ids.student}/deactivate`).expect(409);
      expect(again.body.message).toBe('El usuario ya está inactivo.');

      const self = await admin.post(`/api/users/${world.ids.admin}/deactivate`).expect(409);
      expect(self.body.message).toBe('No puedes desactivarte a ti mismo.');

      await admin.post('/api/users/00000000-0000-4000-8000-000000000000/deactivate').expect(404);
      await admin.post('/api/users/00000000-0000-4000-8000-000000000000/activate').expect(404);
      await (await world.as('tutor')).post(`/api/users/${world.ids.student2}/deactivate`).expect(403);
      await request(app.getHttpServer()).post(`/api/users/${world.ids.student2}/activate`).expect(401);
    });

    it('puede desactivar a otro administrador mientras quede uno activo', async () => {
      const other = await createUser(app, { email: 'otro.admin@example.test', password: PASSWORD, roles: ['ADMIN'] });
      const admin = await world.as('admin');
      await admin.post(`/api/users/${other.id}/deactivate`).expect(200);
      // el único administrador activo que queda no puede desactivarse
      await admin.post(`/api/users/${world.ids.admin}/deactivate`).expect(409);
    });
  });

  describe('PUT /api/users/:id/password y contraseña temporal', () => {
    it('flujo completo: la fija el administrador, el usuario entra, queda restringido, la cambia y accede', async () => {
      const admin = await world.as('admin');
      await admin.put(`/api/users/${world.ids.tutor}/password`).send({ password: 'Temporal-2026' }).expect(204);
      expect((await admin.get(`/api/users/${world.ids.tutor}`).expect(200)).body.mustChangePassword).toBe(true);

      const tutor = await loginAs('tutor@example.test', 'Temporal-2026');
      const me = await tutor.get('/api/me').expect(200);
      expect(me.body.mustChangePassword).toBe(true);

      for (const route of ['/api/projects', '/api/dashboard', '/api/users']) {
        const res = await tutor.get(route).expect(403);
        expect(res.body).toEqual({ message: 'Debes cambiar tu contraseña antes de continuar.', code: 'PASSWORD_CHANGE_REQUIRED' });
      }
      await tutor.post('/api/projects').send({}).expect(403);

      await tutor.put('/api/me/password').send({ currentPassword: 'Temporal-2026', newPassword: NEW_PASSWORD }).expect(204);
      expect((await tutor.get('/api/me').expect(200)).body.mustChangePassword).toBe(false);
      await tutor.get('/api/projects').expect(200);

      const relog = await loginAs('tutor@example.test', NEW_PASSWORD);
      await relog.get('/api/projects').expect(200);
      const old = await loginWithPassword(newAgent(app), 'tutor@example.test', PASSWORD);
      expect(old.headers.location).toContain('error=CredentialsSignin');
    });

    it('el administrador puede dar contraseña a quien solo usaba Google, y se le exige cambiarla', async () => {
      const google = await createUser(app, { email: 'google@example.test', password: null });
      await (await world.as('admin')).put(`/api/users/${google.id}/password`).send({ password: 'Temporal-2026' }).expect(204);
      const agent = await loginAs('google@example.test', 'Temporal-2026');
      await agent.get('/api/projects').expect(403);
      // sin contraseña previa no hace falta currentPassword; aquí ya existe, así que sí
      await agent.put('/api/me/password').send({ newPassword: NEW_PASSWORD }).expect(400);
    });

    it('400 con la política, 404, 403 y 401', async () => {
      const admin = await world.as('admin');
      const url = `/api/users/${world.ids.tutor}/password`;
      for (const password of ['corta1', 'SoloLetrasLargas', '12345678901', 'tutor@example.test', 'TUTOR@example.test']) {
        const res = await admin.put(url).send({ password }).expect(400);
        expect(res.body.message).toBe('Datos inválidos.');
        expect(res.body.errors.length).toBeGreaterThan(0);
        expect(JSON.stringify(res.body)).not.toContain(password === 'corta1' ? 'corta1' : '\u0000');
      }
      await admin.put(url).send({}).expect(400);
      await admin.put('/api/users/00000000-0000-4000-8000-000000000000/password').send({ password: 'Temporal-2026' }).expect(404);
      await (await world.as('student')).put(url).send({ password: 'Temporal-2026' }).expect(403);
      await request(app.getHttpServer()).put(url).send({ password: 'Temporal-2026' }).expect(401);
      expect((await world.prisma.user.findUniqueOrThrow({ where: { id: world.ids.tutor } })).mustChangePassword).toBe(false);
    });
  });

  describe('política en el alta', () => {
    it('POST /api/users rechaza contraseñas de 8–9 caracteres, sin número o iguales al correo', async () => {
      const admin = await world.as('admin');
      const base = { email: 'nuevo.usuario@example.test', fullName: 'Nuevo', roles: ['STUDENT'] };
      for (const password of ['Abc12345', 'SoloLetrasLargas', 'NUEVO.USUARIO@example.test']) {
        const res = await admin.post('/api/users').send({ ...base, password }).expect(400);
        expect(res.body.errors.join(' ')).toContain('password');
      }
      await admin.post('/api/users').send({ ...base, password: 'Valida-2026-x' }).expect(201);
    });
  });
});
