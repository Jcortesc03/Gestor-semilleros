import type { AnalyticsResponseDto } from '../../analytics';
import type { AiFocus, AiPerspective, AiRecommendationsRequest } from '../dtos/ai-recommendations-request.dto';

/**
 * Compresión de la analítica (ADR 0018).
 *
 * Convierte la respuesta de GET /api/analytics en un resumen compacto para el modelo:
 * - tasas como porcentajes enteros (0–100) y sin nulos ni conteos en cero;
 * - tablas como `{ cols, rows }` en lugar de arreglos de objetos (menos tokens por fila);
 * - rankings recortados a los mejores y peores N con una muestra mínima;
 * - solo los bloques que piden los enfoques elegidos;
 * - nombres de personas sustituidos por seudónimos (`TUTOR_1`, `DECANO_1`) si se pide anonimizar.
 * Las áreas, facultades y proyectos son datos institucionales y se envían con su nombre.
 */

export interface DigestLabels {
  area: string | null;
  faculty: string | null;
  project: string | null;
  tutor: string | null;
}

export interface DigestResult {
  digest: Record<string, unknown>;
  /** Seudónimo → nombre real; vacío si no se anonimiza. */
  aliases: Map<string, string>;
  /** `false` si no hay hechos que analizar (sin actividades, tableros ni reuniones). */
  hasData: boolean;
}

interface Table {
  cols: string[];
  rows: unknown[][];
  omitted?: number;
}

type SectionKey = 'activities' | 'deadlines' | 'participation' | 'meetings' | 'attachments' | 'patterns' | 'tutors' | 'units' | 'trends';

const SECTIONS_BY_FOCUS: Record<AiFocus, SectionKey[]> = {
  GENERAL: ['activities', 'deadlines', 'participation', 'meetings', 'attachments', 'patterns', 'tutors', 'units', 'trends'],
  ACTIVITIES: ['activities', 'patterns'],
  DEADLINES: ['deadlines', 'patterns'],
  PARTICIPATION: ['participation'],
  MEETINGS: ['meetings'],
  TUTORS: ['tutors'],
  UNITS: ['units'],
  PATTERNS: ['patterns'],
  ATTACHMENTS: ['attachments'],
  TRENDS: ['trends'],
};

