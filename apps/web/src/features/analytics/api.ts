import { ApiError, isRecord, parseArray } from '../../lib/api.ts';
import type { ApiRequest } from '../../types/api.ts';

/**
 * Contrato de solo lectura de `docs/api/analytics.md`. El backend hace todos los
 * cálculos; aquí solo se validan las respuestas y se arma el query string.
 */

export const PROJECT_STATUSES = ['ACTIVE', 'FINISHED', 'CANCELLED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const USER_ROLES = ['ADMIN', 'AREA_MANAGER', 'DEAN', 'TUTOR', 'STUDENT'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PROGRESS_STATES = ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type ProgressState = (typeof PROGRESS_STATES)[number];

export const RESULT_STATES = ['SUCCESS', 'FAILURE', 'NONE'] as const;
export type ResultState = (typeof RESULT_STATES)[number];

export const APPROVAL_STATES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const MEETING_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'FINISHED', 'CANCELLED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const ATTACHMENT_KINDS = ['LINK', 'DOCUMENT'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const DOCUMENT_FORMATS = ['PDF', 'WORD', 'EXCEL', 'IMAGE'] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

export const PATTERN_DIMENSIONS = ['ASSIGNEES', 'ATTACHMENTS', 'DESCRIPTION', 'LEAD_TIME', 'BOARD_SIZE'] as const;
export type PatternDimension = (typeof PATTERN_DIMENSIONS)[number];

export interface NamedItem { id: string; name: string }

export interface AnalyticsScope {
  global: boolean;
  areas: NamedItem[];
  faculties: NamedItem[];
}

/** Opciones ya recortadas al alcance del usuario (`GET /api/analytics/filters`). */
export interface AnalyticsFilterOptions {
  scope: AnalyticsScope;
  areas: NamedItem[];
  faculties: NamedItem[];
  projects: NamedItem[];
  tutors: NamedItem[];
}

/** Filtros del usuario; las cadenas vacías se omiten al consultar. */
export interface AnalyticsQuery {
  from?: string | null;
  to?: string | null;
  areaId?: string | null;
  facultyId?: string | null;
  projectId?: string | null;
  tutorId?: string | null;
  projectStatus?: ProjectStatus | '' | null;
}

export interface PlatformUsers {
  total: number;
  active: number;
  inactive: number;
  byRole: Record<UserRole, number>;
  newInPeriod: number;
}

export interface OnTimeStats {
  evaluated: number;
  onTime: number;
  late: number;
  rate: number | null;
}

export interface UsersAnalytics {
  platform: PlatformUsers | null;
  participants: number;
  withAssignedActivities: number;
  completingActivities: number;
  completionRate: number | null;
}

export interface ActivitiesAnalytics {
  total: number;
  byProgress: Record<ProgressState, number>;
  byResult: Record<ResultState, number>;
  byApproval: Record<ApprovalState, number>;
  completionRate: number | null;
  approvalRate: number | null;
  successRate: number | null;
  onTime: OnTimeStats;
  overdueOpen: number;
  avgDaysToComplete: number | null;
}

export interface BoardsAnalytics {
  total: number;
  byProgress: Record<ProgressState, number>;
  overdue: number;
  onTime: OnTimeStats;
}

export interface PatternBucket {
  key: string;
  total: number;
  done: number;
  completionRate: number | null;
  successRate: number | null;
  onTimeRate: number | null;
}

export interface PatternGroup {
  dimension: PatternDimension;
  buckets: PatternBucket[];
}

export interface FacultyAnalytics {
  id: string;
  name: string;
  projects: number;
  activities: number;
  done: number;
  completionRate: number | null;
  onTimeRate: number | null;
  meetings: number;
  attachments: number;
}

export type AreaAnalytics = FacultyAnalytics;

export interface TutorAnalytics {
  id: string;
  name: string;
  projects: number;
  boards: number;
  activities: number;
  done: number;
  completionRate: number | null;
  onTimeRate: number | null;
  approvalRate: number | null;
  meetingsOrganized: number;
  meetingsAttended: number;
}

export interface DeanAnalytics {
  id: string;
  name: string;
  faculties: string[];
  projects: number;
  activities: number;
  done: number;
  completionRate: number | null;
  onTimeRate: number | null;
  meetingsOrganized: number;
  meetingsAttended: number;
}

export interface MeetingsAnalytics {
  total: number;
  byStatus: Record<MeetingStatus, number>;
  totalMinutes: number;
  avgMinutes: number | null;
  withRecording: number;
  withProject: number;
  avgParticipants: number | null;
}

export interface AttachmentsAnalytics {
  total: number;
  byKind: Record<AttachmentKind, number>;
  byFormat: Record<DocumentFormat, number>;
  totalBytes: number;
  activitiesWithAttachments: number;
}

export interface WeekdayAnalytics {
  day: number;
  completions: number;
  attachments: number;
  activitiesCreated: number;
  meetings: number;
}

export interface MonthlyAnalytics {
  month: string;
  activitiesCreated: number;
  completions: number;
  meetings: number;
  attachments: number;
}

export interface ComparisonValues {
  completions: number;
  completionRate: number | null;
  onTimeRate: number | null;
  meetings: number;
  attachments: number;
  activitiesCreated: number;
}

export interface AnalyticsComparison {
  previousPeriod: { from: string; to: string };
  current: ComparisonValues;
  previous: ComparisonValues;
}

export interface AnalyticsPeriod { from: string | null; to: string | null }

export interface AnalyticsData {
  generatedAt: string;
  timeZone: string;
  period: AnalyticsPeriod;
  scope: AnalyticsScope;
  users: UsersAnalytics;
  activities: ActivitiesAnalytics;
  boards: BoardsAnalytics;
  patterns: PatternGroup[];
  faculties: FacultyAnalytics[];
  areas: AreaAnalytics[];
  tutors: TutorAnalytics[];
  deans: DeanAnalytics[];
  meetings: MeetingsAnalytics;
  attachments: AttachmentsAnalytics;
  weekdays: WeekdayAnalytics[];
  monthly: MonthlyAnalytics[];
  comparison: AnalyticsComparison | null;
}

function fail(): never { throw new ApiError(0); }
function record(value: unknown): Record<string, unknown> { if (!isRecord(value)) fail(); return value; }
function str(value: unknown): string { if (typeof value !== 'string') fail(); return value; }
function bool(value: unknown): boolean { if (typeof value !== 'boolean') fail(); return value; }
function textOrNull(value: unknown): string | null { return value === null ? null : str(value); }
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) fail();
  return value;
}
function decimal(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail();
  return value;
}
function decimalOrNull(value: unknown): number | null { return value === null ? null : decimal(value); }
/** Tasa del contrato: entre 0 y 1, o `null` si el denominador es 0. */
function rate(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) fail();
  return value;
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  const text = str(value);
  if (!(allowed as readonly string[]).includes(text)) fail();
  return text as T;
}
function counts<T extends string>(value: unknown, keys: readonly T[]): Record<T, number> {
  const r = record(value);
  const result = {} as Record<T, number>;
  for (const key of keys) result[key] = count(r[key]);
  return result;
}
function named(value: unknown): NamedItem {
  const r = record(value);
  return { id: str(r.id), name: str(r.name) };
}
function scope(value: unknown): AnalyticsScope {
  const r = record(value);
  return {
    global: bool(r.global),
    areas: parseArray(r.areas, named),
    faculties: parseArray(r.faculties, named),
  };
}
function onTime(value: unknown): OnTimeStats {
  const r = record(value);
  return { evaluated: count(r.evaluated), onTime: count(r.onTime), late: count(r.late), rate: rate(r.rate) };
}

