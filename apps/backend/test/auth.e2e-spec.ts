import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, createUser, loginWithPassword, newAgent, resetDatabase, sessionCookie } from './helpers';

const PASSWORD = 'Clave-Prueba-123';

describe('Autenticación (e2e)', () => {
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

  describe('GET /api/auth/providers', () => {
    it('expone los proveedores de credenciales y Google', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/providers').expect(200);
      expect(Object.keys(res.body).sort()).toEqual(['credentials', 'google']);
    });
  });

  describe('GET /api/me sin sesión', () => {
    it('responde 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/me').expect(401);
      expect(res.body.message).toBe('Sesión no válida o expirada.');
    });

    it('responde 401 con una cookie de sesión manipulada', async () => {
      await request(app.getHttpServer())
        .get('/api/me')
        .set('Cookie', 'authjs.session-token=token-falso')
        .expect(401);
    });
  });

  describe('Inicio de sesión con correo y contraseña', () => {
    it('crea la sesión y /api/me devuelve el usuario con sus roles', async () => {
      const user = await createUser(app, {
        email: 'tutor@example.test',
        password: PASSWORD,
        fullName: 'Tutor de Prueba',
        roles: ['TUTOR', 'DEAN'],
      });
      const agent = newAgent(app);

      const login = await loginWithPassword(agent, 'tutor@example.test', PASSWORD);
      expect(login.status).toBe(302);
      expect(login.headers.location).not.toContain('error=');
      expect(sessionCookie(login.headers['set-cookie'])).toMatch(/HttpOnly/i);

      const me = await agent.get('/api/me').expect(200);
      expect(me.body).toEqual({
        id: user.id,
        email: 'tutor@example.test',
        fullName: 'Tutor de Prueba',
        roles: expect.arrayContaining(['TUTOR', 'DEAN']),
      });
      expect(me.body).not.toHaveProperty('passwordHash');

      const session = await agent.get('/api/auth/session').expect(200);
      expect(session.body.user).toMatchObject({ id: user.id, email: 'tutor@example.test' });
    });

    it('ignora mayúsculas y espacios en el correo', async () => {
      await createUser(app, { email: 'ana@example.test', password: PASSWORD });
      const agent = newAgent(app);
      await loginWithPassword(agent, '  ANA@Example.TEST ', PASSWORD);
      await agent.get('/api/me').expect(200);
    });

    it('rechaza una contraseña incorrecta sin crear sesión', async () => {
      await createUser(app, { email: 'ana@example.test', password: PASSWORD });
      const agent = newAgent(app);

      const login = await loginWithPassword(agent, 'ana@example.test', 'incorrecta');
      expect(login.status).toBe(302);
      expect(login.headers.location).toContain('error=CredentialsSignin');
      expect(sessionCookie(login.headers['set-cookie'])).toBeUndefined();
      await agent.get('/api/me').expect(401);
    });

    it('responde igual a un correo inexistente y a una contraseña incorrecta (sin enumeración)', async () => {
      await createUser(app, { email: 'ana@example.test', password: PASSWORD });
      const wrongPassword = await loginWithPassword(newAgent(app), 'ana@example.test', 'incorrecta');
      const unknownEmail = await loginWithPassword(newAgent(app), 'nadie@example.test', 'incorrecta');
      expect(unknownEmail.status).toBe(wrongPassword.status);
      const pathOf = (location: string) => {
        const url = new URL(location);
        return url.pathname + url.search;
      };
      expect(pathOf(unknownEmail.headers.location)).toBe(pathOf(wrongPassword.headers.location));
    });

    it('rechaza a un usuario inactivo', async () => {
      await createUser(app, { email: 'inactivo@example.test', password: PASSWORD, status: 'INACTIVE' });
      const agent = newAgent(app);
      const login = await loginWithPassword(agent, 'inactivo@example.test', PASSWORD);
      expect(login.headers.location).toContain('error=CredentialsSignin');
      await agent.get('/api/me').expect(401);
    });

    it('rechaza a un usuario sin contraseña (registrado solo para Google)', async () => {
      await createUser(app, { email: 'google@example.test', password: null });
      const agent = newAgent(app);
      const login = await loginWithPassword(agent, 'google@example.test', 'cualquiera');
      expect(login.headers.location).toContain('error=CredentialsSignin');
      await agent.get('/api/me').expect(401);
    });

    it('rechaza el inicio de sesión sin token CSRF', async () => {
      await createUser(app, { email: 'ana@example.test', password: PASSWORD });
      const agent = newAgent(app);
      const login = await loginWithPassword(agent, 'ana@example.test', PASSWORD, false);
      expect(sessionCookie(login.headers['set-cookie'])).toBeUndefined();
      await agent.get('/api/me').expect(401);
    });
  });

  describe('Sesión activa', () => {
    it('pierde el acceso inmediatamente si el usuario es desactivado', async () => {
      const user = await createUser(app, { email: 'ana@example.test', password: PASSWORD });
      const agent = newAgent(app);
      await loginWithPassword(agent, 'ana@example.test', PASSWORD);
      await agent.get('/api/me').expect(200);

      await prisma.user.update({ where: { id: user.id }, data: { status: 'INACTIVE' } });
      await agent.get('/api/me').expect(401);
    });

    it('refleja los cambios de roles sin volver a iniciar sesión', async () => {
      const user = await createUser(app, { email: 'ana@example.test', password: PASSWORD, roles: ['STUDENT'] });
      const agent = newAgent(app);
      await loginWithPassword(agent, 'ana@example.test', PASSWORD);

      await prisma.userRole.create({ data: { userId: user.id, role: 'TUTOR' } });
      const me = await agent.get('/api/me').expect(200);
      expect(me.body.roles).toEqual(expect.arrayContaining(['STUDENT', 'TUTOR']));
    });

    it('cerrar sesión invalida el acceso', async () => {
      await createUser(app, { email: 'ana@example.test', password: PASSWORD });
      const agent = newAgent(app);
      await loginWithPassword(agent, 'ana@example.test', PASSWORD);
      await agent.get('/api/me').expect(200);

      const { body } = await agent.get('/api/auth/csrf').expect(200);
      await agent.post('/api/auth/signout').type('form').send({ csrfToken: body.csrfToken }).expect(302);
      await agent.get('/api/me').expect(401);
    });
  });

  describe('Inicio de sesión con Google', () => {
    it('redirige a Google con la URI de retorno del backend', async () => {
      const agent = newAgent(app);
      const { body } = await agent.get('/api/auth/csrf').expect(200);
      const res = await agent.post('/api/auth/signin/google').type('form').send({ csrfToken: body.csrfToken });
      expect(res.status).toBe(302);
      const location = new URL(res.headers.location);
      expect(location.hostname).toBe('accounts.google.com');
      expect(location.searchParams.get('redirect_uri')).toMatch(/\/api\/auth\/callback\/google$/);
    });
  });
});
