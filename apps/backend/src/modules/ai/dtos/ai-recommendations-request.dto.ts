import type { Role } from '../../../generated/prisma/enums';
import { asObject, fail, ok, type ValidationResult } from '../../../common/utils/validation';
import { parseAnalyticsQuery, type AnalyticsQuery } from '../../analytics';

/** Enfoques que el usuario puede pedir; deciden qué bloques del resumen se envían a la IA. */
export const AI_FOCUSES = ['GENERAL', 'ACTIVITIES', 'DEADLINES', 'PARTICIPATION', 'MEETINGS', 'TUTORS', 'UNITS', 'PATTERNS', 'ATTACHMENTS', 'TRENDS'] as const;
export type AiFocus = (typeof AI_FOCUSES)[number];

export const AI_DEPTHS = ['BRIEF', 'STANDARD', 'DETAILED'] as const;
export type AiDepth = (typeof AI_DEPTHS)[number];

export const AI_STYLES = ['EXECUTIVE', 'OPERATIONAL', 'ACADEMIC'] as const;
export type AiStyle = (typeof AI_STYLES)[number];

export const AI_ROLES = ['ADMIN', 'AREA_MANAGER', 'DEAN'] as const satisfies readonly Role[];
export type AiPerspective = (typeof AI_ROLES)[number];

export const AI_LIMITS = {
  maxFocuses: 4,
  minRecommendations: 1,
  maxRecommendations: 10,
  minRankingSize: 0,
  maxRankingSize: 10,
  minSample: 1,
  maxSample: 50,
  questionMaxLength: 500,
} as const;

/** Petición validada de POST /api/ai/recommendations (docs/api/ai.md). */
export interface AiRecommendationsRequest {
  filters: AnalyticsQuery;
  focuses: AiFocus[];
  depth: AiDepth;
  style: AiStyle;
  /** Rol desde el que se redactan las recomendaciones; `null` = el de mayor alcance del usuario. */
  perspective: AiPerspective | null;
  maxRecommendations: number;
  /** Mejores y peores N de cada ranking (0 = no enviar rankings). */
  rankingSize: number;
  /** Mínimo de actividades para que una unidad o tutor entre a los rankings. */
  minSample: number;
  includeComparison: boolean;
  includeMonthly: boolean;
  includeWeekdays: boolean;
  /** Sustituye nombres de personas por seudónimos antes de enviarlos a OpenAI. */
  anonymize: boolean;
  question: string | null;
  /** Ignora la caché y genera un análisis nuevo. */
  refresh: boolean;
}

const FILTER_FIELDS = ['from', 'to', 'areaId', 'facultyId', 'projectId', 'tutorId', 'projectStatus'] as const;
const OWN_FIELDS = [
  'focuses', 'depth', 'style', 'perspective', 'maxRecommendations', 'rankingSize', 'minSample',
  'includeComparison', 'includeMonthly', 'includeWeekdays', 'anonymize', 'question', 'refresh',
] as const;

export const AI_DEFAULTS = {
  focuses: ['GENERAL'] as AiFocus[],
  depth: 'STANDARD' as AiDepth,
  style: 'EXECUTIVE' as AiStyle,
  maxRecommendations: 5,
  rankingSize: 5,
  minSample: 5,
  includeComparison: true,
  includeMonthly: true,
  includeWeekdays: false,
  anonymize: true,
};