export function parseAnalyticsFilterOptions(value: unknown): AnalyticsFilterOptions {
  const r = record(value);
  return {
    scope: scope(r.scope),
    areas: parseArray(r.areas, named),
    faculties: parseArray(r.faculties, named),
    projects: parseArray(r.projects, named),
    tutors: parseArray(r.tutors, named),
  };
}

function platform(value: unknown): PlatformUsers | null {
  if (value === null) return null;
  const r = record(value);
  return {
    total: count(r.total),
    active: count(r.active),
    inactive: count(r.inactive),
    byRole: counts(r.byRole, USER_ROLES),
    newInPeriod: count(r.newInPeriod),
  };
}

function users(value: unknown): UsersAnalytics {
  const r = record(value);
  return {
    platform: platform(r.platform),
    participants: count(r.participants),
    withAssignedActivities: count(r.withAssignedActivities),
    completingActivities: count(r.completingActivities),
    completionRate: rate(r.completionRate),
  };
}

function activities(value: unknown): ActivitiesAnalytics {
  const r = record(value);
  return {
    total: count(r.total),
    byProgress: counts(r.byProgress, PROGRESS_STATES),
    byResult: counts(r.byResult, RESULT_STATES),
    byApproval: counts(r.byApproval, APPROVAL_STATES),
    completionRate: rate(r.completionRate),
    approvalRate: rate(r.approvalRate),
    successRate: rate(r.successRate),
    onTime: onTime(r.onTime),
    overdueOpen: count(r.overdueOpen),
    avgDaysToComplete: decimalOrNull(r.avgDaysToComplete),
  };
}

