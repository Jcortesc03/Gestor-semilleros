import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changeMeetingStatus, createMeeting, getMeeting, getMeetingProjects, getMeetings, getMicrosoftConnectUrl,
  getMicrosoftStatus, getProjectMembers, parseMicrosoftStatus, setMeetingRecording, unlinkMicrosoft,
} from '../src/features/meetings/api.ts';

function mockApiRequest(response: unknown) {
  const calls: { path: string; options?: { method?: string; body?: unknown } }[] = [];
  const request = async (path: string, options?: { method?: string; body?: unknown }) => {
    calls.push({ path, options });
    return response;
  };
  return { calls, request };
}

const meeting = {
  id: 'm-1', reason: 'Revisión', startsAt: '2026-11-20T20:00:00.000Z', endsAt: '2026-11-20T21:00:00.000Z', durationMinutes: 60,
  status: 'SCHEDULED', joinUrl: 'https://teams.example.test/1', recordingUrl: null, cancelledAt: null,
  project: { id: 'p-1', title: 'Proyecto' }, organizer: { id: 'u-1', fullName: 'Tutor' }, participants: [{ id: 'u-2', fullName: 'Ana' }],
};

test('reads Microsoft status and validates its shape', async () => {
  const mock = mockApiRequest({ configured: true, linked: false, email: null, linkedAt: null });
  assert.equal((await getMicrosoftStatus(mock.request)).linked, false);
  assert.equal(mock.calls[0].path, '/api/integrations/microsoft/status');
  await assert.rejects(() => getMicrosoftStatus(mockApiRequest({ configured: 'yes' }).request));
});

test('reads accountType from status: WORK_OR_SCHOOL, PERSONAL, or null when absent or null', async () => {
  const base = { configured: true, linked: true, email: 'tutor@example.test', linkedAt: '2026-11-06T15:00:00.000Z' };
  const work = mockApiRequest({ ...base, accountType: 'WORK_OR_SCHOOL' });
  assert.equal((await getMicrosoftStatus(work.request)).accountType, 'WORK_OR_SCHOOL');
  assert.equal((await getMicrosoftStatus(mockApiRequest({ ...base, accountType: 'PERSONAL' }).request)).accountType, 'PERSONAL');
  assert.equal((await getMicrosoftStatus(mockApiRequest({ ...base, accountType: null }).request)).accountType, null);
  assert.equal((await getMicrosoftStatus(mockApiRequest(base).request)).accountType, null);
  assert.equal(parseMicrosoftStatus({ configured: false, linked: false, email: null, linkedAt: null }).accountType, null);
  assert.throws(() => parseMicrosoftStatus({ ...base, accountType: 'OTRO' }));
  assert.throws(() => parseMicrosoftStatus({ ...base, accountType: 1 }));
});

test('sends joinUrl in the create body only when provided', async () => {
  const mock = mockApiRequest(meeting);
  const body = { reason: 'Revisión', startsAt: '2026-11-20T20:00:00.000Z', durationMinutes: 60, projectId: null, participantIds: ['u-2'], joinUrl: 'https://meet.example.test/abc' };
  await createMeeting(mock.request, body);
  assert.deepEqual(mock.calls[0].options, { method: 'POST', body });
});

test('asks the connect URL in JSON format and only accepts https', async () => {
  const mock = mockApiRequest({ url: 'https://login.microsoftonline.com/x' });
  assert.equal(await getMicrosoftConnectUrl(mock.request), 'https://login.microsoftonline.com/x');
  assert.equal(mock.calls[0].path, '/api/integrations/microsoft/connect?format=json');
  await assert.rejects(() => getMicrosoftConnectUrl(mockApiRequest({ url: 'javascript:alert(1)' }).request));
  await assert.rejects(() => getMicrosoftConnectUrl(mockApiRequest({}).request));
});

test('unlinks with DELETE', async () => {
  const mock = mockApiRequest(undefined);
  await unlinkMicrosoft(mock.request);
  assert.deepEqual(mock.calls[0], { path: '/api/integrations/microsoft/link', options: { method: 'DELETE' } });
});

