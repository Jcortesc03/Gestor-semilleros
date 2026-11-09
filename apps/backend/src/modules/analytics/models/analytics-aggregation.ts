import type {
  ApprovalStatus,
  AttachmentKind,
  DocumentFormat,
  MeetingStatus,
  ProgressStatus,
  Role,
  UserStatus,
  WorkResult,
} from '../../../generated/prisma/enums';
import type {
  AnalyticsResponseDto,
  EntityStatsDto,
  OnTimeDto,
  PatternBucketDto,
  PatternDimension,
  PeriodSummaryDto,
} from '../dtos/analytics-response.dto';
import { addDays, dateOnlyKey, daysBetween, isoWeekday, localDateKey, monthRange } from './analytics-time';

export const MAX_MONTHS = 24;

const PROGRESS_KEYS: ProgressStatus[] = ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
const APPROVAL_KEYS: ApprovalStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];
const MEETING_KEYS: MeetingStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED'];
const FORMAT_KEYS: DocumentFormat[] = ['PDF', 'WORD', 'EXCEL', 'IMAGE'];
const ROLE_KEYS: Role[] = ['ADMIN', 'AREA_MANAGER', 'DEAN', 'TUTOR', 'STUDENT'];

export const PATTERN_BUCKETS: Record<PatternDimension, readonly string[]> = {
  ASSIGNEES: ['0', '1', '2', '3+'],
  ATTACHMENTS: ['NONE', 'LINK_ONLY', 'DOCUMENT_ONLY', 'BOTH'],
  DESCRIPTION: ['WITH', 'WITHOUT'],
  LEAD_TIME: ['LT_7', 'D7_30', 'GT_30', 'PAST'],
  BOARD_SIZE: ['S_1_5', 'M_6_15', 'L_16_PLUS'],
};

// ─── Entradas (filas planas ya recortadas al alcance y a los filtros estructurales) ───

export interface Named {
  id: string;
  name: string;
}
export interface AttachmentInput {
  kind: AttachmentKind;
  createdAt: Date;
  format: DocumentFormat | null;
  sizeBytes: number | null;
}
export interface ActivityInput {
  id: string;
  boardId: string;
  createdAt: Date;
  hasDescription: boolean;
  progressStatus: ProgressStatus;
  result: WorkResult | null;
  approvalStatus: ApprovalStatus;
  completedAt: Date | null;
  assigneeIds: string[];
  attachments: AttachmentInput[];
}
export interface BoardInput {
  id: string;
  projectId: string;
  createdAt: Date;
  dueDate: Date;
  progressStatus: ProgressStatus;
  completedAt: Date | null;
  responsibleTutorId: string;
}
export interface ProjectInput {
  id: string;
  area: Named;
  faculties: Named[];
}
export interface MeetingInput {
  organizerId: string;
  projectId: string | null;
  startsAt: Date;
  durationMinutes: number;
  status: MeetingStatus;
  hasRecording: boolean;
  participantIds: string[];
}
export interface PlatformUserInput {
  status: UserStatus;
  roles: Role[];
  createdAt: Date;
}
export interface DeanInput extends Named {
  faculties: Named[];
}
export interface Period {
  from: string | null;
  to: string | null;
}

export interface AnalyticsInput {
  now: Date;
  timeZone: string;
  period: Period;
  scope: AnalyticsResponseDto['scope'];
  /** `null` si no corresponde mostrar los totales de la plataforma. */
  platformUsers: PlatformUserInput[] | null;
  participants: number;
  projects: ProjectInput[];
  boards: BoardInput[];
  /** Todas las actividades no archivadas de `boards`, sin recortar por periodo. */
  activities: ActivityInput[];
  meetings: MeetingInput[];
  tutors: Named[];
  deans: DeanInput[];
}

// ─── Utilidades ───

/** Tasa con 4 decimales, o `null` si el denominador es 0. */
export function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 10_000 : null;
}
function avg1(total: number, count: number): number | null {
  return count > 0 ? Math.round((total / count) * 10) / 10 : null;
}
function zeroes<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}
function inPeriod(key: string, period: Period): boolean {
  return (period.from === null || key >= period.from) && (period.to === null || key <= period.to);
}
function byRateThenName<T extends { name: string; completionRate: number | null }>(a: T, b: T): number {
  if (a.completionRate !== b.completionRate) {
    if (a.completionRate === null) return 1;
    if (b.completionRate === null) return -1;
    return b.completionRate - a.completionRate;
  }
  return a.name.localeCompare(b.name, 'es');
}

