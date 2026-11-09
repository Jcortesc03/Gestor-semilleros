import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bulkChangeEnrollmentStatus,
  changeEnrollmentStatus,
  deleteEnrollment,
  downloadEnrollmentExport,
  enrollmentExportPath,
  getEnrollmentOptions,
  importEnrollments,
  listEnrollments,
  parseEnrollment,
  parseEnrollmentOptions,
  parseEnrollmentPreview,
  previewEnrollments,
  saveEnrollmentSource,
} from '../src/features/enrollments/api.ts';

function mockApiRequest(response: unknown) {
  const calls: { path: string; options?: { method?: string; body?: unknown } }[] = [];
  const request = async (path: string, options?: { method?: string; body?: unknown }) => {
    calls.push({ path, options });
    return response;
  };
  return { calls, request };
}

const options = {
  areas: [
    { id: 'a-1', name: 'Área de Sistemas', sourceConfigured: true, source: { spreadsheetId: 'sheet-1', range: 'Respuestas!A:I', areaType: 'SEEDLING' } },
    { id: 'a-2', name: 'Área de Software', sourceConfigured: false, source: null },
  ],
  faculties: [
    { value: 'SYSTEMS_ENGINEERING', label: 'Ingeniería de Sistemas' },
    { value: 'SOFTWARE_ENGINEERING', label: 'Ingeniería de Software' },
  ],
  areaTypes: [
    { value: 'SEEDLING', label: 'Semillero' },
    { value: 'DEGREE_PROJECT', label: 'Proyecto de grado' },
  ],
  documentTypes: [
    { value: 'CC', label: 'Cédula de ciudadanía' },
    { value: 'TI', label: 'Tarjeta de identidad' },
  ],
  statuses: [
    { value: 'PENDING', label: 'Pendiente' },
    { value: 'ACCEPTED', label: 'Aceptada' },
    { value: 'REJECTED', label: 'Rechazada' },
  ],
};

const item = {
  id: 'e-1', firstNames: 'Ana María', lastNames: 'Pérez Gómez', email: 'ana@example.test',
  documentType: 'TI', documentNumber: '00123', faculty: 'SYSTEMS_ENGINEERING', areaId: 'a-1',
  areaType: 'SEEDLING', period: '2026-2', status: 'PENDING', createdAt: '2026-11-07T15:00:00.000Z', rejectedAt: null,
};

const preview = {
  previewToken: 'tok-1',
  rows: [{
    sourceRow: 2, firstNames: 'Ana María', lastNames: 'Pérez Gómez', email: 'ana@example.test',
    documentType: 'TI', documentNumber: '00123', faculty: 'SYSTEMS_ENGINEERING', areaType: 'SEEDLING',
    period: '2026-2', consent: true, errors: [], duplicate: false,
  }],
  summary: { read: 1, valid: 1, invalid: 0, duplicates: 0 },
};

test('getEnrollmentOptions hits the options route and parses catalog arrays', async () => {
  const mock = mockApiRequest(options);
  const result = await getEnrollmentOptions(mock.request);
  assert.equal(mock.calls[0].path, '/api/enrollments/options');
  assert.deepEqual(result.areas[1], { id: 'a-2', name: 'Área de Software', sourceConfigured: false, source: null });
  assert.deepEqual(result.faculties.map((f) => f.value), ['SYSTEMS_ENGINEERING', 'SOFTWARE_ENGINEERING']);
});

test('options parser rejects an unknown faculty value', () => {
  assert.throws(() => parseEnrollmentOptions({ ...options, faculties: [{ value: 'CIVIL', label: 'Civil' }] }), { name: 'ApiError', status: 0 });
});

test('saveEnrollmentSource PUTs only spreadsheetId, range and areaType (no credentials)', async () => {
  const source = { spreadsheetId: 'sheet-1', range: 'Respuestas!A:I', areaType: 'DEGREE_PROJECT' as const };
  const mock = mockApiRequest(source);
  const result = await saveEnrollmentSource(mock.request, 'a-1', source);
  assert.equal(mock.calls[0].path, '/api/enrollments/sources/a-1');
  assert.deepEqual(mock.calls[0].options, { method: 'PUT', body: source });
  assert.deepEqual(result, source);
});

test('previewEnrollments POSTs the areaId and parses rows and summary', async () => {
  const mock = mockApiRequest(preview);
  const result = await previewEnrollments(mock.request, 'a-1');
  assert.deepEqual(mock.calls[0], { path: '/api/enrollments/preview', options: { method: 'POST', body: { areaId: 'a-1' } } });
  assert.equal(result.previewToken, 'tok-1');
  assert.equal(result.rows[0].documentNumber, '00123');
  assert.deepEqual(result.summary, { read: 1, valid: 1, invalid: 0, duplicates: 0 });
});

test('preview parser rejects a non-boolean consent value', () => {
  assert.throws(() => parseEnrollmentPreview({ ...preview, rows: [{ ...preview.rows[0], consent: 'Sí' }] }), { name: 'ApiError', status: 0 });
});

