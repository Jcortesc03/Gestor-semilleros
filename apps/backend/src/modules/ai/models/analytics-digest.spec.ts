import type { AnalyticsResponseDto } from '../../analytics';
import { parseAiRecommendationsRequest, type AiRecommendationsRequest } from '../dtos/ai-recommendations-request.dto';
import { buildDigest, pct, prune, rankSlice, restoreAliases } from './analytics-digest';

type TutorStatsDto = AnalyticsResponseDto['tutors'][number];

const TUTOR_ID = '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b';

/** Petición válida construida con el parser real del módulo de IA. */
function request(over: Record<string, unknown> = {}): AiRecommendationsRequest {
  const result = parseAiRecommendationsRequest(over);
  if (!result.ok) throw new Error(`Petición de prueba inválida: ${result.errors.join(' | ')}`);
  return result.value;
}

const tutor = (id: string, name: string, completionRate: number | null, activities = 10): TutorStatsDto => ({
  id,
  name,
  projects: 1,
  boards: 2,
  activities,
  done: Math.round(activities * (completionRate ?? 0)),
  completionRate,
  onTimeRate: 0.5,
  approvalRate: 0.6,
  meetingsOrganized: 1,
  meetingsAttended: 2,
});

/** Respuesta de la analítica con datos en todas las secciones (forma de GET /api/analytics). */
function sampleData(over: Partial<AnalyticsResponseDto> = {}): AnalyticsResponseDto {
  const period = { completions: 4, completionRate: 0.8, onTimeRate: 0.75, meetings: 3, attachments: 2, activitiesCreated: 6 };
  return {
    generatedAt: '2026-11-08T15:00:00.000Z',
    timeZone: 'America/Bogota',
    period: { from: '2026-01-01', to: '2026-10-31' },
    scope: { global: true, areas: [], faculties: [] },
    users: {
      platform: {
        total: 10,
        active: 8,
        inactive: 2,
        byRole: { ADMIN: 1, AREA_MANAGER: 1, DEAN: 1, TUTOR: 2, STUDENT: 5 },
        newInPeriod: 3,
      },
      participants: 6,
      withAssignedActivities: 5,
      completingActivities: 4,
      completionRate: 0.8,
    },
    activities: {
      total: 20,
      byProgress: { PENDING: 5, IN_PROGRESS: 5, DONE: 8, CANCELLED: 2 },
      byResult: { SUCCESS: 6, FAILURE: 2, NONE: 12 },
      byApproval: { PENDING: 3, APPROVED: 4, REJECTED: 1 },
      completionRate: 0.8,
      approvalRate: 0.5,
      successRate: 0.75,
      onTime: { evaluated: 8, onTime: 6, late: 2, rate: 0.75 },
      overdueOpen: 3,
      avgDaysToComplete: 4.5,
    },
    boards: {
      total: 4,
      byProgress: { PENDING: 1, IN_PROGRESS: 2, DONE: 1, CANCELLED: 0 },
      overdue: 1,
      onTime: { evaluated: 3, onTime: 2, late: 1, rate: 0.6667 },
    },
    patterns: [
      {
        dimension: 'ASSIGNEES',
        buckets: [
          { key: '1', total: 10, done: 5, completionRate: 0.5, successRate: 0.6, onTimeRate: 0.5 },
          { key: '2', total: 0, done: 0, completionRate: null, successRate: null, onTimeRate: null },
        ],
      },
    ],
    faculties: [{ id: 'f1', name: 'Ingeniería', projects: 2, activities: 10, done: 8, completionRate: 0.8, onTimeRate: 0.75, meetings: 2, attachments: 3 }],
    areas: [{ id: 'ar1', name: 'Área Tecnológica', projects: 2, activities: 10, done: 8, completionRate: 0.8, onTimeRate: 0.75, meetings: 2, attachments: 3 }],
    tutors: [tutor(TUTOR_ID, 'Ana Tutora', 0.9), tutor('t2', 'Luis Tutor', 0.5)],
    deans: [
      {
        id: 'd1',
        name: 'Decana Rosa',
        faculties: ['Ingeniería'],
        projects: 2,
        activities: 10,
        done: 8,
        completionRate: 0.8,
        onTimeRate: 0.75,
        meetingsOrganized: 1,
        meetingsAttended: 2,
      },
    ],
    meetings: {
      total: 5,
      byStatus: { SCHEDULED: 1, IN_PROGRESS: 0, FINISHED: 3, CANCELLED: 1 },
      totalMinutes: 300,
      avgMinutes: 60,
      withRecording: 2,
      withProject: 4,
      avgParticipants: 3.5,
    },
    attachments: {
      total: 7,
      byKind: { LINK: 4, DOCUMENT: 3 },
      byFormat: { PDF: 2, WORD: 1, EXCEL: 0, IMAGE: 0 },
      totalBytes: 5_242_880,
      activitiesWithAttachments: 6,
    },
    weekdays: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, completions: day, attachments: 0, activitiesCreated: 1, meetings: 0 })),
    monthly: [
      { month: '2026-09', activitiesCreated: 6, completions: 3, meetings: 2, attachments: 1 },
      { month: '2026-10', activitiesCreated: 8, completions: 4, meetings: 3, attachments: 2 },
    ],
    comparison: {
      previousPeriod: { from: '2025-11-01', to: '2025-12-31' },
      current: period,
      previous: { completions: 2, completionRate: 0.5, onTimeRate: 0.5, meetings: 1, attachments: 0, activitiesCreated: 4 },
    },
    ...over,
  };
}

