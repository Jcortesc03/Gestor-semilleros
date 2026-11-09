import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInstitutionalUser,
  getAnnouncement,
  getAnnouncementDeliveries,
  getAnnouncements,
  getNotificationPreferences,
  getWhatsAppStatus,
  removeAnnouncement,
  updateNotificationPreferences,
  createAnnouncement,
  listProjectsForAudience,
  whatsappQrUrl,
  listInstitutionalUsers,
  getInstitutionalUser,
  updateInstitutionalUser,
  setInstitutionalUserActive,
  setTemporaryPassword,
  announcementAttachmentUrl,
} from '../src/features/institutional/api.ts';

function mockApiRequest(response: unknown) {
  const calls: { path: string; options?: { method?: string; body?: unknown } }[] = [];
  const request = async (path: string, options?: { method?: string; body?: unknown }) => {
    calls.push({ path, options });
    return response;
  };
  return { calls, request };
}

const user = { id: 'u-1', email: 'admin@example.test', fullName: 'Admin', roles: ['ADMIN'] };
const announcement = {
  id: 'a-1', kind: 'NEWS', title: 'Convocatoria', content: 'Contenido', publishedAt: '2026-11-07T00:00:00.000Z',
  author: { id: 'u-1', fullName: 'Admin' }, audiences: [{ type: 'ALL' }],
};


/** Página de la API (ADR 0017). */
const pageOf = (items: unknown[], extra: Partial<{ total: number; page: number; pageSize: number }> = {}) => ({ items, total: items.length, page: 1, pageSize: 20, ...extra });

test('creates a user with the exact POST contract and validates the response', async () => {
  const mock = mockApiRequest({ id: 'new-1', email: 'tutor@example.test', fullName: 'Tutor', status: 'ACTIVE', roles: ['TUTOR'], hasPassword: false, createdAt: '2026-11-07T00:00:00.000Z' });
  const result = await createInstitutionalUser(mock.request, { email: 'tutor@example.test', fullName: 'Tutor', roles: ['TUTOR'] });
  assert.equal(mock.calls[0].path, '/api/users');
  assert.deepEqual(mock.calls[0].options, { method: 'POST', body: { email: 'tutor@example.test', fullName: 'Tutor', roles: ['TUTOR'] } });
  assert.equal(result.id, 'new-1');
});

test('uses announcement routes, encodes IDs, and preserves server response shape', async () => {
  const mock = mockApiRequest(pageOf([announcement], { total: 41, page: 2 }));
  const feed = await getAnnouncements(mock.request, { kind: 'NEWS', before: '2026-11-06T00:00:00.000Z', page: 2, pageSize: 20 });
  assert.equal(mock.calls[0].path, '/api/announcements?kind=NEWS&before=2026-11-06T00%3A00%3A00.000Z&page=2&pageSize=20');
  assert.deepEqual([feed.items.length, feed.total, feed.page, feed.pageSize], [1, 41, 2, 20]);
  await assert.rejects(() => getAnnouncements(mockApiRequest([announcement]).request));
  const one = mockApiRequest(announcement);
  await getAnnouncement(one.request, 'a/1');
  assert.equal(one.calls[0].path, '/api/announcements/a%2F1');
  const created = mockApiRequest({ ...announcement, queuedDeliveries: 2 });
  await createAnnouncement(created.request, { title: 'T', content: 'C', audiences: [{ type: 'ALL' }] });
  assert.equal(created.calls[0].options?.method, 'POST');
  const deliveries = mockApiRequest({ EMAIL: { PENDING: 0, SENT: 1, FAILED: 0, SKIPPED: 0 }, WHATSAPP: { PENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 } });
  await getAnnouncementDeliveries(deliveries.request, 'a-1');
  assert.equal(deliveries.calls[0].path, '/api/announcements/a-1/deliveries');
  const removed = mockApiRequest(undefined);
  await removeAnnouncement(removed.request, 'a-1');
  assert.deepEqual(removed.calls[0].options, { method: 'DELETE' });
});

