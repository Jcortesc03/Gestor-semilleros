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
