import { ApiError, isRecord, parseArray } from '../../lib/api.ts';
import type { ApiRequest } from '../../types/api.ts';
import type { NamedItem, ProjectStatus } from '../analytics/api.ts';

/**
 * Contrato del módulo de IA (`GET /api/ai/status`, `POST /api/ai/recommendations`).
 * El backend resume los datos, llama a OpenAI y devuelve el informe; aquí solo se
 * arma el cuerpo (omitiendo lo vacío) y se valida la respuesta de forma defensiva.
 */

export const AI_FOCUSES = [
  'GENERAL', 'ACTIVITIES', 'DEADLINES', 'PARTICIPATION', 'MEETINGS',
  'TUTORS', 'UNITS', 'PATTERNS', 'ATTACHMENTS', 'TRENDS',
] as const;
export type AiFocus = (typeof AI_FOCUSES)[number];

export const AI_DEPTHS = ['BRIEF', 'STANDARD', 'DETAILED'] as const;
export type AiDepth = (typeof AI_DEPTHS)[number];

export const AI_STYLES = ['EXECUTIVE', 'OPERATIONAL', 'ACADEMIC'] as const;
export type AiStyle = (typeof AI_STYLES)[number];

export const AI_PERSPECTIVES = ['ADMIN', 'AREA_MANAGER', 'DEAN'] as const;
export type AiPerspective = (typeof AI_PERSPECTIVES)[number];

export const OVERALL_STATUSES = ['GOOD', 'ATTENTION', 'CRITICAL'] as const;
export type OverallStatus = (typeof OVERALL_STATUSES)[number];

export const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const HORIZONS = ['IMMEDIATE', 'SHORT_TERM', 'MEDIUM_TERM'] as const;
export type Horizon = (typeof HORIZONS)[number];

export interface AiLimits {
  maxFocuses: number;
  minRecommendations: number;
  maxRecommendations: number;
  minRankingSize: number;
  maxRankingSize: number;
  minSample: number;
  maxSample: number;
  questionMaxLength: number;
}

/** Valores del contrato vigente; se usan hasta que `/api/ai/status` responda. */
export const DEFAULT_AI_LIMITS: AiLimits = {
  maxFocuses: 4,
  minRecommendations: 1,
  maxRecommendations: 10,
  minRankingSize: 0,
  maxRankingSize: 10,
  minSample: 1,
  maxSample: 50,
  questionMaxLength: 500,
};

export interface AiStatus {
  configured: boolean;
  model: string | null;
  cacheTtlSeconds: number;
  rateLimitPerHour: number;
  limits: AiLimits;
}

/** Estado del formulario: las cadenas vacías significan «sin valor». */
export interface AiFormState {
  from: string;
  to: string;
  areaId: string;
  facultyId: string;
  projectId: string;
  tutorId: string;
  projectStatus: ProjectStatus | '';
  focuses: AiFocus[];
  depth: AiDepth;
  style: AiStyle;
  perspective: AiPerspective | '';
  maxRecommendations: number;
  rankingSize: number;
  minSample: number;
  includeComparison: boolean;
  includeMonthly: boolean;
  includeWeekdays: boolean;
  anonymize: boolean;
  question: string;
}

export function defaultAiForm(): AiFormState {
  return {
    from: '', to: '', areaId: '', facultyId: '', projectId: '', tutorId: '', projectStatus: '',
    focuses: ['GENERAL'], depth: 'STANDARD', style: 'EXECUTIVE', perspective: '',
    maxRecommendations: 5, rankingSize: 5, minSample: 5,
    includeComparison: true, includeMonthly: true, includeWeekdays: false, anonymize: true,
    question: '',
  };
}

export interface AiReportItem { title: string; detail: string }
export interface AiRisk extends AiReportItem { severity: Priority }
export interface AiRecommendation {
  title: string;
  rationale: string;
  actions: string[];
  priority: Priority;
  focus: AiFocus;
  evidence: string[];
  expectedImpact: string;
  horizon: Horizon;
}
export interface AiReport {
  summary: string;
  overallStatus: OverallStatus;
  highlights: AiReportItem[];
  risks: AiRisk[];
  recommendations: AiRecommendation[];
  answer: string | null;
  dataGaps: string[];
}
export interface AiDigest {
  data: Record<string, unknown>;
  chars: number;
  sourceChars: number;
  approxTokens: number;
  compressionRatio: number | null;
  pseudonyms: number;
}
export interface AiUsage { inputTokens: number; outputTokens: number }
export interface AiScope { global: boolean; areas: NamedItem[]; faculties: NamedItem[] }
export interface AiResult {
  generatedAt: string;
  model: string;
  cached: boolean;
  perspective: string | null;
  period: { from: string | null; to: string | null };
  scope: AiScope;
  digest: AiDigest;
  usage: AiUsage | null;
  report: AiReport;
}

function fail(): never { throw new ApiError(0); }
function record(value: unknown): Record<string, unknown> { if (!isRecord(value)) fail(); return value; }
function str(value: unknown): string { if (typeof value !== 'string') fail(); return value; }
function bool(value: unknown): boolean { if (typeof value !== 'boolean') fail(); return value; }
function textOrNull(value: unknown): string | null { return value === null || value === undefined ? null : str(value); }
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) fail();
  return value;
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  const text = str(value);
  if (!(allowed as readonly string[]).includes(text)) fail();
  return text as T;
}
function named(value: unknown): NamedItem {
  const r = record(value);
  return { id: str(r.id), name: str(r.name) };
}
function strings(value: unknown): string[] { return parseArray(value, str); }
function item(value: unknown): AiReportItem {
  const r = record(value);
  return { title: str(r.title), detail: str(r.detail) };
}