const NO_LABELS = { area: null, faculty: null, project: null, tutor: null };

describe('buildDigest', () => {
  it('con el enfoque GENERAL incluye KPI y todos los bloques con datos', () => {
    const { digest, hasData } = buildDigest(sampleData(), request({ focuses: ['GENERAL'] }), 'ADMIN', NO_LABELS);

    expect(hasData).toBe(true);
    expect(digest).toEqual(
      expect.objectContaining({
        context: expect.any(Object),
        kpis: expect.objectContaining({ activities: 20, completionPct: 80, onTimePct: 75, boards: 4, meetings: 5 }),
        activities: expect.any(Object),
        deadlines: expect.any(Object),
        participation: expect.any(Object),
        meetings: expect.any(Object),
        attachments: expect.any(Object),
        patterns: expect.any(Object),
        units: expect.any(Object),
        tutors: expect.any(Object),
        comparison: expect.any(Object),
        monthly: expect.any(Object),
      }),
    );
    // Los días de la semana solo se envían si se piden.
    expect(digest).not.toHaveProperty('weekdays');
  });

  it('con el enfoque MEETINGS solo envía context, kpis y meetings', () => {
    const { digest } = buildDigest(
      sampleData(),
      request({ focuses: ['MEETINGS'], includeComparison: false, includeMonthly: false }),
      'ADMIN',
      NO_LABELS,
    );

    expect(Object.keys(digest).sort()).toEqual(['context', 'kpis', 'meetings']);
    expect(digest).not.toHaveProperty('tutors');
    expect(digest).not.toHaveProperty('units');
    expect(digest).not.toHaveProperty('patterns');
  });

  it('con MEETINGS incluye comparison y monthly solo si se piden y hay datos', () => {
    const withBlocks = buildDigest(sampleData(), request({ focuses: ['MEETINGS'], includeComparison: true, includeMonthly: true }), 'ADMIN', NO_LABELS).digest;
    expect(withBlocks).toHaveProperty('comparison');
    expect(withBlocks).toHaveProperty('monthly');

    const withoutData = buildDigest(
      sampleData({ comparison: null, monthly: [] }),
      request({ focuses: ['MEETINGS'], includeComparison: true, includeMonthly: true }),
      'ADMIN',
      NO_LABELS,
    ).digest;
    expect(withoutData).not.toHaveProperty('comparison');
    expect(withoutData).not.toHaveProperty('monthly');
  });

  it('con includeWeekdays envía los días de la semana con su abreviatura', () => {
    const { digest } = buildDigest(sampleData(), request({ includeWeekdays: true }), 'ADMIN', NO_LABELS);
    const weekdays = digest.weekdays as { cols: string[]; rows: unknown[][] };
    expect(weekdays.cols[0]).toBe('day');
    expect(weekdays.rows[0][0]).toBe('lun');
    expect(weekdays.rows[6][0]).toBe('dom');
  });

  describe('anonimización', () => {
    it('sustituye tutores y decanos por seudónimos y devuelve el mapa de alias', () => {
      const { digest, aliases } = buildDigest(sampleData(), request({ focuses: ['GENERAL'], anonymize: true }), 'ADMIN', NO_LABELS);

      expect(aliases.get('DECANO_1')).toBe('Decana Rosa');
      expect(aliases.get('TUTOR_1')).toBe('Ana Tutora');
      expect(aliases.get('TUTOR_2')).toBe('Luis Tutor');
      expect(JSON.stringify(digest)).toContain('TUTOR_1');
      expect(JSON.stringify(digest)).toContain('DECANO_1');
    });

    it('el nombre real de una persona no aparece en el digest', () => {
      const { digest } = buildDigest(sampleData(), request({ focuses: ['GENERAL'], anonymize: true }), 'ADMIN', NO_LABELS);
      const json = JSON.stringify(digest);

      expect(json).not.toContain('Ana Tutora');
      expect(json).not.toContain('Luis Tutor');
      expect(json).not.toContain('Decana Rosa');
    });

    it('usa el mismo seudónimo para el filtro de tutor y para su fila en el ranking', () => {
      const { digest, aliases } = buildDigest(
        sampleData(),
        request({ focuses: ['TUTORS'], anonymize: true, tutorId: TUTOR_ID }),
        'ADMIN',
        { ...NO_LABELS, tutor: 'Ana Tutora' },
      );
      const context = digest.context as { filters: { tutor: string } };
      const tutors = digest.tutors as { rows: unknown[][] };

      expect(context.filters.tutor).toBe('TUTOR_1');
      expect(tutors.rows[0][0]).toBe('TUTOR_1');
      expect(aliases.size).toBe(2);
    });

    it('con anonymize=false deja los nombres reales y no devuelve alias', () => {
      const { digest, aliases } = buildDigest(sampleData(), request({ focuses: ['GENERAL'], anonymize: false }), 'ADMIN', NO_LABELS);
      const json = JSON.stringify(digest);

      expect(aliases.size).toBe(0);
      expect(json).toContain('Ana Tutora');
      expect(json).toContain('Decana Rosa');
    });
  });

  it('hasData es false sin actividades, tableros, reuniones ni evaluadas', () => {
    const empty = sampleData({
      activities: { ...sampleData().activities, total: 0, onTime: { evaluated: 0, onTime: 0, late: 0, rate: null } },
      boards: { ...sampleData().boards, total: 0 },
      meetings: { ...sampleData().meetings, total: 0 },
    });

    expect(buildDigest(empty, request(), 'ADMIN', NO_LABELS).hasData).toBe(false);
  });

  it('hasData es true si solo hay tableros', () => {
    const onlyBoards = sampleData({
      activities: { ...sampleData().activities, total: 0, onTime: { evaluated: 0, onTime: 0, late: 0, rate: null } },
      meetings: { ...sampleData().meetings, total: 0 },
    });

    expect(buildDigest(onlyBoards, request(), 'ADMIN', NO_LABELS).hasData).toBe(true);
  });

  it('con muchos tutores y rankingSize 3 envía 6 filas y el digest es mucho más pequeño que el origen', () => {
    const tutors = Array.from({ length: 40 }, (_, i) => tutor(`t${i}`, `Tutor Número ${i}`, (i + 1) / 41, 10));
    const data = sampleData({ tutors });
    const { digest } = buildDigest(data, request({ focuses: ['TUTORS'], rankingSize: 3, minSample: 1 }), 'ADMIN', NO_LABELS);
    const section = digest.tutors as { rows: unknown[][]; omitted: number; totalTutors: number };

    expect(section.rows).toHaveLength(6);
    expect(section.omitted).toBe(34);
    expect(section.totalTutors).toBe(40);
    expect(JSON.stringify(digest).length).toBeLessThan(JSON.stringify(data).length / 2);
  });
});

