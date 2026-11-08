import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyticsPath, getAnalytics, getAnalyticsFilters, parseAnalytics, parseAnalyticsFilterOptions,
} from '../src/features/analytics/api.ts';

function mock(response: unknown) {
  const calls: string[] = [];
  return { calls, request: async (path: string) => { calls.push(path); return response; } };
}

const progress = { PENDING: 2, IN_PROGRESS: 3, DONE: 10, CANCELLED: 1 };
const onTime = { evaluated: 10, onTime: 7, late: 3, rate: 0.7 };
const scope = { global: false, areas: [{ id: 'a-1', name: 'Investigación' }], faculties: [{ id: 'f-1', name: 'Ingeniería' }] };

const filters = {
  scope,
  areas: [{ id: 'a-1', name: 'Investigación' }],
  faculties: [{ id: 'f-1', name: 'Ingeniería' }],
  projects: [{ id: 'p-1', name: 'Proyecto demo' }],
  tutors: [{ id: 'u-1', name: 'Tutor Demo' }],
};

const data = {
  generatedAt: '2026-11-08T15:00:00.000Z',
  timeZone: 'America/Bogota',
  period: { from: '2026-08-01', to: '2026-11-08' },
  scope: { global: true, areas: [], faculties: [] },
  users: {
    platform: { total: 42, active: 40, inactive: 2, byRole: { ADMIN: 1, AREA_MANAGER: 2, DEAN: 3, TUTOR: 8, STUDENT: 28 }, newInPeriod: 5 },
    participants: 35,
    withAssignedActivities: 28,
    completingActivities: 21,
    completionRate: 0.75,
  },
  activities: {
    total: 16,
    byProgress: progress,
    byResult: { SUCCESS: 8, FAILURE: 2, NONE: 6 },
    byApproval: { PENDING: 4, APPROVED: 9, REJECTED: 3 },
    completionRate: 0.6667,
    approvalRate: 0.9,
    successRate: 0.8,
    onTime,
    overdueOpen: 2,
    avgDaysToComplete: 6.4,
  },
  boards: { total: 5, byProgress: progress, overdue: 1, onTime },
  patterns: [
    {
      dimension: 'ASSIGNEES',
      buckets: [
        { key: '0', total: 10, done: 2, completionRate: 0.2, successRate: 0.5, onTimeRate: 1 },
        { key: '1', total: 0, done: 0, completionRate: null, successRate: null, onTimeRate: null },
      ],
    },
  ],
  faculties: [{ id: 'f-1', name: 'Ingeniería', projects: 4, activities: 60, done: 40, completionRate: 0.6667, onTimeRate: 0.8, meetings: 12, attachments: 30 }],
  areas: [{ id: 'a-1', name: 'Investigación', projects: 4, activities: 60, done: 40, completionRate: null, onTimeRate: null, meetings: 12, attachments: 30 }],
  tutors: [{ id: 'u-1', name: 'Tutor Demo', projects: 2, boards: 5, activities: 30, done: 20, completionRate: 0.6667, onTimeRate: 0.9, approvalRate: 0.85, meetingsOrganized: 6, meetingsAttended: 2 }],
  deans: [{ id: 'u-2', name: 'Decano Demo', faculties: ['Ingeniería'], projects: 4, activities: 60, done: 40, completionRate: 0.6667, onTimeRate: 0.8, meetingsOrganized: 3, meetingsAttended: 5 }],
  meetings: {
    total: 25,
    byStatus: { SCHEDULED: 3, IN_PROGRESS: 0, FINISHED: 20, CANCELLED: 2 },
    totalMinutes: 1350,
    avgMinutes: 54,
    withRecording: 8,
    withProject: 22,
    avgParticipants: 4.2,
  },
  attachments: {
    total: 80,
    byKind: { LINK: 30, DOCUMENT: 50 },
    byFormat: { PDF: 30, WORD: 10, EXCEL: 5, IMAGE: 5 },
    totalBytes: 104857600,
    activitiesWithAttachments: 45,
  },
  weekdays: [{ day: 1, completions: 10, attachments: 12, activitiesCreated: 20, meetings: 5 }],
  monthly: [{ month: '2026-10', activitiesCreated: 40, completions: 30, meetings: 8, attachments: 25 }],
  comparison: {
    previousPeriod: { from: '2026-04-24', to: '2026-07-31' },
    current: { completions: 10, completionRate: 0.6667, onTimeRate: 0.7, meetings: 25, attachments: 80, activitiesCreated: 16 },
    previous: { completions: 6, completionRate: 0.5, onTimeRate: 0.6, meetings: 18, attachments: 50, activitiesCreated: 12 },
  },
};