test('preview parser accepts null documentType and faculty for invalid rows', () => {
  const mixed = {
    ...preview,
    summary: { read: 2, valid: 1, invalid: 1, duplicates: 0 },
    rows: [
      { ...preview.rows[0] },
      { ...preview.rows[0], sourceRow: 3, documentType: null, faculty: null, email: 'invitado@example.test', errors: ['Área no válida'], duplicate: false },
    ],
  };
  const result = parseEnrollmentPreview(mixed);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].documentType, 'TI');
  assert.equal(result.rows[0].faculty, 'SYSTEMS_ENGINEERING');
  assert.equal(result.rows[1].documentType, null);
  assert.equal(result.rows[1].faculty, null);
  assert.equal(result.rows[1].documentNumber, '00123');
  assert.equal(result.rows[1].errors.length, 1);
  assert.equal(result.summary.invalid, 1);
});

test('preview parser rejects an unknown non-null documentType', () => {
  assert.throws(() => parseEnrollmentPreview({ ...preview, rows: [{ ...preview.rows[0], documentType: 'DNI' }] }), { name: 'ApiError', status: 0 });
});

test('preview parser rejects an unknown non-null faculty', () => {
  assert.throws(() => parseEnrollmentPreview({ ...preview, rows: [{ ...preview.rows[0], faculty: 'INGENIERIA' }] }), { name: 'ApiError', status: 0 });
});

test('importEnrollments POSTs only the signed preview token', async () => {
  const mock = mockApiRequest({ imported: 1, duplicates: 0, invalid: 0 });
  const result = await importEnrollments(mock.request, 'tok-1');
  assert.deepEqual(mock.calls[0], { path: '/api/enrollments/import', options: { method: 'POST', body: { previewToken: 'tok-1' } } });
  assert.deepEqual(result, { imported: 1, duplicates: 0, invalid: 0 });
});

test('listEnrollments encodes every filter and parses items and total', async () => {
  const mock = mockApiRequest({ items: [item], total: 1 });
  const result = await listEnrollments(mock.request, { areaId: 'a-1', faculty: 'SYSTEMS_ENGINEERING', period: '2026-2', status: 'PENDING', search: 'ana pérez', limit: 20, offset: 40 });
  assert.equal(mock.calls[0].path, '/api/enrollments?areaId=a-1&faculty=SYSTEMS_ENGINEERING&period=2026-2&status=PENDING&search=ana+p%C3%A9rez&limit=20&offset=40');
  assert.equal(result.total, 1);
  assert.equal(result.items[0].documentNumber, '00123');
});

test('listEnrollments without filters calls the bare endpoint', async () => {
  const mock = mockApiRequest({ items: [], total: 0 });
  await listEnrollments(mock.request);
  assert.equal(mock.calls[0].path, '/api/enrollments');
});

test('enrollment parser rejects an unknown status', () => {
  assert.throws(() => parseEnrollment({ ...item, status: 'WAITING' }), { name: 'ApiError', status: 0 });
});

test('changeEnrollmentStatus PATCHes the singular status route', async () => {
  const mock = mockApiRequest({ ...item, status: 'ACCEPTED' });
  const result = await changeEnrollmentStatus(mock.request, 'e-1', 'ACCEPTED');
  assert.deepEqual(mock.calls[0], { path: '/api/enrollments/e-1/status', options: { method: 'PATCH', body: { status: 'ACCEPTED' } } });
  assert.equal(result.status, 'ACCEPTED');
});

test('bulkChangeEnrollmentStatus PATCHes the bounded selection route', async () => {
  const mock = mockApiRequest({ updated: 2 });
  const result = await bulkChangeEnrollmentStatus(mock.request, ['e-1', 'e-2'], 'REJECTED');
  assert.deepEqual(mock.calls[0], { path: '/api/enrollments/status', options: { method: 'PATCH', body: { ids: ['e-1', 'e-2'], status: 'REJECTED' } } });
  assert.deepEqual(result, { updated: 2 });
});

test('deleteEnrollment DELETEs by id and resolves on 204', async () => {
  const mock = mockApiRequest(undefined);
  await deleteEnrollment(mock.request, 'e-1');
  assert.deepEqual(mock.calls[0], { path: '/api/enrollments/e-1', options: { method: 'DELETE' } });
});

test('enrollmentExportPath carries the same filters to the xlsx route', () => {
  assert.equal(
    enrollmentExportPath({ areaId: 'a-1', faculty: 'SOFTWARE_ENGINEERING', period: '2026-2', status: 'ACCEPTED', search: 'luis' }),
    '/api/enrollments/export.xlsx?areaId=a-1&faculty=SOFTWARE_ENGINEERING&period=2026-2&status=ACCEPTED&search=luis',
  );
  assert.equal(enrollmentExportPath(), '/api/enrollments/export.xlsx');
});

test('downloadEnrollmentExport resolves the xlsx blob on a spreadsheet response', async () => {
  const blob = new Blob(['PK'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fetcher = async () => new Response(blob, { status: 200, headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
  const result = await downloadEnrollmentExport(fetcher, { status: 'PENDING' });
  assert.equal(result.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(await result.text(), 'PK');
});

test('downloadEnrollmentExport turns a JSON error body into ApiError instead of a fake xlsx', async () => {
  const fetcher = async () => new Response(JSON.stringify({ message: 'Sin permiso' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(() => downloadEnrollmentExport(fetcher), { name: 'ApiError', status: 403 });
});

test('downloadEnrollmentExport rejects a 200 JSON body as an invalid file', async () => {
  const fetcher = async () => new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(() => downloadEnrollmentExport(fetcher), { name: 'ApiError', status: 0 });
});
