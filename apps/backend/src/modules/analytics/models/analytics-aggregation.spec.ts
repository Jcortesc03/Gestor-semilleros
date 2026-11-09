import { buildAnalytics, rate, type ActivityInput, type AnalyticsInput, type BoardInput } from './analytics-aggregation';

const TZ = 'America/Bogota';
const d = (iso: string) => new Date(iso);

const board = (over: Partial<BoardInput> = {}): BoardInput => ({
  id: 'b1',
  projectId: 'p1',
  createdAt: d('2026-10-01T15:00:00Z'),
  dueDate: d('2026-10-15T00:00:00Z'),
  progressStatus: 'IN_PROGRESS',
  completedAt: null,
  responsibleTutorId: 't1',
  ...over,
});

let seq = 0;
const activity = (over: Partial<ActivityInput> = {}): ActivityInput => ({
  id: `a${++seq}`,
  boardId: 'b1',
  createdAt: d('2026-10-05T15:00:00Z'),
  hasDescription: false,
  progressStatus: 'PENDING',
  result: null,
  approvalStatus: 'PENDING',
  completedAt: null,
  assigneeIds: [],
  attachments: [],
  ...over,
});

function input(over: Partial<AnalyticsInput> = {}): AnalyticsInput {
  return {
    now: d('2026-11-08T15:00:00Z'),
    timeZone: TZ,
    period: { from: null, to: null },
    scope: { global: true, areas: [], faculties: [] },
    platformUsers: null,
    participants: 0,
    projects: [{ id: 'p1', area: { id: 'ar1', name: 'Área' }, faculties: [{ id: 'f1', name: 'Ingeniería' }] }],
    boards: [board()],
    activities: [],
    meetings: [],
    tutors: [{ id: 't1', name: 'Tutor' }],
    deans: [{ id: 'd1', name: 'Decana', faculties: [{ id: 'f1', name: 'Ingeniería' }] }],
    ...over,
  };
}

describe('rate', () => {
  it('redondea a 4 decimales y devuelve null sin denominador', () => {
    expect(rate(1, 3)).toBe(0.3333);
    expect(rate(0, 0)).toBeNull();
  });
});