test('reads and validates the filter options', async () => {
  const m = mock(filters);
  const result = await getAnalyticsFilters(m.request);
  assert.equal(m.calls[0], '/api/analytics/filters');
  assert.deepEqual(result.projects, [{ id: 'p-1', name: 'Proyecto demo' }]);
  assert.equal(result.scope.global, false);
});

test('rejects malformed filter options', () => {
  assert.throws(() => parseAnalyticsFilterOptions({}));
  assert.throws(() => parseAnalyticsFilterOptions({ ...filters, tutors: [{ id: 'u-1' }] }));
  assert.throws(() => parseAnalyticsFilterOptions({ ...filters, scope: { global: 'sí', areas: [], faculties: [] } }));
});

test('reads and validates the analytics response', async () => {
  const m = mock(data);
  const result = await getAnalytics(m.request);
  assert.equal(m.calls[0], '/api/analytics');
  assert.equal(result.users.platform?.total, 42);
  assert.equal(result.activities.onTime.rate, 0.7);
  assert.equal(result.areas[0].completionRate, null);
  assert.equal(result.patterns[0].buckets[1].successRate, null);
  assert.equal(result.comparison?.previous.meetings, 18);
});

test('rejects malformed analytics responses', () => {
  assert.throws(() => parseAnalytics({ ...data, timeZone: 1 }));
  assert.throws(() => parseAnalytics({ ...data, period: { from: '2026-08-01' } }));
  assert.throws(() => parseAnalytics({ ...data, activities: { ...data.activities, completionRate: 1.5 } }));
  assert.throws(() => parseAnalytics({ ...data, activities: { ...data.activities, onTime: { ...onTime, rate: '0.7' } } }));
  assert.throws(() => parseAnalytics({ ...data, users: { ...data.users, platform: { ...data.users.platform, byRole: { ADMIN: 1 } } } }));
  assert.throws(() => parseAnalytics({ ...data, weekdays: [{ ...data.weekdays[0], day: 8 }] }));
  assert.throws(() => parseAnalytics({ ...data, patterns: [{ dimension: 'OTHER', buckets: [] }] }));
  assert.throws(() => parseAnalytics({ ...data, tutors: [{ ...data.tutors[0], meetingsAttended: -1 }] }));
});

test('accepts null platform, comparison and decimal values', () => {
  const result = parseAnalytics({
    ...data,
    users: { ...data.users, platform: null, completionRate: null },
    activities: { ...data.activities, avgDaysToComplete: null },
    meetings: { ...data.meetings, avgMinutes: null, avgParticipants: null },
    comparison: null,
  });
  assert.equal(result.users.platform, null);
  assert.equal(result.users.completionRate, null);
  assert.equal(result.activities.avgDaysToComplete, null);
  assert.equal(result.meetings.avgParticipants, null);
  assert.equal(result.comparison, null);
});

test('builds the query string omitting empty filters', () => {
  assert.equal(analyticsPath(), '/api/analytics');
  assert.equal(analyticsPath({ from: '', to: '  ', areaId: null, projectStatus: '' }), '/api/analytics');
  assert.equal(
    analyticsPath({ from: '2026-08-01', to: '2026-11-08', areaId: 'a-1', facultyId: '', projectId: 'p-1', tutorId: null, projectStatus: 'ACTIVE' }),
    '/api/analytics?from=2026-08-01&to=2026-11-08&areaId=a-1&projectId=p-1&projectStatus=ACTIVE',
  );
});

test('requests analytics with the active filters', async () => {
  const m = mock(data);
  await getAnalytics(m.request, { from: '2026-08-01', to: '2026-11-08', facultyId: 'f-1', projectStatus: 'FINISHED' });
  assert.equal(m.calls[0], '/api/analytics?from=2026-08-01&to=2026-11-08&facultyId=f-1&projectStatus=FINISHED');
  await assert.rejects(() => getAnalytics(mock({}).request));
});