test('keeps preferences partial and validates the complete response', async () => {
  const payload = { phone: null, preferences: ['NEWS', 'COMMUNICATION', 'CHANGE', 'NOTIFICATION'].flatMap((kind) => [{ kind, channel: 'EMAIL', enabled: true }, { kind, channel: 'WHATSAPP', enabled: false }]) };
  const mock = mockApiRequest(payload);
  await getNotificationPreferences(mock.request);
  assert.equal(mock.calls[0].path, '/api/me/notification-preferences');
  await updateNotificationPreferences(mock.request, { preferences: [{ kind: 'NEWS', channel: 'EMAIL', enabled: false }] });
  assert.deepEqual(mock.calls[1].options, { method: 'PUT', body: { preferences: [{ kind: 'NEWS', channel: 'EMAIL', enabled: false }] } });
});

test('reads WhatsApp status only through the protected status route', async () => {
  const mock = mockApiRequest({ transport: 'disabled' });
  const result = await getWhatsAppStatus(mock.request);
  assert.equal(mock.calls[0].path, '/api/integrations/whatsapp/status');
  assert.equal(result.transport, 'disabled');
});

test('rejects unsafe response data instead of exposing it to the UI', async () => {
  const mock = mockApiRequest({ id: 1 });
  await assert.rejects(() => getAnnouncement(mock.request, 'a-1'));
});

test('accepts the MEETING preference kind returned by the contract', async () => {
  const payload = { phone: '+573000000001', preferences: [{ kind: 'MEETING', channel: 'WHATSAPP', enabled: false }] };
  const mock = mockApiRequest(payload);
  const result = await getNotificationPreferences(mock.request);
  assert.deepEqual(result.preferences, [{ kind: 'MEETING', channel: 'WHATSAPP', enabled: false }]);
});

test('rejects a preference kind outside the contract', async () => {
  const mock = mockApiRequest({ phone: null, preferences: [{ kind: 'OTHER', channel: 'EMAIL', enabled: true }] });
  await assert.rejects(() => getNotificationPreferences(mock.request));
});

test('parses the builderbot QR state and exposes the QR image only through its PNG route', async () => {
  const mock = mockApiRequest({
    transport: 'builderbot', provider: 'baileys', state: 'awaiting_qr', connectedPhone: null,
    qr: '2@contenido', pairingCode: null, detail: null, updatedAt: '2026-11-06T12:00:00.000Z',
  });
  const status = await getWhatsAppStatus(mock.request);
  assert.equal(status.transport, 'builderbot');
  assert.equal(whatsappQrUrl(status.transport === 'builderbot' ? status.updatedAt : undefined), '/api/integrations/whatsapp/qr?v=2026-11-06T12%3A00%3A00.000Z');
  assert.equal(whatsappQrUrl(), '/api/integrations/whatsapp/qr');
});

test('tutors use GET /api/projects/tutored without querying members of each project', async () => {
  const routes: Record<string, unknown> = {
    '/api/projects/tutored': [{ id: 'p-1', title: 'Uno', status: 'ACTIVE', isPrimaryTutor: true }],
  };
  const paths: string[] = [];
  const request = async (path: string) => { paths.push(path); return routes[path]; };
  assert.deepEqual(await listProjectsForAudience(request, { visible: false, tutored: true }), { items: [{ id: 'p-1', title: 'Uno' }], more: false });
  assert.deepEqual(paths, ['/api/projects/tutored']);
  // La lista de tutorados no se pagina: la búsqueda se aplica aquí por título.
  assert.deepEqual(await listProjectsForAudience(request, { visible: false, tutored: true }, 'dos'), { items: [], more: false });
});

