import {
  buildSection,
  countByProgress,
  isOverdue,
  orderedDashboardRoles,
  sortProjects,
  startOfUtcDay,
  type SectionInput,
} from './dashboard-aggregation';

const today = new Date('2026-11-07T00:00:00.000Z');

const base = (over: Partial<SectionInput> = {}): SectionInput => ({
  role: 'TUTOR',
  areas: [{ id: 'a1', name: 'Área' }],
  faculties: [{ id: 'f1', name: 'Facultad' }],
  projects: [],
  boards: [],
  activities: [],
  today,
  ...over,
});

describe('orderedDashboardRoles', () => {
  it('ordena según el contrato e ignora roles sin sección', () => {
    expect(orderedDashboardRoles(['STUDENT', 'DEAN', 'ADMIN', 'TUTOR'])).toEqual(['ADMIN', 'DEAN', 'TUTOR', 'STUDENT']);
    expect(orderedDashboardRoles([])).toEqual([]);
  });
});

describe('countByProgress', () => {
  it('incluye las cuatro claves aunque valgan 0', () => {
    expect(countByProgress([])).toEqual({ PENDING: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 });
    expect(countByProgress([{ progressStatus: 'DONE' }, { progressStatus: 'DONE' }])).toMatchObject({ DONE: 2, PENDING: 0 });
  });
});

describe('isOverdue', () => {
  const b = (d: string, progressStatus: 'PENDING' | 'DONE' | 'CANCELLED' | 'IN_PROGRESS') => ({
    projectId: 'p',
    dueDate: new Date(d),
    progressStatus,
  });
  it('vence solo si la fecha es anterior a hoy y no está terminado ni cancelado', () => {
    expect(isOverdue(b('2026-11-06', 'PENDING'), today)).toBe(true);
    expect(isOverdue(b('2026-11-06', 'IN_PROGRESS'), today)).toBe(true);
    expect(isOverdue(b('2026-11-07', 'PENDING'), today)).toBe(false);
    expect(isOverdue(b('2026-11-06', 'DONE'), today)).toBe(false);
    expect(isOverdue(b('2026-11-06', 'CANCELLED'), today)).toBe(false);
  });
});

describe('startOfUtcDay', () => {
  it('trunca a medianoche UTC', () => {
    expect(startOfUtcDay(new Date('2026-11-07T15:30:00.000Z')).toISOString()).toBe('2026-11-07T00:00:00.000Z');
  });
});

describe('sortProjects', () => {
  it('pone ACTIVE primero y luego ordena por título', () => {
    const sorted = sortProjects([
      { title: 'B', status: 'FINISHED' as const },
      { title: 'Z', status: 'ACTIVE' as const },
      { title: 'A', status: 'CANCELLED' as const },
      { title: 'C', status: 'ACTIVE' as const },
    ]);
    expect(sorted.map((p) => p.title)).toEqual(['C', 'Z', 'A', 'B']);
  });
});

describe('buildSection', () => {
  it('con datos vacíos devuelve todas las claves en cero', () => {
    const s = buildSection(base());
    expect(s.projects).toEqual({ total: 0, byStatus: { ACTIVE: 0, FINISHED: 0, CANCELLED: 0 }, items: [] });
    expect(s.boards).toEqual({ total: 0, byProgress: { PENDING: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 }, overdue: 0 });
    expect(s.activities.pendingApproval).toBe(0);
  });

  it('llena scope.areas solo en AREA_MANAGER y scope.faculties solo en DEAN', () => {
    expect(buildSection(base({ role: 'AREA_MANAGER' })).scope).toEqual({ areas: [{ id: 'a1', name: 'Área' }], faculties: [] });
    expect(buildSection(base({ role: 'DEAN' })).scope).toEqual({ areas: [], faculties: [{ id: 'f1', name: 'Facultad' }] });
    expect(buildSection(base({ role: 'ADMIN' })).scope).toEqual({ areas: [], faculties: [] });
  });

  it('agrega por proyecto, cuenta vencidos y pendientes de aprobación', () => {
    const s = buildSection(
      base({
        projects: [{ id: 'p1', title: 'P1', status: 'ACTIVE', projectRole: 'TUTOR' }],
        boards: [
          { projectId: 'p1', progressStatus: 'PENDING', dueDate: new Date('2026-11-01') },
          { projectId: 'p1', progressStatus: 'DONE', dueDate: new Date('2026-11-01') },
        ],
        activities: [
          { projectId: 'p1', progressStatus: 'DONE', approvalStatus: 'PENDING' },
          { projectId: 'p1', progressStatus: 'DONE', approvalStatus: 'APPROVED' },
          { projectId: 'p1', progressStatus: 'PENDING', approvalStatus: 'PENDING' },
        ],
      }),
    );
    expect(s.projects.items[0]).toEqual({
      id: 'p1', title: 'P1', status: 'ACTIVE', projectRole: 'TUTOR', boards: 2, activities: 3, activitiesDone: 2,
    });
    expect(s.boards.overdue).toBe(1);
    expect(s.activities).toMatchObject({ total: 3, pendingApproval: 1 });
  });

  it('en STUDENT pendingApproval es siempre 0', () => {
    const s = buildSection(
      base({ role: 'STUDENT', activities: [{ projectId: 'p1', progressStatus: 'DONE', approvalStatus: 'PENDING' }] }),
    );
    expect(s.activities.pendingApproval).toBe(0);
  });

  it('limita los items a 10 pero total cuenta todos', () => {
    const projects = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`, title: `Proyecto ${String(i).padStart(2, '0')}`, status: 'ACTIVE' as const, projectRole: null,
    }));
    const s = buildSection(base({ role: 'ADMIN', projects }));
    expect(s.projects.total).toBe(12);
    expect(s.projects.items).toHaveLength(10);
  });
});