function oneOf<T extends string>(value: unknown, values: readonly T[]): T | null {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseAiRecommendationsRequest(input: unknown): ValidationResult<AiRecommendationsRequest> {
  const body = asObject(input ?? {});
  if (body === null) return fail(['El cuerpo de la petición debe ser un objeto JSON.']);

  const errors: string[] = [];
  const extra = Object.keys(body).filter((k) => !(FILTER_FIELDS as readonly string[]).includes(k) && !(OWN_FIELDS as readonly string[]).includes(k));
  if (extra.length > 0) errors.push(`Campos no permitidos: ${extra.join(', ')}.`);

  // Los filtros de la analítica se validan con su propio parser (mismas reglas y mensajes).
  const filterInput: Record<string, unknown> = {};
  for (const key of FILTER_FIELDS) {
    const value = body[key];
    if (value !== undefined && value !== null && value !== '') filterInput[key] = value;
  }
  const filters = parseAnalyticsQuery(filterInput);
  if (!filters.ok) errors.push(...filters.errors);

  let focuses = AI_DEFAULTS.focuses;
  if (body.focuses !== undefined) {
    const raw = body.focuses;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > AI_LIMITS.maxFocuses) {
      errors.push(`focuses debe ser una lista de 1 a ${AI_LIMITS.maxFocuses} enfoques.`);
    } else {
      const parsed = raw.map((f) => oneOf(f, AI_FOCUSES));
      if (parsed.some((f) => f === null)) errors.push(`Cada enfoque debe ser uno de: ${AI_FOCUSES.join(', ')}.`);
      else focuses = [...new Set(parsed as AiFocus[])];
    }
  }

  const pick = <T extends string>(key: string, values: readonly T[], fallback: T): T => {
    if (body[key] === undefined) return fallback;
    const value = oneOf(body[key], values);
    if (value === null) errors.push(`${key} debe ser uno de: ${values.join(', ')}.`);
    return value ?? fallback;
  };
  const depth = pick('depth', AI_DEPTHS, AI_DEFAULTS.depth);
  const style = pick('style', AI_STYLES, AI_DEFAULTS.style);

  let perspective: AiPerspective | null = null;
  if (body.perspective !== undefined && body.perspective !== null) {
    perspective = oneOf(body.perspective, AI_ROLES);
    if (perspective === null) errors.push(`perspective debe ser uno de: ${AI_ROLES.join(', ')}.`);
  }

  const int = (key: string, min: number, max: number, fallback: number): number => {
    const value = body[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      errors.push(`${key} debe ser un entero entre ${min} y ${max}.`);
      return fallback;
    }
    return value;
  };
  const maxRecommendations = int('maxRecommendations', AI_LIMITS.minRecommendations, AI_LIMITS.maxRecommendations, AI_DEFAULTS.maxRecommendations);
  const rankingSize = int('rankingSize', AI_LIMITS.minRankingSize, AI_LIMITS.maxRankingSize, AI_DEFAULTS.rankingSize);
  const minSample = int('minSample', AI_LIMITS.minSample, AI_LIMITS.maxSample, AI_DEFAULTS.minSample);

  const bool = (key: string, fallback: boolean): boolean => {
    const value = body[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') {
      errors.push(`${key} debe ser true o false.`);
      return fallback;
    }
    return value;
  };

  let question: string | null = null;
  if (body.question !== undefined && body.question !== null) {
    if (typeof body.question !== 'string') errors.push('question debe ser texto.');
    else {
      const text = body.question.replace(/\s+/g, ' ').trim();
      if (text.length > AI_LIMITS.questionMaxLength) errors.push(`question no puede superar ${AI_LIMITS.questionMaxLength} caracteres.`);
      else if (text.length > 0) question = text;
    }
  }

  const value: AiRecommendationsRequest = {
    filters: filters.ok ? filters.value : (null as unknown as AnalyticsQuery),
    focuses,
    depth,
    style,
    perspective,
    maxRecommendations,
    rankingSize,
    minSample,
    includeComparison: bool('includeComparison', AI_DEFAULTS.includeComparison),
    includeMonthly: bool('includeMonthly', AI_DEFAULTS.includeMonthly),
    includeWeekdays: bool('includeWeekdays', AI_DEFAULTS.includeWeekdays),
    anonymize: bool('anonymize', AI_DEFAULTS.anonymize),
    question,
    refresh: bool('refresh', false),
  };
  return errors.length > 0 ? fail(errors) : ok(value);
}