test('admins and deans search GET /api/projects with pageSize instead of loading every project', async () => {
  const mock = mockApiRequest(pageOf([{ id: 'p-1', title: 'Uno' }, { id: 'p-2', title: 'Dos' }], { total: 120, pageSize: 50 }));
  assert.deepEqual(await listProjectsForAudience(mock.request, { visible: true, tutored: false }), {
    items: [{ id: 'p-1', title: 'Uno' }, { id: 'p-2', title: 'Dos' }],
    more: true,
  });
  await listProjectsForAudience(mock.request, { visible: true, tutored: false }, '  robó ');
  assert.deepEqual(mock.calls.map((call) => call.path), ['/api/projects?pageSize=50', '/api/projects?search=rob%C3%B3&pageSize=50']);
});

test('a dean who is also a tutor merges both sources without duplicates', async () => {
  const routes: Record<string, unknown> = {
    '/api/projects?pageSize=50': pageOf([{ id: 'p-1', title: 'Uno' }, { id: 'p-2', title: 'Dos' }], { pageSize: 50 }),
    '/api/projects/tutored': [{ id: 'p-2', title: 'Dos', status: 'ACTIVE', isPrimaryTutor: false }, { id: 'p-3', title: 'Tres', status: 'ACTIVE', isPrimaryTutor: true }],
  };
  const request = async (path: string) => routes[path];
  assert.deepEqual(await listProjectsForAudience(request, { visible: true, tutored: true }), {
    items: [{ id: 'p-1', title: 'Uno' }, { id: 'p-2', title: 'Dos' }, { id: 'p-3', title: 'Tres' }],
    more: false,
  });
});

const adminUser = { id: 'u-2', fullName: 'Ana Pérez', email: 'ana@example.test', roles: ['STUDENT'], status: 'ACTIVE' };
const adminDetail = {
  ...adminUser, hasPassword: true, mustChangePassword: false,
  createdAt: '2026-01-10T10:00:00.000Z', updatedAt: '2026-01-10T10:00:00.000Z',
};

test('lists users for administration always sending the explicit status filter', async () => {
  const mock = mockApiRequest(pageOf([adminUser], { total: 21, page: 2 }));
  const result = await listInstitutionalUsers(mock.request, { search: 'ana p', role: 'STUDENT', status: 'ALL', page: 2, pageSize: 20 });
  assert.equal(mock.calls[0].path, '/api/users?search=ana+p&role=STUDENT&status=ALL&page=2&pageSize=20');
  assert.deepEqual(result, { items: [adminUser], total: 21, page: 2, pageSize: 20 });
  const defaults = mockApiRequest(pageOf([]));
  await listInstitutionalUsers(defaults.request, { status: 'INACTIVE' });
  assert.equal(defaults.calls[0].path, '/api/users?status=INACTIVE');
});

test('rejects a list item with a status outside the contract', async () => {
  const mock = mockApiRequest(pageOf([{ ...adminUser, status: 'SUSPENDED' }]));
  await assert.rejects(() => listInstitutionalUsers(mock.request, { status: 'ALL' }));
});

test('gets the user detail with an encoded id and validates the flags', async () => {
  const mock = mockApiRequest(adminDetail);
  const result = await getInstitutionalUser(mock.request, 'u/2');
  assert.equal(mock.calls[0].path, '/api/users/u%2F2');
  assert.equal(result.mustChangePassword, false);
  const broken = mockApiRequest({ ...adminDetail, hasPassword: 'yes' });
  await assert.rejects(() => getInstitutionalUser(broken.request, 'u-2'));
});

test('patches only the sent fields of the user', async () => {
  const mock = mockApiRequest({ ...adminDetail, roles: ['TUTOR'] });
  const result = await updateInstitutionalUser(mock.request, 'u-2', { roles: ['TUTOR'] });
  assert.deepEqual(mock.calls[0], { path: '/api/users/u-2', options: { method: 'PATCH', body: { roles: ['TUTOR'] } } });
  assert.deepEqual(result.roles, ['TUTOR']);
});