/** Contexto derivado de las entradas, compartido por todos los cálculos. */
class Facts {
  readonly boardById = new Map<string, BoardInput>();
  readonly projectById = new Map<string, ProjectInput>();
  readonly boardSize = new Map<string, number>();

  constructor(readonly input: AnalyticsInput) {
    for (const b of input.boards) this.boardById.set(b.id, b);
    for (const p of input.projects) this.projectById.set(p.id, p);
    for (const a of input.activities) this.boardSize.set(a.boardId, (this.boardSize.get(a.boardId) ?? 0) + 1);
  }

  key(date: Date): string {
    return localDateKey(date, this.input.timeZone);
  }
  projectOf(a: ActivityInput): string {
    return this.boardById.get(a.boardId)?.projectId ?? '';
  }
  /** `true`/`false` si la actividad está terminada con fecha; `null` si no se puede evaluar. */
  onTime(a: ActivityInput): boolean | null {
    const board = this.boardById.get(a.boardId);
    if (a.progressStatus !== 'DONE' || a.completedAt === null || !board) return null;
    return this.key(a.completedAt) <= dateOnlyKey(board.dueDate);
  }
  createdIn(period: Period): ActivityInput[] {
    return this.input.activities.filter((a) => inPeriod(this.key(a.createdAt), period));
  }
  completedIn(period: Period): ActivityInput[] {
    return this.input.activities.filter(
      (a) => a.progressStatus === 'DONE' && a.completedAt !== null && inPeriod(this.key(a.completedAt), period),
    );
  }
  attachmentsIn(period: Period): Array<AttachmentInput & { activity: ActivityInput }> {
    return this.input.activities.flatMap((activity) =>
      activity.attachments.filter((t) => inPeriod(this.key(t.createdAt), period)).map((t) => ({ ...t, activity })),
    );
  }
  meetingsIn(period: Period): MeetingInput[] {
    return this.input.meetings.filter((m) => inPeriod(this.key(m.startsAt), period));
  }
}

function onTimeOf(results: Array<boolean | null>): OnTimeDto {
  const evaluated = results.filter((r): r is boolean => r !== null);
  const onTime = evaluated.filter(Boolean).length;
  return { evaluated: evaluated.length, onTime, late: evaluated.length - onTime, rate: rate(onTime, evaluated.length) };
}

interface GroupStats {
  activities: number;
  done: number;
  completionRate: number | null;
  successRate: number | null;
  onTimeRate: number | null;
  approvalRate: number | null;
}
function groupStats(facts: Facts, activities: ActivityInput[]): GroupStats {
  let done = 0;
  let cancelled = 0;
  let success = 0;
  let failure = 0;
  let approved = 0;
  for (const a of activities) {
    if (a.progressStatus === 'DONE') done += 1;
    if (a.progressStatus === 'CANCELLED') cancelled += 1;
    if (a.result === 'SUCCESS') success += 1;
    if (a.result === 'FAILURE') failure += 1;
    if (a.approvalStatus === 'APPROVED') approved += 1;
  }
  return {
    activities: activities.length,
    done,
    completionRate: rate(done, activities.length - cancelled),
    successRate: rate(success, success + failure),
    onTimeRate: onTimeOf(activities.map((a) => facts.onTime(a))).rate,
    approvalRate: rate(approved, done),
  };
}

// ─── Secciones ───

function patternKey(facts: Facts, dimension: PatternDimension, a: ActivityInput): string {
  switch (dimension) {
    case 'ASSIGNEES':
      return a.assigneeIds.length >= 3 ? '3+' : String(a.assigneeIds.length);
    case 'ATTACHMENTS': {
      const link = a.attachments.some((t) => t.kind === 'LINK');
      const doc = a.attachments.some((t) => t.kind === 'DOCUMENT');
      return link && doc ? 'BOTH' : link ? 'LINK_ONLY' : doc ? 'DOCUMENT_ONLY' : 'NONE';
    }
    case 'DESCRIPTION':
      return a.hasDescription ? 'WITH' : 'WITHOUT';
    case 'LEAD_TIME': {
      const board = facts.boardById.get(a.boardId);
      const days = board ? daysBetween(facts.key(a.createdAt), dateOnlyKey(board.dueDate)) : -1;
      return days < 0 ? 'PAST' : days < 7 ? 'LT_7' : days <= 30 ? 'D7_30' : 'GT_30';
    }
    case 'BOARD_SIZE': {
      const size = facts.boardSize.get(a.boardId) ?? 0;
      return size <= 5 ? 'S_1_5' : size <= 15 ? 'M_6_15' : 'L_16_PLUS';
    }
  }
}