function boards(value: unknown): BoardsAnalytics {
  const r = record(value);
  return {
    total: count(r.total),
    byProgress: counts(r.byProgress, PROGRESS_STATES),
    overdue: count(r.overdue),
    onTime: onTime(r.onTime),
  };
}

function patternBucket(value: unknown): PatternBucket {
  const r = record(value);
  return {
    key: str(r.key),
    total: count(r.total),
    done: count(r.done),
    completionRate: rate(r.completionRate),
    successRate: rate(r.successRate),
    onTimeRate: rate(r.onTimeRate),
  };
}

function patternGroup(value: unknown): PatternGroup {
  const r = record(value);
  return { dimension: oneOf(r.dimension, PATTERN_DIMENSIONS), buckets: parseArray(r.buckets, patternBucket) };
}

function faculty(value: unknown): FacultyAnalytics {
  const r = record(value);
  return {
    id: str(r.id),
    name: str(r.name),
    projects: count(r.projects),
    activities: count(r.activities),
    done: count(r.done),
    completionRate: rate(r.completionRate),
    onTimeRate: rate(r.onTimeRate),
    meetings: count(r.meetings),
    attachments: count(r.attachments),
  };
}

function tutor(value: unknown): TutorAnalytics {
  const r = record(value);
  return {
    id: str(r.id),
    name: str(r.name),
    projects: count(r.projects),
    boards: count(r.boards),
    activities: count(r.activities),
    done: count(r.done),
    completionRate: rate(r.completionRate),
    onTimeRate: rate(r.onTimeRate),
    approvalRate: rate(r.approvalRate),
    meetingsOrganized: count(r.meetingsOrganized),
    meetingsAttended: count(r.meetingsAttended),
  };
}

function dean(value: unknown): DeanAnalytics {
  const r = record(value);
  return {
    id: str(r.id),
    name: str(r.name),
    faculties: parseArray(r.faculties, str),
    projects: count(r.projects),
    activities: count(r.activities),
    done: count(r.done),
    completionRate: rate(r.completionRate),
    onTimeRate: rate(r.onTimeRate),
    meetingsOrganized: count(r.meetingsOrganized),
    meetingsAttended: count(r.meetingsAttended),
  };
}

