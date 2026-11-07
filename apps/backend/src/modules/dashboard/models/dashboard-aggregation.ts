import type { ApprovalStatus, ProgressStatus, ProjectRole, ProjectStatus, Role } from '../../../generated/prisma/enums';

/** Orden fijo de las secciones del panel (P-02). */
export const DASHBOARD_ROLE_ORDER = ['ADMIN', 'AREA_MANAGER', 'DEAN', 'TUTOR', 'STUDENT'] as const;
export type DashboardRole = (typeof DASHBOARD_ROLE_ORDER)[number];

export const MAX_PROJECT_ITEMS = 10;

const PROGRESS_KEYS: ProgressStatus[] = ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
const PROJECT_STATUS_KEYS: ProjectStatus[] = ['ACTIVE', 'FINISHED', 'CANCELLED'];

export type ProgressCounts = Record<ProgressStatus, number>;
export type ProjectStatusCounts = Record<ProjectStatus, number>;

export interface ProjectInput {
  id: string;
  title: string;
  status: ProjectStatus;
  projectRole: ProjectRole | null;
}
export interface BoardInput {
  projectId: string;
  progressStatus: ProgressStatus;
  dueDate: Date;
}
export interface ActivityInput {
  projectId: string;
  progressStatus: ProgressStatus;
  approvalStatus: ApprovalStatus;
}

export interface SectionInput {
  role: DashboardRole;
  areas: Array<{ id: string; name: string }>;
  faculties: Array<{ id: string; name: string }>;
  projects: ProjectInput[];
  boards: BoardInput[];
  activities: ActivityInput[];
  /** Medianoche UTC del día actual; los tableros con `dueDate` anterior están vencidos. */
  today: Date;
}

export interface DashboardSectionData {
  role: DashboardRole;
  scope: { areas: Array<{ id: string; name: string }>; faculties: Array<{ id: string; name: string }> };
  projects: {
    total: number;
    byStatus: ProjectStatusCounts;
    items: Array<ProjectInput & { boards: number; activities: number; activitiesDone: number }>;
  };
  boards: { total: number; byProgress: ProgressCounts; overdue: number };
  activities: { total: number; byProgress: ProgressCounts; pendingApproval: number };
}

/** Roles globales del usuario que tienen sección, en el orden del contrato. */
export function orderedDashboardRoles(roles: readonly Role[]): DashboardRole[] {
  return DASHBOARD_ROLE_ORDER.filter((r) => roles.includes(r));
}

export function emptyProgressCounts(): ProgressCounts {
  return Object.fromEntries(PROGRESS_KEYS.map((k) => [k, 0])) as ProgressCounts;
}

export function emptyProjectStatusCounts(): ProjectStatusCounts {
  return Object.fromEntries(PROJECT_STATUS_KEYS.map((k) => [k, 0])) as ProjectStatusCounts;
}

export function countByProgress(items: ReadonlyArray<{ progressStatus: ProgressStatus }>): ProgressCounts {
  const counts = emptyProgressCounts();
  for (const i of items) counts[i.progressStatus] += 1;
  return counts;
}

/** Medianoche UTC de la fecha dada (las fechas `@db.Date` se leen en UTC). */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isOverdue(board: BoardInput, today: Date): boolean {
  return board.dueDate.getTime() < today.getTime() && board.progressStatus !== 'DONE' && board.progressStatus !== 'CANCELLED';
}

/** `ACTIVE` primero y luego por título. */
export function sortProjects<T extends { title: string; status: ProjectStatus }>(projects: readonly T[]): T[] {
  return [...projects].sort((a, b) => {
    const byStatus = Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE');
    return byStatus !== 0 ? byStatus : a.title.localeCompare(b.title, 'es');
  });
}

export function buildSection(input: SectionInput): DashboardSectionData {
  const { role, projects, boards, activities, today } = input;
  const boardsByProject = new Map<string, number>();
  for (const b of boards) boardsByProject.set(b.projectId, (boardsByProject.get(b.projectId) ?? 0) + 1);
  const activitiesByProject = new Map<string, { total: number; done: number }>();
  for (const a of activities) {
    const entry = activitiesByProject.get(a.projectId) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (a.progressStatus === 'DONE') entry.done += 1;
    activitiesByProject.set(a.projectId, entry);
  }

  const byStatus = emptyProjectStatusCounts();
  for (const p of projects) byStatus[p.status] += 1;

  return {
    role,
    scope: {
      areas: role === 'AREA_MANAGER' ? input.areas : [],
      faculties: role === 'DEAN' ? input.faculties : [],
    },
    projects: {
      total: projects.length,
      byStatus,
      items: sortProjects(projects)
        .slice(0, MAX_PROJECT_ITEMS)
        .map((p) => ({
          ...p,
          boards: boardsByProject.get(p.id) ?? 0,
          activities: activitiesByProject.get(p.id)?.total ?? 0,
          activitiesDone: activitiesByProject.get(p.id)?.done ?? 0,
        })),
    },
    boards: {
      total: boards.length,
      byProgress: countByProgress(boards),
      overdue: boards.filter((b) => isOverdue(b, today)).length,
    },
    activities: {
      total: activities.length,
      byProgress: countByProgress(activities),
      pendingApproval:
        role === 'STUDENT' ? 0 : activities.filter((a) => a.progressStatus === 'DONE' && a.approvalStatus === 'PENDING').length,
    },
  };
}