function patterns(facts: Facts, activities: ActivityInput[]): AnalyticsResponseDto['patterns'] {
  return (Object.keys(PATTERN_BUCKETS) as PatternDimension[]).map((dimension) => {
    const groups = new Map<string, ActivityInput[]>(PATTERN_BUCKETS[dimension].map((k) => [k, []]));
    for (const a of activities) groups.get(patternKey(facts, dimension, a))?.push(a);
    const buckets: PatternBucketDto[] = [...groups].map(([key, list]) => {
      const s = groupStats(facts, list);
      return { key, total: s.activities, done: s.done, completionRate: s.completionRate, successRate: s.successRate, onTimeRate: s.onTimeRate };
    });
    return { dimension, buckets };
  });
}

function entityStats(
  facts: Facts,
  entities: Named[],
  projectsOf: (id: string) => Set<string>,
  activities: ActivityInput[],
  meetings: MeetingInput[],
  attachments: Array<{ activity: ActivityInput }>,
): EntityStatsDto[] {
  return entities
    .map((entity) => {
      const projects = projectsOf(entity.id);
      const s = groupStats(facts, activities.filter((a) => projects.has(facts.projectOf(a))));
      return {
        id: entity.id,
        name: entity.name,
        projects: projects.size,
        activities: s.activities,
        done: s.done,
        completionRate: s.completionRate,
        onTimeRate: s.onTimeRate,
        meetings: meetings.filter((m) => m.projectId !== null && projects.has(m.projectId)).length,
        attachments: attachments.filter((t) => projects.has(facts.projectOf(t.activity))).length,
      };
    })
    .sort(byRateThenName);
}

function meetingCounts(meetings: MeetingInput[], userId: string) {
  return {
    meetingsOrganized: meetings.filter((m) => m.organizerId === userId).length,
    meetingsAttended: meetings.filter((m) => m.organizerId !== userId && m.participantIds.includes(userId)).length,
  };
}

function summary(facts: Facts, period: Period): PeriodSummaryDto {
  const created = facts.createdIn(period);
  const completed = facts.completedIn(period);
  return {
    activitiesCreated: created.length,
    completions: completed.length,
    completionRate: groupStats(facts, created).completionRate,
    onTimeRate: onTimeOf(completed.map((a) => facts.onTime(a))).rate,
    meetings: facts.meetingsIn(period).length,
    attachments: facts.attachmentsIn(period).length,
  };
}

function monthly(facts: Facts, period: Period): AnalyticsResponseDto['monthly'] {
  const { input } = facts;
  const todayKey = facts.key(input.now);
  const dates: Date[] = [
    ...input.activities.map((a) => a.createdAt),
    ...input.activities.flatMap((a) => (a.completedAt ? [a.completedAt] : [])),
    ...input.activities.flatMap((a) => a.attachments.map((t) => t.createdAt)),
    ...input.meetings.map((m) => m.startsAt),
  ];
  const keys = dates.map((d) => facts.key(d)).filter((k) => inPeriod(k, period));
  const start = period.from ?? keys.reduce<string | null>((min, k) => (min === null || k < min ? k : min), null);
  if (start === null) return [];
  const end = period.to ?? (keys.reduce((max, k) => (k > max ? k : max), todayKey));
  const months = monthRange(start, end).slice(-MAX_MONTHS);
  const rows = new Map(months.map((month) => [month, { month, activitiesCreated: 0, completions: 0, meetings: 0, attachments: 0 }]));
  const bump = (date: Date, field: 'activitiesCreated' | 'completions' | 'meetings' | 'attachments') => {
    const key = facts.key(date);
    if (inPeriod(key, period)) {
      const row = rows.get(key.slice(0, 7));
      if (row) row[field] += 1;
    }
  };
  for (const a of input.activities) {
    bump(a.createdAt, 'activitiesCreated');
    if (a.progressStatus === 'DONE' && a.completedAt) bump(a.completedAt, 'completions');
    for (const t of a.attachments) bump(t.createdAt, 'attachments');
  }
  for (const m of input.meetings) bump(m.startsAt, 'meetings');
  return [...rows.values()];
}

