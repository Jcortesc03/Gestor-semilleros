import type { ApprovalStatus, DocumentFormat, MeetingStatus, ProgressStatus, Role } from '../../../generated/prisma/enums';

/** Contrato de GET /api/analytics (docs/api/analytics.md). Tasas en [0, 1] con 4 decimales o `null`. */

export interface NamedDto {
  id: string;
  name: string;
}

export interface AnalyticsScopeDto {
  global: boolean;
  areas: NamedDto[];
  faculties: NamedDto[];
}

export interface AnalyticsFiltersDto {
  scope: AnalyticsScopeDto;
  areas: NamedDto[];
  faculties: NamedDto[];
  projects: NamedDto[];
  tutors: NamedDto[];
}

export interface OnTimeDto {
  evaluated: number;
  onTime: number;
  late: number;
  rate: number | null;
}

export type PatternDimension = 'ASSIGNEES' | 'ATTACHMENTS' | 'DESCRIPTION' | 'LEAD_TIME' | 'BOARD_SIZE';

export interface PatternBucketDto {
  key: string;
  total: number;
  done: number;
  completionRate: number | null;
  successRate: number | null;
  onTimeRate: number | null;
}

export interface EntityStatsDto {
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

export interface TutorStatsDto {
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

export interface DeanStatsDto {
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

export interface PeriodSummaryDto {
  completions: number;
  completionRate: number | null;
  onTimeRate: number | null;
  meetings: number;
  attachments: number;
  activitiesCreated: number;
}

export interface AnalyticsResponseDto {
  generatedAt: string;
  timeZone: string;
  period: { from: string | null; to: string | null };
  scope: AnalyticsScopeDto;
  users: {
    platform: {
      total: number;
      active: number;
      inactive: number;
      byRole: Record<Role, number>;
      newInPeriod: number;
    } | null;
    participants: number;
    withAssignedActivities: number;
    completingActivities: number;
    completionRate: number | null;
  };
  activities: {
    total: number;
    byProgress: Record<ProgressStatus, number>;
    byResult: { SUCCESS: number; FAILURE: number; NONE: number };
    byApproval: Record<ApprovalStatus, number>;
    completionRate: number | null;
    approvalRate: number | null;
    successRate: number | null;
    onTime: OnTimeDto;
    overdueOpen: number;
    avgDaysToComplete: number | null;
  };
  boards: { total: number; byProgress: Record<ProgressStatus, number>; overdue: number; onTime: OnTimeDto };
  patterns: Array<{ dimension: PatternDimension; buckets: PatternBucketDto[] }>;
  faculties: EntityStatsDto[];
  areas: EntityStatsDto[];
  tutors: TutorStatsDto[];
  deans: DeanStatsDto[];
  meetings: {
    total: number;
    byStatus: Record<MeetingStatus, number>;
    totalMinutes: number;
    avgMinutes: number | null;
    withRecording: number;
    withProject: number;
    avgParticipants: number | null;
  };
  attachments: {
    total: number;
    byKind: { LINK: number; DOCUMENT: number };
    byFormat: Record<DocumentFormat, number>;
    totalBytes: number;
    activitiesWithAttachments: number;
  };
  weekdays: Array<{ day: number; completions: number; attachments: number; activitiesCreated: number; meetings: number }>;
  monthly: Array<{ month: string; activitiesCreated: number; completions: number; meetings: number; attachments: number }>;
  comparison: {
    previousPeriod: { from: string; to: string };
    current: PeriodSummaryDto;
    previous: PeriodSummaryDto;
  } | null;
}
