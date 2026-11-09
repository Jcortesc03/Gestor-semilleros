import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, createUser, resetDatabase } from './helpers';
import { loginWithPassword, newAgent } from './helpers';
import { PrismaService } from '../src/database/prisma.service';

describe('Recuperación de contraseña (e2e)', () => {
  let app: INestApplication;
  const messages: { email: string; code: string }[] = [];

  beforeEach(async () => {
    app = await createTestApp([{ token: 'PASSWORD_RECOVERY_MAILER', value: {
      send: async (email: string, code: string) => { messages.push({ email, code }); },
    } }]);
    await resetDatabase(app);
    messages.length = 0;
  });
  afterEach(async () => { await app.close(); });

  const email = 'recovery@example.test';
  const original = 'Original-12345';
  const replacement = 'Replacement-67890';
  function post(path: string, body: object) { return request(app.getHttpServer()).post(`/api/password-recovery/${path}`).send(body); }
  async function start() {
    const user = await createUser(app, { email, password: original });
    await post('request', { email }).expect(202);
    return { user, code: messages[0].code };
  }
  async function verify(code: string) {
    const result = await post('verify', { email, code }).expect(200);
    expect(result.body.resetToken).toMatch(/^[a-f0-9]{64}$/);
    return result.body.resetToken as string;
  }

  it('envía seis dígitos únicamente al correo activo registrado sin revelar si existe', async () => {
    await createUser(app, { email: 'recovery@example.test', password: 'Original-12345' });
    const known = await request(app.getHttpServer()).post('/api/password-recovery/request')
      .send({ email: ' RECOVERY@example.test ' }).expect(202);
    const unknown = await request(app.getHttpServer()).post('/api/password-recovery/request')
      .send({ email: 'unknown@example.test' }).expect(202);
    expect(known.body).toEqual(unknown.body);
    expect(messages).toEqual([{ email: 'recovery@example.test', code: expect.stringMatching(/^\d{6}$/) }]);
    expect(known.body).not.toHaveProperty('code');
    await createUser(app, { email: 'inactive@example.test', password: original, status: 'INACTIVE' });
    await createUser(app, { email: 'google@example.test', password: null });
    for (const address of ['inactive@example.test', 'google@example.test']) {
      expect((await post('request', { email: address }).expect(202)).body).toEqual(known.body);
    }
    expect(messages).toHaveLength(1);
  });

  it('verifica el código, cambia la contraseña una sola vez y revoca sesiones anteriores', async () => {
    const { user, code } = await start();
    const oldSession = newAgent(app);
    await loginWithPassword(oldSession, email, original);
    await oldSession.get('/api/me').expect(200);
    const prisma = app.get(PrismaService);
    const stored = await prisma.passwordRecovery.findUniqueOrThrow({ where: { userId: user.id } });
    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.codeHash).not.toBe(code);
    const resetToken = await verify(code);
    await post('verify', { email, code }).expect(400);
    const grant = await prisma.passwordRecovery.findUniqueOrThrow({ where: { userId: user.id } });
    expect(grant.resetTokenHash).not.toBe(resetToken);
    await post('reset', { resetToken, newPassword: replacement, confirmation: replacement }).expect(204);
    const changed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(changed.mustChangePassword).toBe(false);
    expect(changed.passwordResetAt).not.toBeNull();
    expect(changed.passwordHash).not.toBe(original);
    await oldSession.get('/api/me').expect(401);
    const oldPassword = newAgent(app);
    await loginWithPassword(oldPassword, email, original);
    await oldPassword.get('/api/me').expect(401);
    const newPassword = newAgent(app);
    await loginWithPassword(newPassword, email, replacement);
    await newPassword.get('/api/me').expect(200);
    const beforeRejected = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await post('reset', { resetToken, newPassword: 'Another-12345', confirmation: 'Another-12345' }).expect(400);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(beforeRejected);
  });

  it('vence a los 10 minutos y no modifica al usuario por un código vencido', async () => {
    const { user, code } = await start();
    const prisma = app.get(PrismaService);
    const row = await prisma.passwordRecovery.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.expiresAt.getTime() - row.requestedAt.getTime()).toBe(600_000);
    await prisma.passwordRecovery.update({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await post('verify', { email, code }).expect(400);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(before);
  });

  it('bloquea después de cinco intentos y no permite verificar un sexto código correcto', async () => {
    const { user, code } = await start();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt++) await post('verify', { email, code: wrong }).expect(400);
    await post('verify', { email, code }).expect(400);
    expect((await app.get(PrismaService).passwordRecovery.findUniqueOrThrow({ where: { userId: user.id } })).attempts).toBe(5);
  });

  it('cuenta cinco intentos incorrectos simultáneos y bloquea el código correcto después', async () => {
    const { user, code } = await start();
    const prisma = app.get(PrismaService);
    const delegate = prisma.passwordRecovery;
    const findFirst = delegate.findFirst.bind(delegate);
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    // Preserve real database reads, but force all five requests to read the same counter.
    const controlledRead = async (args: Parameters<typeof findFirst>[0]) => {
      const row = await findFirst(args);
      if (++arrived === 5) release();
      await barrier;
      return row;
    };
    const spy = jest.spyOn(delegate, 'findFirst').mockImplementation(controlledRead as typeof findFirst);
    try {
      const wrong = code === '000000' ? '111111' : '000000';
      const results = await Promise.all(Array.from({ length: 5 }, () => post('verify', { email, code: wrong })));
      expect(results.map((response) => response.status)).toEqual([400, 400, 400, 400, 400]);
    } finally { spy.mockRestore(); }
    expect((await delegate.findUniqueOrThrow({ where: { userId: user.id } })).attempts).toBe(5);
    await post('verify', { email, code }).expect(400);
  });

  it('permite acertar en el quinto intento y no cambia la contraseña antes de verificar', async () => {
    const { code } = await start();
    await post('reset', { resetToken: '0'.repeat(64), newPassword: replacement, confirmation: replacement }).expect(400);
    for (let attempt = 0; attempt < 4; attempt++) await post('verify', { email, code: code === '000000' ? '111111' : '000000' }).expect(400);
    await verify(code);
  });

  it('valida contraseña y confirmación sin consumir una autorización válida al rechazarlas', async () => {
    const { user, code } = await start();
    const resetToken = await verify(code);
    const prisma = app.get(PrismaService);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    for (const [newPassword, confirmation] of [['short1', 'short1'], [replacement, 'Different-123'], [original, original]]) {
      await post('reset', { resetToken, newPassword, confirmation }).expect(400);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(before);
    }
    await post('reset', { resetToken, newPassword: replacement, confirmation: replacement }).expect(204);
  });

  it('el reenvío espera 60 segundos e invalida la autorización anterior', async () => {
    const { user, code } = await start();
    await post('request', { email }).expect(202);
    expect(messages).toHaveLength(1);
    const resetToken = await verify(code);
    await app.get(PrismaService).passwordRecovery.update({ where: { userId: user.id }, data: { requestedAt: new Date(Date.now() - 61_000) } });
    await post('request', { email }).expect(202);
    expect(messages).toHaveLength(2);
    await post('reset', { resetToken, newPassword: replacement, confirmation: replacement }).expect(400);
  });

  it('no permite verificar dos veces ni consumir dos veces la autorización en paralelo', async () => {
    const { code } = await start();
    const checks = await Promise.all([post('verify', { email, code }), post('verify', { email, code })]);
    expect(checks.map((r) => r.status).sort()).toEqual([200, 400]);
    const resetToken = checks.find((r) => r.status === 200)!.body.resetToken;
    const resets = await Promise.all([post('reset', { resetToken, newPassword: replacement, confirmation: replacement }),
      post('reset', { resetToken, newPassword: replacement, confirmation: replacement })]);
    expect(resets.map((r) => r.status).sort()).toEqual([204, 400]);
  });

  it('rechaza autorizaciones vencidas o de una cuenta desactivada después de verificar', async () => {
    const { user, code } = await start();
    const resetToken = await verify(code);
    const prisma = app.get(PrismaService);
    await prisma.passwordRecovery.update({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    await post('reset', { resetToken, newPassword: replacement, confirmation: replacement }).expect(400);
    await prisma.passwordRecovery.update({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.user.update({ where: { id: user.id }, data: { status: 'INACTIVE' } });
    await post('reset', { resetToken, newPassword: replacement, confirmation: replacement }).expect(400);
  });
});