/** Calcula todas las secciones de `GET /api/analytics` a partir de filas planas. */
export function buildAnalytics(input: AnalyticsInput): AnalyticsResponseDto {
  const facts = new Facts(input);
  const { period, timeZone } = input;
  const todayKey = facts.key(input.now);

  const created = facts.createdIn(period);
  const completed = facts.completedIn(period);
  const attachments = facts.attachmentsIn(period);
  const meetings = facts.meetingsIn(period);
  const stats = groupStats(facts, created);

  // Usuarios
  const platform = input.platformUsers;
  const assigned = new Set(created.flatMap((a) => a.assigneeIds));
  const completing = new Set(created.filter((a) => a.progressStatus === 'DONE').flatMap((a) => a.assigneeIds));
  const byRole = zeroes(ROLE_KEYS);
  for (const u of platform ?? []) for (const r of u.roles) byRole[r] += 1;

  // Actividades
  const byProgress = zeroes(PROGRESS_KEYS);
  const byApproval = zeroes(APPROVAL_KEYS);
  const byResult = { SUCCESS: 0, FAILURE: 0, NONE: 0 };
  for (const a of created) {
    byProgress[a.progressStatus] += 1;
    byApproval[a.approvalStatus] += 1;
    byResult[a.result ?? 'NONE'] += 1;
  }
  const overdueOpen = created.filter((a) => {
    const board = facts.boardById.get(a.boardId);
    return (a.progressStatus === 'PENDING' || a.progressStatus === 'IN_PROGRESS') && board !== undefined && dateOnlyKey(board.dueDate) < todayKey;
  }).length;
  const daysToComplete = completed.map((a) => ((a.completedAt as Date).getTime() - a.createdAt.getTime()) / 86_400_000);

  // Tableros
  const boardsCreated = input.boards.filter((b) => inPeriod(facts.key(b.createdAt), period));
  const boardProgress = zeroes(PROGRESS_KEYS);
  for (const b of boardsCreated) boardProgress[b.progressStatus] += 1;
  const boardOnTime = onTimeOf(
    input.boards
      .filter((b) => b.progressStatus === 'DONE' && b.completedAt !== null && inPeriod(facts.key(b.completedAt), period))
      .map((b) => facts.key(b.completedAt as Date) <= dateOnlyKey(b.dueDate)),
  );

  // Facultades y áreas
  const facultyProjects = new Map<string, Set<string>>();
  const areaProjects = new Map<string, Set<string>>();
  const facultyNames = new Map<string, Named>();
  const areaNames = new Map<string, Named>();
  for (const p of input.projects) {
    for (const f of p.faculties) {
      facultyNames.set(f.id, f);
      if (!facultyProjects.has(f.id)) facultyProjects.set(f.id, new Set());
      facultyProjects.get(f.id)?.add(p.id);
    }
    areaNames.set(p.area.id, p.area);
    if (!areaProjects.has(p.area.id)) areaProjects.set(p.area.id, new Set());
    areaProjects.get(p.area.id)?.add(p.id);
  }
  const empty = new Set<string>();

  // Tutores y decanos
  const tutorBoards = new Map<string, BoardInput[]>();
  for (const b of input.boards) tutorBoards.set(b.responsibleTutorId, [...(tutorBoards.get(b.responsibleTutorId) ?? []), b]);
  const tutors = input.tutors
    .map((tutor) => {
      const boards = tutorBoards.get(tutor.id) ?? [];
      const boardIds = new Set(boards.map((b) => b.id));
      const s = groupStats(facts, created.filter((a) => boardIds.has(a.boardId)));
      return {
        id: tutor.id,
        name: tutor.name,
        projects: new Set(boards.map((b) => b.projectId)).size,
        boards: boards.length,
        activities: s.activities,
        done: s.done,
        completionRate: s.completionRate,
        onTimeRate: s.onTimeRate,
        approvalRate: s.approvalRate,
        ...meetingCounts(meetings, tutor.id),
      };
    })
    .sort(byRateThenName);

  const deans = input.deans
    .map((dean) => {
      const projects = new Set(dean.faculties.flatMap((f) => [...(facultyProjects.get(f.id) ?? empty)]));
      const s = groupStats(facts, created.filter((a) => projects.has(facts.projectOf(a))));
      return {
        id: dean.id,
        name: dean.name,
        faculties: dean.faculties.map((f) => f.name).sort((a, b) => a.localeCompare(b, 'es')),
        projects: projects.size,
        activities: s.activities,
        done: s.done,
        completionRate: s.completionRate,
        onTimeRate: s.onTimeRate,
        ...meetingCounts(meetings, dean.id),
      };
    })
    .sort(byRateThenName);

  // Reuniones
  const meetingStatus = zeroes(MEETING_KEYS);
  for (const m of meetings) meetingStatus[m.status] += 1;
  const held = meetings.filter((m) => m.status !== 'CANCELLED');

  // Adjuntos
  const byKind = { LINK: 0, DOCUMENT: 0 };
  const byFormat = zeroes(FORMAT_KEYS);
  let totalBytes = 0;
  for (const t of attachments) {
    byKind[t.kind] += 1;
    if (t.kind === 'DOCUMENT' && t.format) byFormat[t.format] += 1;
    if (t.kind === 'DOCUMENT' && t.sizeBytes !== null) totalBytes += t.sizeBytes;
  }

  // Días de la semana
  const weekdays = Array.from({ length: 7 }, (_, i) => ({ day: i + 1, completions: 0, attachments: 0, activitiesCreated: 0, meetings: 0 }));
  for (const a of completed) weekdays[isoWeekday(a.completedAt as Date, timeZone) - 1].completions += 1;
  for (const t of attachments) weekdays[isoWeekday(t.createdAt, timeZone) - 1].attachments += 1;
  for (const a of created) weekdays[isoWeekday(a.createdAt, timeZone) - 1].activitiesCreated += 1;
  for (const m of meetings) weekdays[isoWeekday(m.startsAt, timeZone) - 1].meetings += 1;

  // Comparación con el periodo anterior de igual duración
  let comparison: AnalyticsResponseDto['comparison'] = null;
  if (period.from !== null && period.to !== null) {
    const length = daysBetween(period.from, period.to) + 1;
    const previous: Period = { from: addDays(period.from, -length), to: addDays(period.from, -1) };
    comparison = {
      previousPeriod: { from: previous.from as string, to: previous.to as string },
      current: summary(facts, period),
      previous: summary(facts, previous),
    };
  }

  return {
    generatedAt: input.now.toISOString(),
    timeZone,
    period: { from: period.from, to: period.to },
    scope: input.scope,
    users: {
      platform:
        platform === null
          ? null
          : {
              total: platform.length,
              active: platform.filter((u) => u.status === 'ACTIVE').length,
              inactive: platform.filter((u) => u.status === 'INACTIVE').length,
              byRole,
              newInPeriod: platform.filter((u) => inPeriod(facts.key(u.createdAt), period)).length,
            },
      participants: input.participants,
      withAssignedActivities: assigned.size,
      completingActivities: completing.size,
      completionRate: rate(completing.size, assigned.size),
    },
    activities: {
      total: created.length,
      byProgress,
      byResult,
      byApproval,
      completionRate: stats.completionRate,
      approvalRate: stats.approvalRate,
      successRate: stats.successRate,
      onTime: onTimeOf(completed.map((a) => facts.onTime(a))),
      overdueOpen,
      avgDaysToComplete: avg1(daysToComplete.reduce((s, d) => s + d, 0), daysToComplete.length),
    },
    boards: {
      total: boardsCreated.length,
      byProgress: boardProgress,
      overdue: input.boards.filter(
        (b) => (b.progressStatus === 'PENDING' || b.progressStatus === 'IN_PROGRESS') && dateOnlyKey(b.dueDate) < todayKey,
      ).length,
      onTime: boardOnTime,
    },
    patterns: patterns(facts, created),
    faculties: entityStats(facts, [...facultyNames.values()], (id) => facultyProjects.get(id) ?? empty, created, meetings, attachments),
    areas: entityStats(facts, [...areaNames.values()], (id) => areaProjects.get(id) ?? empty, created, meetings, attachments),
    tutors,
    deans,
    meetings: {
      total: meetings.length,
      byStatus: meetingStatus,
      totalMinutes: held.reduce((s, m) => s + m.durationMinutes, 0),
      avgMinutes: avg1(held.reduce((s, m) => s + m.durationMinutes, 0), held.length),
      withRecording: meetings.filter((m) => m.hasRecording).length,
      withProject: meetings.filter((m) => m.projectId !== null).length,
      avgParticipants: avg1(meetings.reduce((s, m) => s + m.participantIds.length, 0), meetings.length),
    },
    attachments: {
      total: attachments.length,
      byKind,
      byFormat,
      totalBytes,
      activitiesWithAttachments: created.filter((a) => a.attachments.length > 0).length,
    },
    weekdays,
    monthly: monthly(facts, period),
    comparison,
  };
}
