import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsWorkspace } from '../../../src/features/analytics';
import { ApiError } from '../../../src/lib/api';
import type { ApiRequest } from '../../../src/types/api';

const filters = {
  scope: { global: true, areas: [], faculties: [] },
  areas: [],
  faculties: [],
  projects: [],
  tutors: [],
};

const zeros = { PENDING: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 };
const onTime = { evaluated: 0, onTime: 0, late: 0, rate: null };

const empty = {
  generatedAt: '2026-11-08T15:00:00.000Z',
  timeZone: 'America/Bogota',
  period: { from: null, to: null },
  scope: { global: true, areas: [], faculties: [] },
  users: { platform: null, participants: 0, withAssignedActivities: 0, completingActivities: 0, completionRate: null },
  activities: {
    total: 0,
    byProgress: zeros,
    byResult: { SUCCESS: 0, FAILURE: 0, NONE: 0 },
    byApproval: { PENDING: 0, APPROVED: 0, REJECTED: 0 },
    completionRate: null,
    approvalRate: null,
    successRate: null,
    onTime,
    overdueOpen: 0,
    avgDaysToComplete: null,
  },
  boards: { total: 0, byProgress: zeros, overdue: 0, onTime },
  patterns: [],
  faculties: [],
  areas: [],
  tutors: [],
  deans: [],
  meetings: {
    total: 0,
    byStatus: { SCHEDULED: 0, IN_PROGRESS: 0, FINISHED: 0, CANCELLED: 0 },
    totalMinutes: 0,
    avgMinutes: null,
    withRecording: 0,
    withProject: 0,
    avgParticipants: null,
  },
  attachments: {
    total: 0,
    byKind: { LINK: 0, DOCUMENT: 0 },
    byFormat: { PDF: 0, WORD: 0, EXCEL: 0, IMAGE: 0 },
    totalBytes: 0,
    activitiesWithAttachments: 0,
  },
  weekdays: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, completions: 0, attachments: 0, activitiesCreated: 0, meetings: 0 })),
  monthly: [],
  comparison: null,
};

function fake(analytics: unknown | Error) {
  return vi.fn<ApiRequest>(async (path) => {
    if (path === '/api/analytics/filters') return filters;
    if (path.startsWith('/api/analytics')) {
      if (analytics instanceof Error) throw analytics;
      return analytics;
    }
    throw new ApiError(404);
  });
}

describe('AnalyticsWorkspace', () => {
  it('muestra un estado vacío explícito cuando no hay datos', async () => {
    render(<AnalyticsWorkspace request={fake(empty)} />);
    expect(await screen.findByText('Sin datos en este periodo')).toBeInTheDocument();
  });

  it('muestra el error de permisos del backend', async () => {
    render(<AnalyticsWorkspace request={fake(new ApiError(403))} />);
    expect(await screen.findByText('No tienes permiso para realizar esta acción.')).toBeInTheDocument();
  });

  it('muestra los KPI y las tasas nulas como «—»', async () => {
    const ready = {
      ...empty,
      activities: { ...empty.activities, total: 3, byProgress: { ...zeros, DONE: 2 }, completionRate: 0.5 },
    };
    render(<AnalyticsWorkspace request={fake(ready)} />);
    expect(await screen.findByText('Tasa de finalización')).toBeInTheDocument();
    expect(screen.getByText('Participantes')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
