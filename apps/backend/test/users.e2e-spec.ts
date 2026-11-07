import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
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
