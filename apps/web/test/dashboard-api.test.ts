import assert from 'node:assert/strict';
import test from 'node:test';
import { getDashboard, getRecentAnnouncements, getUpcomingMeetings, parseDashboard } from '../src/features/dashboard/api.ts';

function mock(response: unknown) {
  const calls: string[] = [];
  return { calls, request: async (path: string) => { calls.push(path); return response; } };
}

const zeros = { PENDING: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 };
const section = {
  role: 'TUTOR',
  scope: { areas: [{ id: 'a-1', name: 'Investigación' }], faculties: [] },
  projects: { total: 1, byStatus: { ACTIVE: 1, FINISHED: 0, CANCELLED: 0 }, items: [{ id: 'p-1', title: 'Demo', status: 'ACTIVE', projectRole: null, boards: 2, activities: 5, activitiesDone: 1 }] },
  boards: { total: 2, byProgress: zeros, overdue: 1 },
  activities: { total: 5, byProgress: { ...zeros, DONE: 1 }, pendingApproval: 1 },
};
const data = { generatedAt: '2026-11-07T15:00:00.000Z', sections: [section] };

test('reads and validates the dashboard', async () => {
  const m = mock(data);
  const result = await getDashboard(m.request);
  assert.equal(m.calls[0], '/api/dashboard');
  assert.equal(result.sections[0].projects.items[0].activitiesDone, 1);
  assert.equal(result.sections[0].projects.items[0].projectRole, null);
});

test('rejects malformed dashboards', () => {
  assert.throws(() => parseDashboard({ generatedAt: 'x' }));
  assert.throws(() => parseDashboard({ ...data, sections: [{ ...section, role: 'ROOT' }] }));
  assert.throws(() => parseDashboard({ ...data, sections: [{ ...section, boards: { ...section.boards, overdue: '1' } }] }));
  assert.throws(() => parseDashboard({ ...data, sections: [{ ...section, activities: { ...section.activities, byProgress: { PENDING: 0 } } }] }));
});

const pageOf = (items: unknown[], pageSize: number) => ({ items, total: items.length, page: 1, pageSize });

test('asks for the first page of five scheduled meetings', async () => {
  const m = mock(pageOf([{ id: 'm-1', reason: 'R', startsAt: '2026-11-20T20:00:00.000Z', status: 'SCHEDULED', joinUrl: null, project: null }], 5));
  const result = await getUpcomingMeetings(m.request, new Date('2026-11-07T00:00:00.000Z'));
  assert.match(m.calls[0], /^\/api\/meetings\?status=SCHEDULED&from=.+&pageSize=5$/);
  assert.equal(result.length, 1);
  await assert.rejects(() => getUpcomingMeetings(mock(pageOf([{ id: 1 }], 5)).request));
  await assert.rejects(() => getUpcomingMeetings(mock([]).request));
});

test('asks for the first page of three announcements', async () => {
  const m = mock(pageOf([{ id: 'n-1', kind: 'NEWS', title: 'T', publishedAt: '2026-11-06T00:00:00.000Z', author: { id: 'u', fullName: 'Admin' } }], 3));
  const result = await getRecentAnnouncements(m.request);
  assert.equal(m.calls[0], '/api/announcements?pageSize=3');
  assert.equal(result[0].author, 'Admin');
  await assert.rejects(() => getRecentAnnouncements(mock({}).request));
});