describe('buildAnalytics', () => {
  it('sin datos devuelve ceros, tasas null y 7 días', () => {
    const r = buildAnalytics(input({ boards: [], tutors: [], deans: [], projects: [] }));
    expect(r.activities.total).toBe(0);
    expect(r.activities.completionRate).toBeNull();
    expect(r.weekdays).toHaveLength(7);
    expect(r.monthly).toEqual([]);
    expect(r.comparison).toBeNull();
    expect(r.patterns.map((p) => p.dimension)).toEqual(['ASSIGNEES', 'ATTACHMENTS', 'DESCRIPTION', 'LEAD_TIME', 'BOARD_SIZE']);
  });

  it('calcula completitud, a tiempo según la fecha local y usuarios que completan', () => {
    const r = buildAnalytics(
      input({
        activities: [
          // 15-oct 23:00 en Bogotá = 16-oct 04:00 UTC: a tiempo (vence el 15).
          activity({ progressStatus: 'DONE', completedAt: d('2026-10-16T04:00:00Z'), assigneeIds: ['s1'], result: 'SUCCESS', approvalStatus: 'APPROVED' }),
          activity({ progressStatus: 'DONE', completedAt: d('2026-10-17T15:00:00Z'), assigneeIds: ['s2'], result: 'FAILURE' }),
          activity({ progressStatus: 'PENDING', assigneeIds: ['s3'] }),
          activity({ progressStatus: 'CANCELLED' }),
        ],
      }),
    );
    expect(r.activities.total).toBe(4);
    expect(r.activities.completionRate).toBe(0.6667);
    expect(r.activities.onTime).toEqual({ evaluated: 2, onTime: 1, late: 1, rate: 0.5 });
    expect(r.activities.successRate).toBe(0.5);
    expect(r.activities.approvalRate).toBe(0.5);
    expect(r.activities.overdueOpen).toBe(1);
    expect(r.users).toMatchObject({ withAssignedActivities: 3, completingActivities: 2, completionRate: 0.6667 });
    expect(r.faculties[0]).toMatchObject({ id: 'f1', activities: 4, done: 2, completionRate: 0.6667 });
    expect(r.tutors[0]).toMatchObject({ id: 't1', boards: 1, done: 2 });
    expect(r.deans[0]).toMatchObject({ id: 'd1', faculties: ['Ingeniería'], done: 2 });
  });

  it('agrupa patrones por número de encargados y adjuntos', () => {
    const r = buildAnalytics(
      input({
        activities: [
          activity({ assigneeIds: ['a', 'b', 'c'], progressStatus: 'DONE', completedAt: d('2026-10-10T15:00:00Z'), attachments: [{ kind: 'LINK', createdAt: d('2026-10-06T15:00:00Z'), format: null, sizeBytes: null }] }),
          activity({ assigneeIds: [] }),
        ],
      }),
    );
    const assignees = r.patterns.find((p) => p.dimension === 'ASSIGNEES')!.buckets;
    expect(assignees.find((b) => b.key === '3+')).toMatchObject({ total: 1, done: 1, completionRate: 1, onTimeRate: 1 });
    expect(assignees.find((b) => b.key === '0')).toMatchObject({ total: 1, done: 0, completionRate: 0 });
    const attachments = r.patterns.find((p) => p.dimension === 'ATTACHMENTS')!.buckets;
    expect(attachments.find((b) => b.key === 'LINK_ONLY')!.total).toBe(1);
  });

  it('aplica el periodo y compara con el periodo anterior de igual duración', () => {
    const r = buildAnalytics(
      input({
        period: { from: '2026-10-11', to: '2026-10-20' },
        activities: [
          activity({ createdAt: d('2026-10-05T15:00:00Z'), progressStatus: 'DONE', completedAt: d('2026-10-12T15:00:00Z') }),
          activity({ createdAt: d('2026-10-12T15:00:00Z') }),
        ],
        meetings: [
          { organizerId: 't1', projectId: 'p1', startsAt: d('2026-10-13T15:00:00Z'), durationMinutes: 60, status: 'FINISHED', hasRecording: true, participantIds: ['d1'] },
          { organizerId: 't1', projectId: 'p1', startsAt: d('2026-10-02T15:00:00Z'), durationMinutes: 30, status: 'CANCELLED', hasRecording: false, participantIds: [] },
        ],
      }),
    );
    expect(r.activities.total).toBe(1);
    expect(r.activities.onTime.evaluated).toBe(1);
    expect(r.meetings).toMatchObject({ total: 1, totalMinutes: 60, withRecording: 1 });
    expect(r.tutors[0]).toMatchObject({ meetingsOrganized: 1, meetingsAttended: 0 });
    expect(r.deans[0]).toMatchObject({ meetingsAttended: 1 });
    expect(r.comparison?.previousPeriod).toEqual({ from: '2026-10-01', to: '2026-10-10' });
    expect(r.comparison?.previous).toMatchObject({ activitiesCreated: 1, meetings: 1, completions: 0 });
    expect(r.monthly).toEqual([{ month: '2026-10', activitiesCreated: 1, completions: 1, meetings: 1, attachments: 0 }]);
  });

  it('cuenta días de la semana en la zona horaria institucional', () => {
    // Lunes 12-oct-2026 a las 23:30 en Bogotá = martes 04:30 UTC.
    const r = buildAnalytics(input({ activities: [activity({ progressStatus: 'DONE', completedAt: d('2026-10-13T04:30:00Z') })] }));
    expect(r.weekdays[0].completions).toBe(1);
  });

  it('resume la plataforma solo cuando se entregan usuarios', () => {
    const r = buildAnalytics(
      input({
        period: { from: '2026-11-01', to: '2026-11-08' },
        platformUsers: [
          { status: 'ACTIVE', roles: ['ADMIN'], createdAt: d('2026-01-01T00:00:00Z') },
          { status: 'INACTIVE', roles: ['TUTOR', 'DEAN'], createdAt: d('2026-11-02T15:00:00Z') },
        ],
      }),
    );
    expect(r.users.platform).toMatchObject({ total: 2, active: 1, inactive: 1, newInPeriod: 1 });
    expect(r.users.platform?.byRole).toMatchObject({ ADMIN: 1, TUTOR: 1, DEAN: 1, STUDENT: 0 });
  });
});
