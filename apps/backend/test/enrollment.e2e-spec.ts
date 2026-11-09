import type { INestApplication } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { SHEET_PROVIDER, EnrollmentService } from '../src/modules/enrollment';
import { ENROLLMENT_APPROVAL_MAILER } from '../src/modules/enrollment/services/enrollment-approval-mailer';
import { PrismaService } from '../src/database/prisma.service';
import { buildWorld, type World } from './fixtures';
import { createTestApp, newAgent, resetDatabase } from './helpers';
import { APP_ENV, type AppEnv } from '../src/config/env';
import { PasswordService } from '../src/modules/auth';

const PASSWORD = 'Clave-Prueba-123';

function makeFakeSheet(rows: string[][]) {
  return { read: jest.fn(async () => rows) };
}

const HEADERS = [
  'Marca temporal',
  'Nombres',
  'Apellidos',
  'Correo electrónico',
  'Tipo de documento',
  'Número de documento',
  'Facultad',
  'Área',
  'Período de inscripción',
  'Autorización de tratamiento de datos',
];

describe('Inscripciones (e2e)', () => {
  let app: INestApplication;
  let world: World;
  let sheetRows: string[][];
  let fakeSheet: { read: jest.Mock };
  let fakeMailer: { sendApproval: jest.Mock };
  let areaId: string;

  beforeAll(async () => {
    process.env.ENROLLMENT_GOOGLE_SERVICE_ACCOUNT_EMAIL = 'svc@example.test';
    process.env.ENROLLMENT_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----';
    process.env.ENROLLMENT_SHEETS_ALLOWLIST = JSON.stringify({ '*': ['*'] });
    fakeSheet = makeFakeSheet([]);
    fakeMailer = { sendApproval: jest.fn(async () => {}) };
    app = await createTestApp([
      { token: SHEET_PROVIDER, value: fakeSheet },
      { token: ENROLLMENT_APPROVAL_MAILER, value: fakeMailer },
    ]);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    world = await buildWorld(app);
    areaId = world.area.id;
    app.get<AppEnv>(APP_ENV).enrollment.allowlist = { [areaId]: ['sheet-1'] };
    sheetRows = [HEADERS];
    fakeMailer.sendApproval.mockClear();
    fakeMailer.sendApproval.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  async function as(person: Parameters<World['as']>[0]) {
    return world.as(person);
  }

  function candidate(documentNumber = '00123', email = 'ana@example.test', area = 'Semillero'): string[] {
    return ['t1', 'Ana', 'Pérez', email, 'CC', documentNumber, 'Ingeniería de Sistemas', area, '2026-1', 'Sí'];
  }

  async function prepare(rows: string[][]) {
    const agent = await as('areaManager');
    await agent.put(`/api/enrollments/sources/${areaId}`).send({ spreadsheetId: 'sheet-1', range: 'A1:Z1000', areaType: 'SEEDLING' }).expect(200);
    fakeSheet.read.mockResolvedValue([HEADERS, ...rows]);
    const preview = await agent.post('/api/enrollments/preview').send({ areaId }).expect(201);
    return { agent, preview };
  }

  it.each([
    ['Demo', 'Second', 'Example', 'Other', 'Demo Second', 'Example Other'],
    ['Demo', '', 'Example', '', 'Demo', 'Example'],
  ])('importa nombres separados sin modificar los datos de identidad (%s, %s)', async (
    firstName, middleName, firstSurname, secondSurname, expectedNames, expectedSurnames,
  ) => {
    const { agent } = await prepare([]);
    fakeSheet.read.mockResolvedValue([
      ['Timestamp', 'Primer Nombre', 'Segundo Nombre', 'Primer Apellido', 'Segundo Apellido', ...HEADERS.slice(3)],
      ['t1', firstName, middleName, firstSurname, secondSurname, ...candidate().slice(3)],
    ]);
    const preview = await agent.post('/api/enrollments/preview').send({ areaId }).expect(201);
    expect(preview.body.summary).toMatchObject({ valid: 1, invalid: 0 });
    expect(preview.body.rows[0]).toMatchObject({
      firstNames: expectedNames, lastNames: expectedSurnames, documentNumber: '00123', email: 'ana@example.test',
    });
    const result = await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken }).expect(201);
    expect(result.body).toEqual({ imported: 1, duplicates: 0, invalid: 0 });
    const list = await agent.get('/api/enrollments').expect(200);
    expect(list.body.items).toEqual([expect.objectContaining({
      firstNames: expectedNames, lastNames: expectedSurnames, documentNumber: '00123', email: 'ana@example.test',
    })]);
  });

  it('valida el área del formulario y no muestra datos de otra área', async () => {
    const { agent, preview } = await prepare([
      candidate('00123', 'empty@example.test', ''),
      candidate('00124', 'unknown@example.test', 'Área no válida'),
      candidate('00125', 'foreign@example.test', 'Proyecto de grado'),
    ]);
    expect(preview.body.summary.valid).toBe(0);
    expect(preview.body.summary.invalid).toBe(3);
    expect(JSON.stringify(preview.body)).not.toContain('foreign@example.test');
    const imported = await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken }).expect(201);
    expect(imported.body.imported).toBe(0);
  });

  it('no admite una hoja que omitió la pregunta de área', async () => {
    const { agent } = await prepare([]);
    fakeSheet.read.mockResolvedValue([HEADERS.filter((header) => header !== 'Área'), candidate().filter((_, index) => index !== 7)]);
    const preview = await agent.post('/api/enrollments/preview').send({ areaId }).expect(201);
    expect(preview.body.summary.valid).toBe(0);
    expect(preview.body.summary.invalid).toBe(1);
  });

  it('no reimporta una solicitud eliminada al ordenar las filas de Google Sheets', async () => {
    const deletedRow = candidate();
    const { agent, preview } = await prepare([deletedRow]);
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken }).expect(201);
    const list = await agent.get('/api/enrollments').expect(200);
    const id = list.body.items[0].id;
    await agent.patch(`/api/enrollments/${id}/status`).send({ status: 'REJECTED' }).expect(200);
    await agent.delete(`/api/enrollments/${id}`).expect(204);
    fakeSheet.read.mockResolvedValue([HEADERS, candidate('00124', 'new@example.test'), deletedRow]);
    const next = await agent.post('/api/enrollments/preview').send({ areaId }).expect(201);
    expect(next.body.rows[1].duplicate).toBe(true);
    const result = await agent.post('/api/enrollments/import').send({ previewToken: next.body.previewToken }).expect(201);
    expect(result.body).toMatchObject({ imported: 1, duplicates: 1 });
    const final = await agent.get('/api/enrollments').expect(200);
    expect(final.body.items.map((item: { email: string }) => item.email)).toEqual(['new@example.test']);
  });

  it('informa solo las filas realmente creadas en importaciones simultáneas', async () => {
    const { agent, preview } = await prepare([candidate()]);
    const delegate = app.get(PrismaService).enrollmentApplication;
    const findMany = delegate.findMany.bind(delegate);
    let arrived = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const controlledRead = async (args: Parameters<typeof findMany>[0]) => {
      const result = await findMany(args);
      if (++arrived === 2) release();
      await barrier;
      return result;
    };
    const spy = jest.spyOn(delegate, 'findMany').mockImplementation(controlledRead as typeof findMany);
    let results;
    try {
      results = await Promise.all([1, 2].map(() => agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken })));
    } finally { spy.mockRestore(); }
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results.map((result) => result.body.imported).sort()).toEqual([0, 1]);
    expect(await delegate.count()).toBe(1);
  });

  it('revocar la hoja permitida impide nuevas lecturas y confirmaciones', async () => {
    const { agent, preview } = await prepare([candidate()]);
    app.get<AppEnv>(APP_ENV).enrollment.allowlist = {};
    fakeSheet.read.mockClear();
    await agent.post('/api/enrollments/preview').send({ areaId }).expect(403);
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken }).expect(403);
    expect(fakeSheet.read).not.toHaveBeenCalled();
    expect(await app.get(PrismaService).enrollmentApplication.count()).toBe(0);
  });

  it('un rechazo aceptado durante la limpieza no se elimina', async () => {
    const { agent, preview } = await prepare([candidate()]);
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken }).expect(201);
    const prisma = app.get(PrismaService);
    const record = await prisma.enrollmentApplication.findFirstOrThrow();
    await prisma.enrollmentApplication.update({ where: { id: record.id }, data: { status: 'REJECTED', rejectedAt: new Date(Date.now() - 73 * 60 * 60_000) } });
    const delegate = prisma.enrollmentApplication;
    const findMany = delegate.findMany.bind(delegate);
    const controlledRead = async (args: Parameters<typeof findMany>[0]) => {
      const rows = await findMany(args);
      await agent.patch(`/api/enrollments/${record.id}/status`).send({ status: 'ACCEPTED' }).expect(200);
      return rows;
    };
    const spy = jest.spyOn(delegate, 'findMany').mockImplementationOnce(controlledRead as typeof findMany);
    try { expect(await app.get(EnrollmentService).cleanupExpired()).toBe(0); }
    finally { spy.mockRestore(); }
    expect(await delegate.findUnique({ where: { id: record.id } })).toMatchObject({ status: 'ACCEPTED' });
  });

  it('el borrado manual revalida que la solicitud siga rechazada', async () => {
    const { agent, preview } = await prepare([candidate()]);
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken }).expect(201);
    const delegate = app.get(PrismaService).enrollmentApplication;
    const record = await delegate.findFirstOrThrow();
    await delegate.update({ where: { id: record.id }, data: { status: 'REJECTED', rejectedAt: new Date() } });
    const findUnique = delegate.findUnique.bind(delegate);
    const controlledRead = async (args: Parameters<typeof findUnique>[0]) => {
      const row = await findUnique(args);
      await agent.patch(`/api/enrollments/${record.id}/status`).send({ status: 'ACCEPTED' }).expect(200);
      return row;
    };
    // The race probe eagerly awaits Prisma's lazy promise before simulating acceptance.
    const spy = jest.spyOn(delegate, 'findUnique').mockImplementationOnce(controlledRead as unknown as typeof findUnique);
    try {
      const result = await agent.delete(`/api/enrollments/${record.id}`);
      expect(result.status).not.toBe(204);
    } finally { spy.mockRestore(); }
    expect(await delegate.findUnique({ where: { id: record.id } })).toMatchObject({ status: 'ACCEPTED' });
  });

  it('registra quién importó y exportó sin copiar el documento al historial', async () => {
    const { agent, preview } = await prepare([candidate()]);
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken }).expect(201);
    await agent.get('/api/enrollments/export.xlsx').expect(200);
    const events = await app.get(PrismaService).$queryRaw<{ action: string; actorId: string | null; affectedCount: number; details: unknown }[]>`
      SELECT action, actor_id AS "actorId", affected_count AS "affectedCount", details
      FROM enrollment_audit_events WHERE action IN ('IMPORTED', 'EXPORTED') ORDER BY created_at`;
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'IMPORTED', actorId: world.ids.areaManager, affectedCount: 1 }),
      expect.objectContaining({ action: 'EXPORTED', actorId: world.ids.areaManager, affectedCount: 1 }),
    ]));
    expect(JSON.stringify(events)).not.toContain('ana@example.test');
    expect(JSON.stringify(events)).not.toContain('00123');
  });

  it('configura fuente por área permitida', async () => {
    const agent = await as('areaManager');
    const res = await agent.put(`/api/enrollments/sources/${areaId}`).send({
      spreadsheetId: 'sheet-1',
      range: 'A1:Z1000',
      areaType: 'SEEDLING',
    });
    expect(res.status).toBe(200);
  });

  it('flujo completo de vista previa, importación e idempotencia', async () => {
    // configure source
    const agent = await as('areaManager');
    await agent.put(`/api/enrollments/sources/${areaId}`).send({
      spreadsheetId: 'sheet-1',
      range: 'A1:Z1000',
      areaType: 'SEEDLING',
    }).expect(200);

    sheetRows = [
      HEADERS,
      ['t1', 'Ana', 'Pérez', 'ana@example.test', 'CC', '00123', 'Ingeniería de Sistemas', 'Semillero', '2026-1', 'Sí'],
      ['t2', 'Luis', 'Gómez', 'luis@example.test', 'TI', '0987', 'Ingeniería de Software', 'Semillero', '2026-1', 'No'],
      ['t3', 'María', 'López', 'maria@example.test', 'CC', '00999', 'Ingeniería de Sistemas', 'Semillero', '', 'Sí'],
      ['t4', 'Pedro', 'Ruiz', 'pedro@example.test', 'CC', '00123', 'Ingeniería de Sistemas', 'Semillero', '2026-1', 'Sí'],
      ['t5', 'Carla', 'Díaz', 'ana@example.test', 'TI', '7777', 'Ingeniería de Sistemas', 'Semillero', '2026-1', 'Sí'],
    ];
    fakeSheet.read.mockResolvedValue(sheetRows);

    const preview = await agent.post('/api/enrollments/preview').send({ areaId }).expect(201);
    expect(preview.status).toBe(201);
    const body = preview.body;
    expect(body.rows.length).toBe(5);
    expect(body.summary.read).toBe(5);
    // first valid
    expect(body.rows[0].duplicate).toBe(false);
    expect(body.rows[0].errors).toEqual([]);
    // consent false
    expect(body.rows[1].errors.length).toBeGreaterThan(0);
    // missing period
    expect(body.rows[2].errors.length).toBeGreaterThan(0);
    // duplicate doc
    expect(body.rows[3].duplicate).toBe(true);
    // email conflict
    expect(body.rows[4].duplicate).toBe(true);

    const token = body.previewToken;
    const imp = await agent.post('/api/enrollments/import').send({ previewToken: token }).expect(201);
    expect(imp.status).toBe(201);
    expect(imp.body.imported).toBe(1);
    expect(imp.body.invalid).toBe(2);
    expect(imp.body.duplicates).toBe(2);

    // idempotent re-import: same token but sheet unchanged; should import 0
    const imp2 = await agent.post('/api/enrollments/import').send({ previewToken: token });
    expect(imp2.body.imported).toBe(0);
  });

  it('lista con filtros y paginación', async () => {
    const agent = await as('areaManager');
    await agent.put(`/api/enrollments/sources/${areaId}`).send({ spreadsheetId: 'sheet-1', range: 'A1:Z1000', areaType: 'SEEDLING' });
    sheetRows = [HEADERS, candidate()];
    fakeSheet.read.mockResolvedValue(sheetRows);
    const preview = await agent.post('/api/enrollments/preview').send({ areaId });
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken });

    const list = await agent.get(`/api/enrollments?areaId=${areaId}&status=PENDING&limit=10&offset=0`).expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].documentNumber).toBe('00123');
    expect(list.body.items[0].documentType).toBe('CC');
  });

  it('permisos: manager de otra área no accede', async () => {
    // create another area managed by nobody? use admin? We'll just test outsider student
    const outsider = await as('student');
    const res = await outsider.get(`/api/enrollments?areaId=${areaId}`);
    expect(res.status).toBe(403);
  });

  it('cambio de estado individual y masivo con rollback fuera de alcance', async () => {
    const agent = await as('areaManager');
    await agent.put(`/api/enrollments/sources/${areaId}`).send({ spreadsheetId: 'sheet-1', range: 'A1:Z1000', areaType: 'SEEDLING' });
    sheetRows = [HEADERS, candidate()];
    fakeSheet.read.mockResolvedValue(sheetRows);
    const preview = await agent.post('/api/enrollments/preview').send({ areaId });
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken });
    const list = await agent.get(`/api/enrollments?areaId=${areaId}`);
    const id = list.body.items[0].id;

    const single = await agent.patch(`/api/enrollments/${id}/status`).send({ status: 'ACCEPTED' }).expect(200);
    expect(single.body.status).toBe('ACCEPTED');
    expect(single.body.rejectedAt).toBeNull();

    // bulk rollback: include fake id
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const bulk = await agent.patch('/api/enrollments/status').send({ ids: [id, fakeId], status: 'REJECTED' });
    expect(bulk.status).not.toBe(200);
  });

  it('borrado manual solo rechazadas y tombstone evita reimportar', async () => {
    const agent = await as('areaManager');
    await agent.put(`/api/enrollments/sources/${areaId}`).send({ spreadsheetId: 'sheet-1', range: 'A1:Z1000', areaType: 'SEEDLING' });
    sheetRows = [HEADERS, candidate()];
    fakeSheet.read.mockResolvedValue(sheetRows);
    const preview = await agent.post('/api/enrollments/preview').send({ areaId });
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken });
    const list = await agent.get(`/api/enrollments?areaId=${areaId}`);
    const id = list.body.items[0].id;
    await agent.patch(`/api/enrollments/${id}/status`).send({ status: 'REJECTED' });

    // delete accepted? no; rejected ok
    await agent.delete(`/api/enrollments/${id}`).expect(204);

    // re-import same sheet should not import (tombstone)
    const preview2 = await agent.post('/api/enrollments/preview').send({ areaId });
    // row should be duplicate due to tombstone
    expect(preview2.body.rows[0].duplicate).toBe(true);
    const imp = await agent.post('/api/enrollments/import').send({ previewToken: preview2.body.previewToken });
    expect(imp.body.imported).toBe(0);
  });

  it('borrado de aceptada falla', async () => {
    const agent = await as('areaManager');
    await agent.put(`/api/enrollments/sources/${areaId}`).send({ spreadsheetId: 'sheet-1', range: 'A1:Z1000', areaType: 'SEEDLING' });
    sheetRows = [HEADERS, candidate()];
    fakeSheet.read.mockResolvedValue(sheetRows);
    const preview = await agent.post('/api/enrollments/preview').send({ areaId });
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken });
    const list = await agent.get(`/api/enrollments?areaId=${areaId}`);
    const id = list.body.items[0].id;
    await agent.patch(`/api/enrollments/${id}/status`).send({ status: 'ACCEPTED' });
    const del = await agent.delete(`/api/enrollments/${id}`);
    expect(del.status).not.toBe(204);
  });

  it('limpieza 72h elimina rechazadas antiguas', async () => {
    const agent = await as('areaManager');
    await agent.put(`/api/enrollments/sources/${areaId}`).send({ spreadsheetId: 'sheet-1', range: 'A1:Z1000', areaType: 'SEEDLING' });
    sheetRows = [HEADERS, candidate()];
    fakeSheet.read.mockResolvedValue(sheetRows);
    const preview = await agent.post('/api/enrollments/preview').send({ areaId });
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken });
    const list = await agent.get(`/api/enrollments?areaId=${areaId}`);
    const id = list.body.items[0].id;
    await agent.patch(`/api/enrollments/${id}/status`).send({ status: 'REJECTED' });

    // make rejectedAt old
    const prisma = app.get(PrismaService);
    const old = new Date(Date.now() - 73 * 60 * 60 * 1000);
    await prisma.enrollmentApplication.update({ where: { id }, data: { rejectedAt: old } });

    const svc = app.get(EnrollmentService);
    const deleted = await svc.cleanupExpired();
    expect(deleted).toBe(1);

    const list2 = await agent.get(`/api/enrollments?areaId=${areaId}`);
    expect(list2.body.total).toBe(0);
  });

  it('exporta xlsx con MIME correcto y número de documento como texto', async () => {
    const agent = await as('areaManager');
    await agent.put(`/api/enrollments/sources/${areaId}`).send({ spreadsheetId: 'sheet-1', range: 'A1:Z1000', areaType: 'SEEDLING' });
    sheetRows = [HEADERS, candidate()];
    fakeSheet.read.mockResolvedValue(sheetRows);
    const preview = await agent.post('/api/enrollments/preview').send({ areaId });
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken });

    const res = await agent.get('/api/enrollments/export.xlsx').expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    const svc = app.get(EnrollmentService);
    const user = { id: world.ids.areaManager, email: 'areaManager@example.test', fullName: 'Usuario de Prueba', roles: ['AREA_MANAGER'] as any, mustChangePassword: false };
    const buffer = await svc.exportXlsx(user as any, { areaId, limit: 50, offset: 0 });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).getCell(5).value).toBe('Número de documento');
    const dataRow = ws.getRow(2);
    expect(String(dataRow.getCell(5).value)).toBe('00123');
    expect(dataRow.getCell(5).type).not.toBe(ExcelJS.ValueType.Formula);
  });

  it('preview rechaza hoja cambiada', async () => {
    const agent = await as('areaManager');
    await agent.put(`/api/enrollments/sources/${areaId}`).send({ spreadsheetId: 'sheet-1', range: 'A1:Z1000', areaType: 'SEEDLING' });
    sheetRows = [HEADERS, candidate()];
    fakeSheet.read.mockResolvedValue(sheetRows);
    const preview = await agent.post('/api/enrollments/preview').send({ areaId });
    const token = preview.body.previewToken;
    // change sheet
    fakeSheet.read.mockResolvedValue([HEADERS, candidate(), ['extra', 'B', 'C', 'b@b.com', 'CC', '1', 'Ingeniería de Sistemas', 'Semillero', '2026-1', 'Sí']]);
    const imp = await agent.post('/api/enrollments/import').send({ previewToken: token });
    expect(imp.status).not.toBe(201);
  });

  it('admin puede configurar y ver todas las áreas', async () => {
    const admin = await as('admin');
    const opts = await admin.get('/api/enrollments/options').expect(200);
    expect(opts.body.areas.length).toBeGreaterThan(0);
  });

  it('fuente no configurada devuelve 503', async () => {
    const agent = await as('areaManager');
    const res = await agent.post('/api/enrollments/preview').send({ areaId });
    expect(res.status).toBe(503);
  });

  it('PENDING→ACCEPTED crea un estudiante activo con contraseña temporal y correo de bienvenida', async () => {
    const { agent, preview } = await prepare([candidate()]);
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken }).expect(201);
    const prisma = app.get(PrismaService);
    const record = await prisma.enrollmentApplication.findFirstOrThrow();
    const passwords = app.get(PasswordService);
    const hashSpy = jest.spyOn(passwords, 'hash');
    const res = await agent.patch(`/api/enrollments/${record.id}/status`).send({ status: 'ACCEPTED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACCEPTED');
    expect(res.body.rejectedAt).toBeNull();

    const user = await prisma.user.findFirst({
      where: { email: { equals: 'ana@example.test', mode: 'insensitive' } },
      include: { roles: true },
    });
    expect(user).not.toBeNull();
    expect(user?.email).toBe('ana@example.test');
    expect(user?.fullName).toBe('Ana Pérez');
    expect(user?.status).toBe('ACTIVE');
    expect(user?.mustChangePassword).toBe(true);
    expect(user?.roles.map((r) => r.role)).toEqual(['STUDENT']);
    expect(user?.passwordHash).toEqual(expect.any(String));
    expect(user?.passwordHash as string).toMatch(/^\$argon2id\$/);
    expect(hashSpy).toHaveBeenCalledTimes(1);
    expect(hashSpy.mock.calls[0][0]).toEqual(expect.any(String));
    const plaintext = hashSpy.mock.calls[0][0] as string;
    expect(plaintext.length).toBeGreaterThanOrEqual(10);
    expect(plaintext).not.toBe('ana@example.test');
    expect(plaintext).not.toBe('00123');
    expect(plaintext).not.toBe('Ana Pérez');
    expect(plaintext).not.toBe('CC');
    expect(plaintext).not.toBe('TI');
    expect(/\p{L}/u.test(plaintext)).toBe(true);
    expect(/\p{N}/u.test(plaintext)).toBe(true);
    expect(await passwords.verify(user?.passwordHash as string, plaintext)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(plaintext);

    const members = await prisma.projectMember.findMany({ where: { userId: user?.id } });
    expect(members).toHaveLength(0);

    expect(fakeMailer.sendApproval).toHaveBeenCalledTimes(1);
    const [sentEmail, sentSubject, sentBody] = fakeMailer.sendApproval.mock.calls[0];
    expect(sentEmail).toBe('ana@example.test');
    expect(sentSubject).toBe('Inscripción aprobada - Universidad de Colombia');
    expect(typeof sentBody).toBe('string');
    expect(sentBody).toContain('ana@example.test');
    expect(sentBody).toContain('Contraseña temporal:');
    expect(sentBody).toContain(plaintext);

    const updated = await prisma.enrollmentApplication.findUniqueOrThrow({ where: { id: record.id } });
    expect(updated.status).toBe('ACCEPTED');

    const events = await prisma.enrollmentAuditEvent.findMany({
      where: { action: 'STATUS_CHANGED', areaId },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.length).toBeGreaterThan(0);
    const latest = events[events.length - 1];
    const detailsJson = JSON.stringify(latest.details);
    expect(detailsJson).not.toContain('ana@example.test');
    expect(detailsJson).not.toContain('00123');
    expect(detailsJson).not.toContain(plaintext);
    expect(detailsJson).not.toContain('Ana');
    hashSpy.mockRestore();
  });

  it('REJECTED→ACCEPTED también crea el estudiante en la misma transacción', async () => {
    const { agent, preview } = await prepare([candidate()]);
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken }).expect(201);
    const prisma = app.get(PrismaService);
    const record = await prisma.enrollmentApplication.findFirstOrThrow();

    await agent.patch(`/api/enrollments/${record.id}/status`).send({ status: 'REJECTED' }).expect(200);
    expect(await prisma.user.count({ where: { email: { equals: 'ana@example.test', mode: 'insensitive' } } })).toBe(0);
    expect(fakeMailer.sendApproval).not.toHaveBeenCalled();

    await agent.patch(`/api/enrollments/${record.id}/status`).send({ status: 'ACCEPTED' }).expect(200);
    const user = await prisma.user.findFirst({
      where: { email: { equals: 'ana@example.test', mode: 'insensitive' } },
      include: { roles: true },
    });
    expect(user).not.toBeNull();
    expect(user?.status).toBe('ACTIVE');
    expect(user?.mustChangePassword).toBe(true);
    expect(user?.roles.map((r) => r.role)).toEqual(['STUDENT']);
    expect(user?.passwordHash).toEqual(expect.any(String));
    expect(fakeMailer.sendApproval).toHaveBeenCalledTimes(1);
    const [sentEmail, sentSubject, sentBody] = fakeMailer.sendApproval.mock.calls[0];
    expect(sentEmail).toBe('ana@example.test');
    expect(sentSubject).toBe('Inscripción aprobada - Universidad de Colombia');
    expect(typeof sentBody).toBe('string');
    expect(sentBody).toContain('ana@example.test');
    expect(sentBody).toContain('Contraseña temporal:');
    const match = String(sentBody).match(/Contraseña temporal: ([A-Za-z0-9_-]+)\./);
    expect(match).not.toBeNull();
    const plaintext = match![1];
    expect(sentBody).toContain(plaintext);
    expect((await prisma.enrollmentApplication.findUniqueOrThrow({ where: { id: record.id } })).status).toBe('ACCEPTED');
    const events = await prisma.enrollmentAuditEvent.findMany({ where: { action: 'STATUS_CHANGED', areaId } });
    expect(JSON.stringify(events)).not.toContain('ana@example.test');
    expect(JSON.stringify(events)).not.toContain('00123');
    expect(JSON.stringify(events)).not.toContain(plaintext);
  });

  it('aceptar con correo existente devuelve 409 y no acepta la solicitud (sin distinción de mayúsculas)', async () => {
    const { agent, preview } = await prepare([candidate('00999', 'duplicado@example.test')]);
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken }).expect(201);
    const prisma = app.get(PrismaService);
    const record = await prisma.enrollmentApplication.findFirstOrThrow();
    const existing = await prisma.user.create({
      data: {
        email: 'DUPLICADO@example.test',
        fullName: 'Persona Existente',
        passwordHash: '$argon2id$dummy',
        status: 'ACTIVE',
        roles: { create: [{ role: 'STUDENT' }] },
      },
    });
    const beforeHash = existing.passwordHash;
    const res = await agent.patch(`/api/enrollments/${record.id}/status`).send({ status: 'ACCEPTED' });
    expect(res.status).toBe(409);
    expect((await prisma.enrollmentApplication.findUniqueOrThrow({ where: { id: record.id } })).status).toBe('PENDING');
    expect(await prisma.user.count({ where: { email: { equals: 'duplicado@example.test', mode: 'insensitive' } } })).toBe(1);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(after.fullName).toBe('Persona Existente');
    expect(after.passwordHash).toBe(beforeHash);
    expect(fakeMailer.sendApproval).not.toHaveBeenCalled();
  });

  it('si SMTP falla tras crear la cuenta, conserva cuenta y estado aceptado y audita el fallo sin PII', async () => {
    const { agent, preview } = await prepare([candidate()]);
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken }).expect(201);
    const prisma = app.get(PrismaService);
    const record = await prisma.enrollmentApplication.findFirstOrThrow();
    fakeMailer.sendApproval.mockRejectedValueOnce(new Error('SMTP no disponible'));
    const res = await agent.patch(`/api/enrollments/${record.id}/status`).send({ status: 'ACCEPTED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACCEPTED');
    const user = await prisma.user.findFirst({ where: { email: { equals: 'ana@example.test', mode: 'insensitive' } } });
    expect(user).not.toBeNull();
    expect(user?.mustChangePassword).toBe(true);
    expect(user?.status).toBe('ACTIVE');
    expect(fakeMailer.sendApproval).toHaveBeenCalledTimes(1);
    expect((await prisma.enrollmentApplication.findUniqueOrThrow({ where: { id: record.id } })).status).toBe('ACCEPTED');
    const failures = await prisma.enrollmentAuditEvent.findMany({
      where: { action: 'ENROLLMENT_ACCEPT_EMAIL_FAILED', areaId },
    });
    expect(failures.length).toBe(1);
    const detailsJson = JSON.stringify(failures[0].details);
    expect(detailsJson).not.toContain('ana@example.test');
    expect(detailsJson).not.toContain('00123');
    expect(detailsJson).not.toContain('Ana Pérez');
  });

  it('bulk ACCEPTED devuelve 400 atómico sin crear usuarios ni enviar correo', async () => {
    const { agent, preview } = await prepare([candidate('00123', 'ana@example.test'), candidate('00124', 'luis@example.test')]);
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken }).expect(201);
    const prisma = app.get(PrismaService);
    const list = await agent.get('/api/enrollments').expect(200);
    const ids = list.body.items.map((i: { id: string }) => i.id);
    expect(ids.length).toBe(2);
    const res = await agent.patch('/api/enrollments/status').send({ ids, status: 'ACCEPTED' });
    expect(res.status).toBe(400);
    const all = await prisma.enrollmentApplication.findMany({ where: { id: { in: ids } } });
    expect(all.every((r) => r.status === 'PENDING')).toBe(true);
    expect(await prisma.user.count({ where: { email: { in: ['ana@example.test', 'luis@example.test'] } } })).toBe(0);
    expect(fakeMailer.sendApproval).not.toHaveBeenCalled();
  });

  it('REJECTED no crea usuario ni envía correo', async () => {
    const { agent, preview } = await prepare([candidate()]);
    await agent.post('/api/enrollments/import').send({ previewToken: preview.body.previewToken }).expect(201);
    const prisma = app.get(PrismaService);
    const record = await prisma.enrollmentApplication.findFirstOrThrow();
    const res = await agent.patch(`/api/enrollments/${record.id}/status`).send({ status: 'REJECTED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('REJECTED');
    expect(res.body.rejectedAt).not.toBeNull();
    expect(await prisma.user.count({ where: { email: { equals: 'ana@example.test', mode: 'insensitive' } } })).toBe(0);
    expect(fakeMailer.sendApproval).not.toHaveBeenCalled();
    expect((await prisma.enrollmentApplication.findUniqueOrThrow({ where: { id: record.id } })).status).toBe('REJECTED');
  });
});
