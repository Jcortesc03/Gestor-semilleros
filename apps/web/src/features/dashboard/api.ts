import { ApiError, isRecord, parseArray } from '../../lib/api.ts';
import type { ApiRequest } from '../../types/api.ts';

export const DASHBOARD_ROLES = ['ADMIN', 'AREA_MANAGER', 'DEAN', 'TUTOR', 'STUDENT'] as const;
export type DashboardRole = (typeof DASHBOARD_ROLES)[number];
export const PROJECT_STATUSES = ['ACTIVE', 'FINISHED', 'CANCELLED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROGRESS_STATES = ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type ProgressState = (typeof PROGRESS_STATES)[number];
export type ProjectRole = 'TUTOR' | 'STUDENT' | 'STUDENT_LEADER';

export type StatusCounts = Record<ProjectStatus, number>;
export type ProgressCounts = Record<ProgressState, number>;
export interface NamedItem { id: string; name: string }
export interface DashboardProject {
  id: string;
  title: string;
  status: ProjectStatus;
  projectRole: ProjectRole | null;
  boards: number;
  activities: number;
  activitiesDone: number;
}
export interface DashboardSection {
  role: DashboardRole;
  scope: { areas: NamedItem[]; faculties: NamedItem[] };
  projects: { total: number; byStatus: StatusCounts; items: DashboardProject[] };
  boards: { total: number; byProgress: ProgressCounts; overdue: number };
  activities: { total: number; byProgress: ProgressCounts; pendingApproval: number };
}
export interface DashboardData { generatedAt: string; sections: DashboardSection[] }

export interface DashboardMeeting {
  id: string;
  reason: string;
  startsAt: string;
  status: string;
  joinUrl: string | null;
  project: { id: string; title: string } | null;
}
export interface DashboardAnnouncement {
  id: string;
  kind: string;
  title: string;
  publishedAt: string;
  author: string;
}

function fail(): never { throw new ApiError(0); }
function record(value: unknown): Record<string, unknown> { if (!isRecord(value)) fail(); return value; }
function str(value: unknown): string { if (typeof value !== 'string') fail(); return value; }
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) fail();
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
function parseProject(value: unknown): DashboardProject {
  const r = record(value);
  const role = r.projectRole === null || r.projectRole === undefined ? null : oneOf(r.projectRole, ['TUTOR', 'STUDENT', 'STUDENT_LEADER'] as const);
  return {
    id: str(r.id), title: str(r.title), status: oneOf(r.status, PROJECT_STATUSES), projectRole: role,
    boards: count(r.boards), activities: count(r.activities), activitiesDone: count(r.activitiesDone),
  };
}
function parseSection(value: unknown): DashboardSection {
  const r = record(value);
  const scope = record(r.scope);
  const projects = record(r.projects);
  const boards = record(r.boards);
  const activities = record(r.activities);
  return {
    role: oneOf(r.role, DASHBOARD_ROLES),
    scope: { areas: parseArray(scope.areas, named), faculties: parseArray(scope.faculties, named) },
    projects: { total: count(projects.total), byStatus: counts(projects.byStatus, PROJECT_STATUSES), items: parseArray(projects.items, parseProject) },
    boards: { total: count(boards.total), byProgress: counts(boards.byProgress, PROGRESS_STATES), overdue: count(boards.overdue) },
    activities: { total: count(activities.total), byProgress: counts(activities.byProgress, PROGRESS_STATES), pendingApproval: count(activities.pendingApproval) },
  };
}

export function parseDashboard(value: unknown): DashboardData {
  const r = record(value);
  return { generatedAt: str(r.generatedAt), sections: parseArray(r.sections, parseSection) };
}

function parseMeeting(value: unknown): DashboardMeeting {
  const r = record(value);
  let project: DashboardMeeting['project'] = null;
  if (r.project !== null && r.project !== undefined) {
    const p = record(r.project);
    project = { id: str(p.id), title: str(p.title) };
  }
  return {
    id: str(r.id), reason: str(r.reason), startsAt: str(r.startsAt), status: str(r.status),
    joinUrl: r.joinUrl === null || r.joinUrl === undefined ? null : str(r.joinUrl), project,
  };
}

function parseAnnouncement(value: unknown): DashboardAnnouncement {
  const r = record(value);
  return { id: str(r.id), kind: str(r.kind), title: str(r.title), publishedAt: str(r.publishedAt), author: str(record(r.author).fullName) };
}

export async function getDashboard(request: ApiRequest): Promise<DashboardData> {
  return parseDashboard(await request('/api/dashboard'));
}

/** Próximas reuniones programadas del usuario (máximo 5). */
export async function getUpcomingMeetings(request: ApiRequest, now: Date = new Date()): Promise<DashboardMeeting[]> {
  const params = new URLSearchParams({ status: 'SCHEDULED', from: now.toISOString(), limit: '5' });
  return parseArray(await request(`/api/meetings?${params.toString()}`), parseMeeting).slice(0, 5);
}

/** Novedades más recientes visibles para el usuario (máximo 3). */
export async function getRecentAnnouncements(request: ApiRequest): Promise<DashboardAnnouncement[]> {
  return parseArray(await request('/api/announcements?limit=3'), parseAnnouncement).slice(0, 3);
}