describe('rankSlice', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ name: `U${i + 1}`, activities: 10, completionRate: (i + 1) / 10 }));

  it('devuelve los mejores y peores N con las omitidas', () => {
    const { picked, omitted, belowSample } = rankSlice(items, 3, 5);

    expect(picked.map((i) => i.name)).toEqual(['U10', 'U9', 'U8', 'U3', 'U2', 'U1']);
    expect(omitted).toBe(4);
    expect(belowSample).toBe(0);
  });

  it('excluye las unidades por debajo de la muestra mínima y las cuenta en belowSample', () => {
    const mixed = [...items, { name: 'Pequeña', activities: 2, completionRate: 1 }];
    const { picked, belowSample } = rankSlice(mixed, 3, 5);

    expect(picked.map((i) => i.name)).not.toContain('Pequeña');
    expect(belowSample).toBe(1);
  });

  it('si hay pocas unidades devuelve todas sin omitidas', () => {
    const { picked, omitted } = rankSlice(items.slice(0, 4), 3, 1);

    expect(picked).toHaveLength(4);
    expect(omitted).toBe(0);
  });

  it('con size 0 no devuelve filas y cuenta todas como omitidas', () => {
    const result = rankSlice(items, 0, 5);

    expect(result).toEqual({ picked: [], omitted: 10, belowSample: 0 });
  });

  it('con lista vacía y size 0 devuelve todo vacío', () => {
    expect(rankSlice([], 0, 1)).toEqual({ picked: [], omitted: 0, belowSample: 0 });
  });

  it('ordena las tasas nulas al final', () => {
    const withNull = [
      { name: 'Nula', activities: 10, completionRate: null },
      { name: 'Alta', activities: 10, completionRate: 0.9 },
    ];

    expect(rankSlice(withNull, 5, 1).picked.map((i) => i.name)).toEqual(['Alta', 'Nula']);
  });
});