const WEEKDAY = ['', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
/** Meses más recientes de la serie mensual que se envían. */
const MAX_MONTHS = 12;

export const pct = (rate: number | null | undefined): number | null => (rate === null || rate === undefined ? null : Math.round(rate * 100));

/**
 * Quita nulos, `undefined`, objetos vacíos y (si `dropZero`) conteos en cero. Los porcentajes
 * (`…Pct`) en 0 se conservan porque son información; una tabla sin filas pierde `cols` y `rows`.
 */
export function prune(value: unknown, dropZero = true): unknown {
  if (Array.isArray(value)) return value;
  if (value === null || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const emptyTable = Array.isArray(source.rows) && source.rows.length === 0;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(source)) {
    if (emptyTable && (key === 'rows' || key === 'cols')) continue;
    const pruned = key === 'rows' || key === 'cols' ? v : prune(v, dropZero);
    if (pruned === null || pruned === undefined) continue;
    if (dropZero && pruned === 0 && !key.endsWith('Pct')) continue;
    if (typeof pruned === 'object' && !Array.isArray(pruned) && Object.keys(pruned).length === 0) continue;
    out[key] = pruned;
  }
  return out;
}

/** Mejores y peores `size` por tasa de finalización entre los que cumplen la muestra mínima. */
export function rankSlice<T extends { activities: number; completionRate: number | null }>(items: T[], size: number, minSample: number): { picked: T[]; omitted: number; belowSample: number } {
  const eligible = items.filter((i) => i.activities >= minSample);
  const sorted = [...eligible].sort((a, b) => (b.completionRate ?? -1) - (a.completionRate ?? -1));
  const belowSample = items.length - eligible.length;
  if (size === 0) return { picked: [], omitted: sorted.length, belowSample };
  if (sorted.length <= size * 2) return { picked: sorted, omitted: 0, belowSample };
  return { picked: [...sorted.slice(0, size), ...sorted.slice(-size)], omitted: sorted.length - size * 2, belowSample };
}

function table(cols: string[], rows: unknown[][], omitted = 0): Table {
  return omitted > 0 ? { cols, rows, omitted } : { cols, rows };
}

export function buildDigest(
  data: AnalyticsResponseDto,
  req: AiRecommendationsRequest,
  perspective: AiPerspective,
  labels: DigestLabels,
): DigestResult {
  const sections = new Set(req.focuses.flatMap((f) => SECTIONS_BY_FOCUS[f]));
  const aliases = new Map<string, string>();
  const aliasFor = new Map<string, string>();
  const personName = (prefix: 'TUTOR' | 'DECANO', id: string, name: string): string => {
    if (!req.anonymize) return name;
    const known = aliasFor.get(`${prefix}:${id}`);
    if (known) return known;
    const alias = `${prefix}_${[...aliasFor.keys()].filter((k) => k.startsWith(`${prefix}:`)).length + 1}`;
    aliasFor.set(`${prefix}:${id}`, alias);
    aliases.set(alias, name);
    return alias;
  };

  const a = data.activities;
  const digest: Record<string, unknown> = {
    context: {
      perspective,
      period: data.period,
      scope: data.scope.global
        ? 'global'
        : { areas: data.scope.areas.map((x) => x.name), faculties: data.scope.faculties.map((x) => x.name) },
      filters: {
        area: labels.area,
        faculty: labels.faculty,
        project: labels.project,
        tutor: labels.tutor && req.filters.tutorId ? personName('TUTOR', req.filters.tutorId, labels.tutor) : null,
        projectStatus: req.filters.projectStatus,
      },
    },
    kpis: {
      activities: a.total,
      completionPct: pct(a.completionRate),
      onTimePct: pct(a.onTime.rate),
      approvalPct: pct(a.approvalRate),
      successPct: pct(a.successRate),
      overdueOpen: a.overdueOpen,
      avgDaysToComplete: a.avgDaysToComplete,
      boards: data.boards.total,
      boardsOverdue: data.boards.overdue,
      participants: data.users.participants,
      meetings: data.meetings.total,
    },
  };

  if (sections.has('activities')) {
    digest.activities = {
      byProgress: a.byProgress,
      byApproval: a.byApproval,
      byResult: a.byResult,
      avgDaysToComplete: a.avgDaysToComplete,
    };
  }

  if (sections.has('deadlines')) {
    digest.deadlines = {
      activities: { evaluated: a.onTime.evaluated, onTime: a.onTime.onTime, late: a.onTime.late, onTimePct: pct(a.onTime.rate), overdueOpen: a.overdueOpen },
      boards: { byProgress: data.boards.byProgress, overdue: data.boards.overdue, evaluated: data.boards.onTime.evaluated, late: data.boards.onTime.late, onTimePct: pct(data.boards.onTime.rate) },
    };
  }

  if (sections.has('participation')) {
    const u = data.users;
    digest.participation = {
      platform: u.platform ? { total: u.platform.total, active: u.platform.active, inactive: u.platform.inactive, byRole: u.platform.byRole, newInPeriod: u.platform.newInPeriod } : null,
      participants: u.participants,
      withAssignedActivities: u.withAssignedActivities,
      completingActivities: u.completingActivities,
      assigneeCompletionPct: pct(u.completionRate),
      participantsWithoutActivities: Math.max(0, u.participants - u.withAssignedActivities),
    };
  }

  if (sections.has('meetings')) {
    const m = data.meetings;
    digest.meetings = {
      byStatus: m.byStatus,
      totalMinutes: m.totalMinutes,
      avgMinutes: m.avgMinutes,
      withRecordingPct: m.total > 0 ? Math.round((m.withRecording / m.total) * 100) : null,
      withoutProject: m.total - m.withProject,
      avgParticipants: m.avgParticipants,
    };
  }

  if (sections.has('attachments')) {
    const t = data.attachments;
    digest.attachments = {
      total: t.total,
      byKind: t.byKind,
      byFormat: t.byFormat,
      totalMB: Math.round(t.totalBytes / 1_048_576),
      activitiesWithAttachmentsPct: a.total > 0 ? Math.round((t.activitiesWithAttachments / a.total) * 100) : null,
    };
  }

  if (sections.has('patterns')) {
    const patterns: Record<string, Table> = {};
    for (const p of data.patterns) {
      const rows = p.buckets.filter((b) => b.total > 0).map((b) => [b.key, b.total, pct(b.completionRate), pct(b.successRate), pct(b.onTimeRate)]);
      if (rows.length > 0) patterns[p.dimension] = table(['bucket', 'activities', 'completionPct', 'successPct', 'onTimePct'], rows);
    }
    digest.patterns = patterns;
  }

  if (sections.has('units') && req.rankingSize > 0) {
    const unitCols = ['name', 'projects', 'activities', 'completionPct', 'onTimePct', 'meetings', 'attachments'];
    const unitRows = (items: AnalyticsResponseDto['areas']) => {
      const r = rankSlice(items, req.rankingSize, req.minSample);
      return { ...table(unitCols, r.picked.map((x) => [x.name, x.projects, x.activities, pct(x.completionRate), pct(x.onTimeRate), x.meetings, x.attachments]), r.omitted), belowSample: r.belowSample };
    };
    const deans = rankSlice(data.deans, req.rankingSize, req.minSample);
    digest.units = {
      areas: unitRows(data.areas),
      faculties: unitRows(data.faculties),
      deans: {
        ...table(
          ['dean', 'faculties', 'projects', 'activities', 'completionPct', 'onTimePct', 'meetingsOrganized', 'meetingsAttended'],
          deans.picked.map((d) => [personName('DECANO', d.id, d.name), d.faculties.join(' / '), d.projects, d.activities, pct(d.completionRate), pct(d.onTimeRate), d.meetingsOrganized, d.meetingsAttended]),
          deans.omitted,
        ),
        belowSample: deans.belowSample,
      },
    };
  }

  if (sections.has('tutors') && req.rankingSize > 0) {
    const r = rankSlice(data.tutors, req.rankingSize, req.minSample);
    const rates = data.tutors.map((t) => t.completionRate).filter((x): x is number => x !== null).sort((x, y) => x - y);
    digest.tutors = {
      ...table(
        ['tutor', 'projects', 'boards', 'activities', 'completionPct', 'onTimePct', 'approvalPct', 'meetingsOrganized', 'meetingsAttended'],
        r.picked.map((t) => [personName('TUTOR', t.id, t.name), t.projects, t.boards, t.activities, pct(t.completionRate), pct(t.onTimeRate), pct(t.approvalRate), t.meetingsOrganized, t.meetingsAttended]),
        r.omitted,
      ),
      totalTutors: data.tutors.length,
      belowSample: r.belowSample,
      medianCompletionPct: rates.length > 0 ? pct(rates[Math.floor(rates.length / 2)]) : null,
    };
  }

  const trends = sections.has('trends');
  if ((trends || req.includeComparison) && data.comparison) {
    const c = data.comparison;
    const row = (s: typeof c.current) => [s.activitiesCreated, s.completions, pct(s.completionRate), pct(s.onTimeRate), s.meetings, s.attachments];
    digest.comparison = {
      previousPeriod: c.previousPeriod,
      ...table(['period', 'created', 'completions', 'completionPct', 'onTimePct', 'meetings', 'attachments'], [['current', ...row(c.current)], ['previous', ...row(c.previous)]]),
    };
  }
  if ((trends || req.includeMonthly) && data.monthly.length > 0) {
    const months = data.monthly.slice(-MAX_MONTHS);
    digest.monthly = table(['month', 'created', 'completions', 'meetings', 'attachments'], months.map((m) => [m.month, m.activitiesCreated, m.completions, m.meetings, m.attachments]), data.monthly.length - months.length);
  }
  if (req.includeWeekdays) {
    digest.weekdays = table(['day', 'created', 'completions', 'meetings', 'attachments'], data.weekdays.map((w) => [WEEKDAY[w.day] ?? String(w.day), w.activitiesCreated, w.completions, w.meetings, w.attachments]));
  }

  const hasData = a.total > 0 || data.boards.total > 0 || data.meetings.total > 0 || a.onTime.evaluated > 0;
  return { digest: prune(digest) as Record<string, unknown>, aliases, hasData };
}

/** Reemplaza los seudónimos (`TUTOR_3`, `DECANO_1`) por los nombres reales en un texto. */
export function restoreAliases(text: string, aliases: Map<string, string>): string {
  if (aliases.size === 0) return text;
  return text.replace(/\b(?:TUTOR|DECANO)_\d+\b/g, (alias) => aliases.get(alias) ?? alias);
}