export function parseAiStatus(value: unknown): AiStatus {
  const r = record(value);
  const l = record(r.limits);
  return {
    configured: bool(r.configured),
    model: textOrNull(r.model),
    cacheTtlSeconds: count(r.cacheTtlSeconds),
    rateLimitPerHour: count(r.rateLimitPerHour),
    limits: {
      maxFocuses: count(l.maxFocuses),
      minRecommendations: count(l.minRecommendations),
      maxRecommendations: count(l.maxRecommendations),
      minRankingSize: count(l.minRankingSize),
      maxRankingSize: count(l.maxRankingSize),
      minSample: count(l.minSample),
      maxSample: count(l.maxSample),
      questionMaxLength: count(l.questionMaxLength),
    },
  };
}

function recommendation(value: unknown): AiRecommendation {
  const r = record(value);
  return {
    title: str(r.title),
    rationale: str(r.rationale),
    actions: strings(r.actions),
    priority: oneOf(r.priority, PRIORITIES),
    focus: oneOf(r.focus, AI_FOCUSES),
    evidence: strings(r.evidence),
    expectedImpact: str(r.expectedImpact),
    horizon: oneOf(r.horizon, HORIZONS),
  };
}

function report(value: unknown): AiReport {
  const r = record(value);
  return {
    summary: str(r.summary),
    overallStatus: oneOf(r.overallStatus, OVERALL_STATUSES),
    highlights: parseArray(r.highlights, item),
    risks: parseArray(r.risks, (entry) => {
      const base = item(entry);
      return { ...base, severity: oneOf(record(entry).severity, PRIORITIES) };
    }),
    recommendations: parseArray(r.recommendations, recommendation),
    answer: textOrNull(r.answer),
    dataGaps: strings(r.dataGaps),
  };
}

function digest(value: unknown): AiDigest {
  const r = record(value);
  const ratio = r.compressionRatio;
  if (ratio !== null && (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0)) fail();
  return {
    data: record(r.data),
    chars: count(r.chars),
    sourceChars: count(r.sourceChars),
    approxTokens: count(r.approxTokens),
    compressionRatio: ratio,
    pseudonyms: count(r.pseudonyms),
  };
}

function usage(value: unknown): AiUsage | null {
  if (value === null || value === undefined) return null;
  const r = record(value);
  return { inputTokens: count(r.inputTokens), outputTokens: count(r.outputTokens) };
}

export function parseAiResult(value: unknown): AiResult {
  const r = record(value);
  const period = record(r.period);
  const scope = record(r.scope);
  return {
    generatedAt: str(r.generatedAt),
    model: str(r.model),
    cached: bool(r.cached),
    perspective: textOrNull(r.perspective),
    period: { from: textOrNull(period.from), to: textOrNull(period.to) },
    scope: {
      global: bool(scope.global),
      areas: parseArray(scope.areas, named),
      faculties: parseArray(scope.faculties, named),
    },
    digest: digest(r.digest),
    usage: usage(r.usage),
    report: report(r.report),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Cuerpo de `POST /api/ai/recommendations`: solo campos con valor, sin cadenas vacías. */
export function buildAiBody(
  form: AiFormState,
  refresh = false,
  limits: AiLimits = DEFAULT_AI_LIMITS,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const filters: Array<[string, string]> = [
    ['from', form.from], ['to', form.to], ['areaId', form.areaId], ['facultyId', form.facultyId],
    ['projectId', form.projectId], ['tutorId', form.tutorId], ['projectStatus', form.projectStatus],
  ];
  for (const [key, raw] of filters) {
    const text = raw.trim();
    if (text.length > 0) body[key] = text;
  }
  const focuses = AI_FOCUSES.filter((focus) => form.focuses.includes(focus)).slice(0, limits.maxFocuses);
  body.focuses = focuses.length > 0 ? focuses : ['GENERAL'];
  body.depth = form.depth;
  body.style = form.style;
  if (form.perspective !== '') body.perspective = form.perspective;
  body.maxRecommendations = clamp(form.maxRecommendations, limits.minRecommendations, limits.maxRecommendations);
  body.rankingSize = clamp(form.rankingSize, limits.minRankingSize, limits.maxRankingSize);
  body.minSample = clamp(form.minSample, limits.minSample, limits.maxSample);
  body.includeComparison = form.includeComparison;
  body.includeMonthly = form.includeMonthly;
  body.includeWeekdays = form.includeWeekdays;
  body.anonymize = form.anonymize;
  const question = form.question.trim();
  if (question.length > 0) body.question = question.slice(0, limits.questionMaxLength);
  if (refresh) body.refresh = true;
  return body;
}

export async function getAiStatus(request: ApiRequest): Promise<AiStatus> {
  return parseAiStatus(await request('/api/ai/status'));
}

export async function generateRecommendations(
  request: ApiRequest,
  form: AiFormState,
  options: { refresh?: boolean; limits?: AiLimits } = {},
): Promise<AiResult> {
  const body = buildAiBody(form, options.refresh ?? false, options.limits);
  return parseAiResult(await request('/api/ai/recommendations', { method: 'POST', body }));
}

