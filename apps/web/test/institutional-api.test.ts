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

test('creates a user with the exact POST contract and validates the response', async () => {
  const mock = mockApiRequest({ id: 'new-1', email: 'tutor@example.test', fullName: 'Tutor', status: 'ACTIVE', roles: ['TUTOR'], hasPassword: false, createdAt: '2026-11-07T00:00:00.000Z' });
  const result = await createInstitutionalUser(mock.request, { email: 'tutor@example.test', fullName: 'Tutor', roles: ['TUTOR'] });
  assert.equal(mock.calls[0].path, '/api/users');
  assert.deepEqual(mock.calls[0].options, { method: 'POST', body: { email: 'tutor@example.test', fullName: 'Tutor', roles: ['TUTOR'] } });
  assert.equal(result.id, 'new-1');
});

test('uses announcement routes, encodes IDs, and preserves server response shape', async () => {
  const mock = mockApiRequest([announcement]);
  await getAnnouncements(mock.request, { kind: 'NEWS', limit: 20 });
  assert.equal(mock.calls[0].path, '/api/announcements?kind=NEWS&limit=20');
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
  assert.deepEqual(await listProjectsForAudience(request, { visible: false, tutored: true }), [{ id: 'p-1', title: 'Uno' }]);
  assert.deepEqual(paths, ['/api/projects/tutored']);
});

test('admins and deans use every visible project from GET /api/projects', async () => {
  const mock = mockApiRequest([{ id: 'p-1', title: 'Uno' }, { id: 'p-2', title: 'Dos' }]);
  assert.deepEqual(await listProjectsForAudience(mock.request, { visible: true, tutored: false }), [{ id: 'p-1', title: 'Uno' }, { id: 'p-2', title: 'Dos' }]);
  assert.deepEqual(mock.calls.map((call) => call.path), ['/api/projects']);
});

test('a dean who is also a tutor merges both sources without duplicates', async () => {
  const routes: Record<string, unknown> = {
    '/api/projects': [{ id: 'p-1', title: 'Uno' }, { id: 'p-2', title: 'Dos' }],
    '/api/projects/tutored': [{ id: 'p-2', title: 'Dos', status: 'ACTIVE', isPrimaryTutor: false }, { id: 'p-3', title: 'Tres', status: 'ACTIVE', isPrimaryTutor: true }],
  };
  const request = async (path: string) => routes[path];
  assert.deepEqual(await listProjectsForAudience(request, { visible: true, tutored: true }), [
    { id: 'p-1', title: 'Uno' }, { id: 'p-2', title: 'Dos' }, { id: 'p-3', title: 'Tres' },
  ]);
});
