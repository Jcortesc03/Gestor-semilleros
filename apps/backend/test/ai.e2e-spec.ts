import type { INestApplication } from '@nestjs/common';
import { AI_CLIENT, type AiClient } from '../src/modules/ai';
import { buildProject, buildWorld, type World } from './fixtures';
import { createTestApp, newAgent, resetDatabase } from './helpers';

/** Informe válido que devuelve el cliente falso; usa el seudónimo del primer tutor. */
const report = {
  summary: 'TUTOR_1 concentra las entregas tardías.',
  overallStatus: 'ATTENTION',
  highlights: [{ title: 'Avance', detail: 'La mitad de las actividades está terminada.' }],
  risks: [{ title: 'Retrasos', detail: 'Hay entregas fuera de plazo.', severity: 'MEDIUM' }],
  recommendations: [
    { title: 'Revisar plazos', rationale: 'Entregas tardías.', actions: ['Acordar hitos con TUTOR_1'], priority: 'HIGH', focus: 'GENERAL', evidence: ['onTimePct 50'], expectedImpact: 'Sube onTimePct.', horizon: 'SHORT_TERM' },
    { title: 'Extra', rationale: 'r', actions: [], priority: 'LOW', focus: 'GENERAL', evidence: [], expectedImpact: 'i', horizon: 'MEDIUM_TERM' },
  ],
  answer: null,
  dataGaps: [],
};

describe('IA (e2e)', () => {
  let app: INestApplication;
  let world: World;
  const structured = jest.fn();
  const client: AiClient = { structured };

  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ficticia-de-pruebas';
    process.env.ANTHROPIC_MODEL = 'modelo-de-pruebas';
    process.env.AI_RATE_LIMIT_PER_HOUR = '100';
    app = await createTestApp([{ token: AI_CLIENT, value: client }]);
  });

  beforeEach(async () => {
    structured.mockReset();
    structured.mockResolvedValue({ json: report, model: 'modelo-de-pruebas', usage: { inputTokens: 10, outputTokens: 5 } });
    await resetDatabase(app);
    world = await buildWorld(app);
    const projectId = (await buildProject(world)).id;
    const { prisma, ids } = world;
    const board = await prisma.board.create({
      data: { projectId, title: 'Tablero', dueDate: new Date('2026-10-15'), responsibleTutorId: ids.tutor, responsibleStudentId: ids.leader },
    });
    await prisma.activity.create({
      data: { boardId: board.id, authorId: ids.leader, title: 'Hecha', progressStatus: 'DONE', completedAt: new Date('2026-10-20T15:00:00Z'), createdAt: new Date('2026-10-01T15:00:00Z') },
    });
    await prisma.activity.create({ data: { boardId: board.id, authorId: ids.leader, title: 'Pendiente', createdAt: new Date('2026-10-02T15:00:00Z') } });
  });

  afterAll(async () => {
    await app.close();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MODEL;
    delete process.env.AI_RATE_LIMIT_PER_HOUR;
  });

  it('exige sesión y uno de los roles permitidos', async () => {
    await newAgent(app).get('/api/ai/status').expect(401);
    await (await world.as('tutor')).post('/api/ai/recommendations').send({}).expect(403);
    await (await world.as('student')).get('/api/ai/status').expect(403);
  });

  it('informa el estado sin exponer la clave', async () => {
    const res = await (await world.as('admin')).get('/api/ai/status').expect(200);
    expect(res.body).toMatchObject({ configured: true, model: 'modelo-de-pruebas', rateLimitPerHour: 100 });
    expect(JSON.stringify(res.body)).not.toContain('sk-ficticia');
  });

  it('valida el cuerpo', async () => {
    const admin = await world.as('admin');
    await admin.post('/api/ai/recommendations').send({ focuses: [] }).expect(400);
    await admin.post('/api/ai/recommendations').send({ otro: 1 }).expect(400);
    await admin.post('/api/ai/recommendations').send({ perspective: 'DEAN' }).expect(403);
  });

  it('envía un resumen comprimido y seudonimizado y restaura los nombres', async () => {
    const res = await (await world.as('admin'))
      .post('/api/ai/recommendations')
      .send({ from: '2026-10-01', to: '2026-10-31', maxRecommendations: 1, minSample: 1 })
      .expect(200);

    expect(structured).toHaveBeenCalledTimes(1);
    const sent = structured.mock.calls[0][1] as { input: string; instructions: string };
    const tutor = await world.prisma.user.findUniqueOrThrow({ where: { id: world.ids.tutor } });
    expect(sent.input).toContain('TUTOR_1');
    expect(sent.input).not.toContain(tutor.fullName);
    expect(sent.input).not.toContain(tutor.email);

    expect(res.body).toMatchObject({ cached: false, perspective: 'ADMIN', model: 'modelo-de-pruebas', usage: { inputTokens: 10, outputTokens: 5 } });
    expect(res.body.report.summary).toBe(`${tutor.fullName} concentra las entregas tardías.`);
    expect(res.body.report.recommendations).toHaveLength(1);
    expect(res.body.digest.chars).toBeLessThan(res.body.digest.sourceChars);
  });

  it('sirve desde la caché la misma petición y respeta refresh', async () => {
    const admin = await world.as('admin');
    await admin.post('/api/ai/recommendations').send({ focuses: ['DEADLINES'] }).expect(200);
    const again = await admin.post('/api/ai/recommendations').send({ focuses: ['DEADLINES'] }).expect(200);
    expect(again.body.cached).toBe(true);
    expect(structured).toHaveBeenCalledTimes(1);
    await admin.post('/api/ai/recommendations').send({ focuses: ['DEADLINES'], refresh: true }).expect(200);
    expect(structured).toHaveBeenCalledTimes(2);
  });

  it('responde 422 sin datos, sin llamar a Claude', async () => {
    await (await world.as('admin')).post('/api/ai/recommendations').send({ from: '2020-01-01', to: '2020-01-31', includeMonthly: false }).expect(422);
    expect(structured).not.toHaveBeenCalled();
  });

  it('el decano solo analiza su alcance', async () => {
    const res = await (await world.as('dean')).post('/api/ai/recommendations').send({ facultyId: world.facultyA.id }).expect(200);
    expect(res.body.perspective).toBe('DEAN');
    await (await world.as('dean')).post('/api/ai/recommendations').send({ facultyId: world.facultyB.id }).expect(403);
  });
});