test('deactivates and reactivates through the action routes', async () => {
  const off = mockApiRequest({ ...adminDetail, status: 'INACTIVE' });
  const result = await setInstitutionalUserActive(off.request, 'u-2', false);
  assert.deepEqual(off.calls[0], { path: '/api/users/u-2/deactivate', options: { method: 'POST' } });
  assert.equal(result.status, 'INACTIVE');
  const on = mockApiRequest(adminDetail);
  await setInstitutionalUserActive(on.request, 'u-2', true);
  assert.equal(on.calls[0].path, '/api/users/u-2/activate');
});

test('parses announcement attachments and treats a missing list as empty', async () => {
  const withFiles = mockApiRequest(pageOf([{
    ...announcement,
    attachments: [{ id: 'att-1', fileName: 'convocatoria.pdf', format: 'PDF', mimeType: 'application/pdf', sizeBytes: 183042 }],
  }]));
  const [parsed] = (await getAnnouncements(withFiles.request, { kind: 'NEWS' })).items;
  assert.deepEqual(parsed.attachments, [{ id: 'att-1', fileName: 'convocatoria.pdf', format: 'PDF', mimeType: 'application/pdf', sizeBytes: 183042 }]);
  assert.equal(withFiles.calls[0].path, '/api/announcements?kind=NEWS');

  const legacy = mockApiRequest(pageOf([announcement]));
  const [withoutList] = (await getAnnouncements(legacy.request)).items;
  assert.deepEqual(withoutList.attachments, []);
});

test('rejects an attachment with a format or size outside the contract', async () => {
  const badFormat = mockApiRequest(pageOf([{ ...announcement, attachments: [{ id: 'att-1', fileName: 'x.zip', format: 'ZIP', mimeType: 'application/zip', sizeBytes: 10 }] }]));
  await assert.rejects(() => getAnnouncements(badFormat.request));
  const badSize = mockApiRequest(pageOf([{ ...announcement, attachments: [{ id: 'att-1', fileName: 'x.pdf', format: 'PDF', mimeType: 'application/pdf', sizeBytes: -1 }] }]));
  await assert.rejects(() => getAnnouncements(badSize.request));
});

test('builds the attachment download URL with encoded IDs and optional inline view', () => {
  assert.equal(announcementAttachmentUrl('a-1', 'att-1'), '/api/announcements/a-1/attachments/att-1/download');
  assert.equal(announcementAttachmentUrl('a/1', 'att 1', { inline: true }), '/api/announcements/a%2F1/attachments/att%201/download?inline=true');
});

test('publishes with files as multipart: JSON body in data and one entry per file in files', async () => {
  const mock = mockApiRequest({ ...announcement, attachments: [] });
  const files = [new File(['%PDF'], 'uno.pdf', { type: 'application/pdf' }), new File(['x'], 'dos.png', { type: 'image/png' })];
  const body = { kind: 'NEWS' as const, title: 'Convocatoria', content: 'Detalles', audiences: [{ type: 'ALL' as const }] };
  await createAnnouncement(mock.request, body, files);
  const sent = mock.calls[0].options?.body;
  assert.ok(sent instanceof FormData);
  assert.equal(mock.calls[0].path, '/api/announcements');
  assert.equal(mock.calls[0].options?.method, 'POST');
  assert.deepEqual(JSON.parse(String(sent.get('data'))), body);
  assert.deepEqual(sent.getAll('files').map((item) => (item as File).name), ['uno.pdf', 'dos.png']);
});

test('publishes without files as plain JSON', async () => {
  const mock = mockApiRequest({ ...announcement, attachments: [] });
  const body = { title: 'Sin archivos', content: 'Texto', audiences: [{ type: 'ALL' as const }] };
  await createAnnouncement(mock.request, body, []);
  assert.deepEqual(mock.calls[0].options, { method: 'POST', body });
});

test('sets a temporary password with the PUT contract and returns nothing', async () => {
  const mock = mockApiRequest(undefined);
  const result = await setTemporaryPassword(mock.request, 'u-2', 'Temporal-2026');
  assert.deepEqual(mock.calls[0], { path: '/api/users/u-2/password', options: { method: 'PUT', body: { password: 'Temporal-2026' } } });
  assert.equal(result, undefined);
});
