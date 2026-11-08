import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { PasswordService } from '../src/modules/auth';
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
        mustChangePassword: false,
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

  describe('Cambio de contraseña obligatorio y PUT /api/me/password', () => {
    const TEMPORARY = 'Temporal-2026';
    const FRESH = 'Nueva-Clave-2026';
    const PASSWORD_CHANGE_REQUIRED = {
      message: 'Debes cambiar tu contraseña antes de continuar.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    };

    async function pendingAgent() {
      const user = await createUser(app, { email: 'ana@example.test', password: TEMPORARY, roles: ['TUTOR'] });
      await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
      const agent = newAgent(app);
      await loginWithPassword(agent, 'ana@example.test', TEMPORARY);
      return { agent, user };
    }

    it('GET /api/me sigue disponible e informa mustChangePassword', async () => {
      const { agent } = await pendingAgent();
      const me = await agent.get('/api/me').expect(200);
      expect(me.body.mustChangePassword).toBe(true);
    });

    it('el resto de endpoints protegidos responden 403 PASSWORD_CHANGE_REQUIRED, también las escrituras', async () => {
      const { agent } = await pendingAgent();
      for (const route of ['/api/projects', '/api/dashboard', '/api/announcements', '/api/users', '/api/me/notification-preferences']) {
        const res = await agent.get(route).expect(403);
        expect(res.body).toEqual(PASSWORD_CHANGE_REQUIRED);
      }
      expect((await agent.post('/api/projects').send({}).expect(403)).body).toEqual(PASSWORD_CHANGE_REQUIRED);
    });

    it('cerrar sesión sigue funcionando (Auth.js no pasa por SessionGuard)', async () => {
      const { agent } = await pendingAgent();
      const { body } = await agent.get('/api/auth/csrf').expect(200);
      await agent.post('/api/auth/signout').type('form').send({ csrfToken: body.csrfToken }).expect(302);
      await agent.get('/api/me').expect(401);
    });

    it('cambiar la contraseña levanta la restricción y la nueva contraseña sirve para entrar', async () => {
      const { agent, user } = await pendingAgent();
      await agent.put('/api/me/password').send({ currentPassword: TEMPORARY, newPassword: FRESH }).expect(204);

      expect((await agent.get('/api/me').expect(200)).body.mustChangePassword).toBe(false);
      await agent.get('/api/projects').expect(200);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.mustChangePassword).toBe(false);
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);

      const relogin = newAgent(app);
      await loginWithPassword(relogin, 'ana@example.test', FRESH);
      await relogin.get('/api/projects').expect(200);
      const old = await loginWithPassword(newAgent(app), 'ana@example.test', TEMPORARY);
      expect(old.headers.location).toContain('error=CredentialsSignin');
    });

    it('un usuario normal también puede cambiar su contraseña', async () => {
      await createUser(app, { email: 'ana@example.test', password: PASSWORD });
      const agent = newAgent(app);
      await loginWithPassword(agent, 'ana@example.test', PASSWORD);
      await agent.put('/api/me/password').send({ currentPassword: PASSWORD, newPassword: FRESH }).expect(204);
      await loginWithPassword(newAgent(app), 'ana@example.test', FRESH).then((r) => expect(r.headers.location).not.toContain('error='));
    });

    it('403 si la contraseña actual no es correcta y no cambia nada', async () => {
      const { agent, user } = await pendingAgent();
      const res = await agent.put('/api/me/password').send({ currentPassword: 'incorrecta-123', newPassword: FRESH }).expect(403);
      expect(res.body.message).toBe('La contraseña actual no es correcta.');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(true);
    });

    it('400 con la política, la actual obligatoria y que la nueva sea distinta', async () => {
      const { agent } = await pendingAgent();
      const put = (body: Record<string, unknown>) => agent.put('/api/me/password').send(body);

      for (const newPassword of ['corta1', 'SoloLetrasLargas', '12345678901', 'ana@example.test', 'ANA@example.test']) {
        const res = await put({ currentPassword: TEMPORARY, newPassword }).expect(400);
        expect(res.body.message).toBe('Datos inválidos.');
        expect(res.body.errors.length).toBeGreaterThan(0);
      }
      expect((await put({ newPassword: FRESH }).expect(400)).body.errors).toEqual(['currentPassword es obligatorio.']);
      expect((await put({ currentPassword: TEMPORARY, newPassword: TEMPORARY }).expect(400)).body.errors).toEqual([
        'La nueva contraseña debe ser distinta de la actual.',
      ]);
      expect((await put({ currentPassword: TEMPORARY }).expect(400)).body.errors).toEqual(['newPassword es obligatorio.']);
      expect((await put({ currentPassword: TEMPORARY, newPassword: FRESH, extra: 1 }).expect(400)).body.errors[0]).toMatch(/Campos no permitidos/);
    });

    it('401 sin sesión', async () => {
      await request(app.getHttpServer()).put('/api/me/password').send({ newPassword: FRESH }).expect(401);
    });

    it('quien solo usaba Google puede crear su contraseña sin indicar la actual', async () => {
      const user = await createUser(app, { email: 'google@example.test', password: null });
      const agent = newAgent(app);
      // Sin contraseña no hay inicio con credenciales: se simula una sesión ya abierta antes de perderla.
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await app.get(PasswordService).hash('Inicial-Clave-1') } });
      await loginWithPassword(agent, 'google@example.test', 'Inicial-Clave-1');
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: null } });

      await agent.put('/api/me/password').send({ newPassword: FRESH }).expect(204);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).not.toBeNull();
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