const page = (items: unknown[], extra: Partial<{ total: number; page: number; pageSize: number }> = {}) => ({ items, total: items.length, page: 1, pageSize: 50, ...extra });

test('lists and reads meetings with query and encoded ids', async () => {
  const mock = mockApiRequest(page([meeting], { total: 11, page: 2, pageSize: 10 }));
  const list = await getMeetings(mock.request, { status: 'SCHEDULED', page: 2, pageSize: 10 });
  assert.equal(mock.calls[0].path, '/api/meetings?status=SCHEDULED&page=2&pageSize=10');
  assert.equal(list.items[0].participants[0].fullName, 'Ana');
  assert.deepEqual([list.total, list.page, list.pageSize], [11, 2, 10]);
  const plain = mockApiRequest(page([]));
  await getMeetings(plain.request);
  assert.equal(plain.calls[0].path, '/api/meetings');
  const one = mockApiRequest(meeting);
  await getMeeting(one.request, 'a/b');
  assert.equal(one.calls[0].path, '/api/meetings/a%2Fb');
  await assert.rejects(() => getMeetings(mockApiRequest(page([{ ...meeting, status: 'X' }])).request));
  await assert.rejects(() => getMeetings(mockApiRequest({}).request));
  await assert.rejects(() => getMeetings(mockApiRequest([meeting]).request));
});

test('creates a meeting with the exact POST body', async () => {
  const mock = mockApiRequest(meeting);
  const body = { reason: 'Revisión', startsAt: '2026-11-20T20:00:00.000Z', durationMinutes: 60, projectId: 'p-1', participantIds: ['u-2'] };
  await createMeeting(mock.request, body);
  assert.deepEqual(mock.calls[0], { path: '/api/meetings', options: { method: 'POST', body } });
});

test('changes status and requires teamsSynced when cancelling', async () => {
  const progress = mockApiRequest({ ...meeting, status: 'IN_PROGRESS' });
  await changeMeetingStatus(progress.request, 'm-1', 'IN_PROGRESS', 'ignorado');
  assert.deepEqual(progress.calls[0].options, { method: 'PATCH', body: { status: 'IN_PROGRESS' } });
  const cancel = mockApiRequest({ ...meeting, status: 'CANCELLED', teamsSynced: false });
  const result = await changeMeetingStatus(cancel.request, 'm-1', 'CANCELLED', 'Motivo');
  assert.deepEqual(cancel.calls[0].options, { method: 'PATCH', body: { status: 'CANCELLED', comment: 'Motivo' } });
  assert.equal('teamsSynced' in result && result.teamsSynced, false);
  await assert.rejects(() => changeMeetingStatus(mockApiRequest({ ...meeting, status: 'CANCELLED' }).request, 'm-1', 'CANCELLED'));
});

test('sets and clears the recording link', async () => {
  const mock = mockApiRequest(meeting);
  await setMeetingRecording(mock.request, 'm-1', null);
  assert.deepEqual(mock.calls[0], { path: '/api/meetings/m-1/recording', options: { method: 'PUT', body: { recordingUrl: null } } });
});

test('lists projects and flattens project members', async () => {
  const projects = mockApiRequest(page([{ id: 'p-1', title: 'Proyecto', status: 'ACTIVE' }], { pageSize: 50 }));
  assert.deepEqual((await getMeetingProjects(projects.request)).items, [{ id: 'p-1', title: 'Proyecto' }]);
  assert.equal(projects.calls[0].path, '/api/projects');
  const searched = mockApiRequest(page([]));
  await getMeetingProjects(searched.request, { search: 'robó tica', pageSize: 50 });
  assert.equal(searched.calls[0].path, '/api/projects?search=rob%C3%B3+tica&pageSize=50');
  const members = mockApiRequest([{ id: 'mm', user: { id: 'u-2', fullName: 'Ana', email: 'ana@example.test' }, projectRole: 'STUDENT' }]);
  assert.deepEqual(await getProjectMembers(members.request, 'p-1'), [{ userId: 'u-2', fullName: 'Ana', email: 'ana@example.test', projectRole: 'STUDENT' }]);
  assert.equal(members.calls[0].path, '/api/projects/p-1/members');
});