function meetings(value: unknown): MeetingsAnalytics {
  const r = record(value);
  return {
    total: count(r.total),
    byStatus: counts(r.byStatus, MEETING_STATUSES),
    totalMinutes: count(r.totalMinutes),
    avgMinutes: decimalOrNull(r.avgMinutes),
    withRecording: count(r.withRecording),
    withProject: count(r.withProject),
    avgParticipants: decimalOrNull(r.avgParticipants),
  };
}

function attachments(value: unknown): AttachmentsAnalytics {
  const r = record(value);
  return {
    total: count(r.total),
    byKind: counts(r.byKind, ATTACHMENT_KINDS),
    byFormat: counts(r.byFormat, DOCUMENT_FORMATS),
    totalBytes: count(r.totalBytes),
    activitiesWithAttachments: count(r.activitiesWithAttachments),
  };
}

function weekday(value: unknown): WeekdayAnalytics {
  const r = record(value);
  const day = count(r.day);
  if (day < 1 || day > 7) fail();
  return {
    day,
    completions: count(r.completions),
    attachments: count(r.attachments),
    activitiesCreated: count(r.activitiesCreated),
    meetings: count(r.meetings),
  };
}

function monthly(value: unknown): MonthlyAnalytics {
  const r = record(value);
  return {
    month: str(r.month),
    activitiesCreated: count(r.activitiesCreated),
    completions: count(r.completions),
    meetings: count(r.meetings),
    attachments: count(r.attachments),
  };
}

function comparisonValues(value: unknown): ComparisonValues {
  const r = record(value);
  return {
    completions: count(r.completions),
    completionRate: rate(r.completionRate),
    onTimeRate: rate(r.onTimeRate),
    meetings: count(r.meetings),
    attachments: count(r.attachments),
    activitiesCreated: count(r.activitiesCreated),
  };
}

function comparison(value: unknown): AnalyticsComparison | null {
  if (value === null) return null;
  const r = record(value);
  const previousPeriod = record(r.previousPeriod);
  return {
    previousPeriod: { from: str(previousPeriod.from), to: str(previousPeriod.to) },
    current: comparisonValues(r.current),
    previous: comparisonValues(r.previous),
  };
}

export function parseAnalytics(value: unknown): AnalyticsData {
  const r = record(value);
  const period = record(r.period);
  return {
    generatedAt: str(r.generatedAt),
    timeZone: str(r.timeZone),
    period: { from: textOrNull(period.from), to: textOrNull(period.to) },
    scope: scope(r.scope),
    users: users(r.users),
    activities: activities(r.activities),
    boards: boards(r.boards),
    patterns: parseArray(r.patterns, patternGroup),
    faculties: parseArray(r.faculties, faculty),
    areas: parseArray(r.areas, faculty),
    tutors: parseArray(r.tutors, tutor),
    deans: parseArray(r.deans, dean),
    meetings: meetings(r.meetings),
    attachments: attachments(r.attachments),
    weekdays: parseArray(r.weekdays, weekday),
    monthly: parseArray(r.monthly, monthly),
    comparison: comparison(r.comparison),
  };
}

const QUERY_KEYS: Array<keyof AnalyticsQuery> = ['from', 'to', 'areaId', 'facultyId', 'projectId', 'tutorId', 'projectStatus'];

/** Arma `/api/analytics?...` omitiendo los filtros vacíos. */
export function analyticsPath(filters: AnalyticsQuery = {}): string {
  const params = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const value = filters[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) params.set(key, trimmed);
  }
  const query = params.toString();
  return query.length > 0 ? `/api/analytics?${query}` : '/api/analytics';
}

export async function getAnalyticsFilters(request: ApiRequest): Promise<AnalyticsFilterOptions> {
  return parseAnalyticsFilterOptions(await request('/api/analytics/filters'));
}

export async function getAnalytics(request: ApiRequest, filters: AnalyticsQuery = {}): Promise<AnalyticsData> {
  return parseAnalytics(await request(analyticsPath(filters)));
}