describe('prune', () => {
  it('quita nulos, undefined, ceros y objetos vacíos', () => {
    const input = {
      keep: 1,
      zero: 0,
      nil: null,
      undef: undefined,
      empty: {},
      nested: { zero: 0, value: 2, onlyNull: { x: null } },
    };

    expect(prune(input)).toEqual({ keep: 1, nested: { value: 2 } });
  });

  it('conserva cols y rows de una tabla con filas', () => {
    const input = { table: { cols: ['a', 'b'], rows: [[0, null]] } };

    expect(prune(input)).toEqual({ table: { cols: ['a', 'b'], rows: [[0, null]] } });
  });

  it('una tabla sin filas pierde cols y rows', () => {
    expect(prune({ emptyRows: { cols: ['a'], rows: [] } })).toEqual({});
  });

  it('conserva los porcentajes (…Pct) en cero', () => {
    expect(prune({ completionPct: 0, activities: 0 })).toEqual({ completionPct: 0 });
  });

  it('con dropZero=false conserva los ceros', () => {
    expect(prune({ zero: 0, nil: null }, false)).toEqual({ zero: 0 });
  });

  it('no modifica los arreglos', () => {
    expect(prune({ list: [0, null, {}] })).toEqual({ list: [0, null, {}] });
  });
});

describe('pct', () => {
  it('convierte tasas en porcentajes enteros', () => {
    expect(pct(0.5)).toBe(50);
    expect(pct(0.3333)).toBe(33);
    expect(pct(0.6667)).toBe(67);
    expect(pct(0)).toBe(0);
    expect(pct(1)).toBe(100);
  });

  it('devuelve null sin dato', () => {
    expect(pct(null)).toBeNull();
    expect(pct(undefined)).toBeNull();
  });
});

describe('restoreAliases', () => {
  it('reemplaza TUTOR_1 por el nombre real', () => {
    const aliases = new Map([['TUTOR_1', 'Ana Tutora']]);
    expect(restoreAliases('TUTOR_1 acompañó el proyecto', aliases)).toBe('Ana Tutora acompañó el proyecto');
  });

  it('no reemplaza TUTOR_10 si no está en el mapa', () => {
    const aliases = new Map([['TUTOR_1', 'Ana Tutora']]);
    expect(restoreAliases('TUTOR_10 y TUTOR_1', aliases)).toBe('TUTOR_10 y Ana Tutora');
  });

  it('reemplaza TUTOR_10 si está en el mapa', () => {
    const aliases = new Map([['TUTOR_10', 'Mario Tutor']]);
    expect(restoreAliases('Revisar a TUTOR_10.', aliases)).toBe('Revisar a Mario Tutor.');
  });

  it('reemplaza DECANO_n y deja el texto intacto sin alias', () => {
    const aliases = new Map([['DECANO_2', 'Carlos Decano']]);
    expect(restoreAliases('DECANO_2 aprobó', aliases)).toBe('Carlos Decano aprobó');
    expect(restoreAliases('TUTOR_1 aprobó', new Map())).toBe('TUTOR_1 aprobó');
  });
});
