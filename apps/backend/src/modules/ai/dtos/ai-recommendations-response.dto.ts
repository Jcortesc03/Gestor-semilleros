import type { AnalyticsScopeDto } from '../../analytics';
import type { AiReport } from '../models/ai-prompt';
import type { AI_LIMITS, AiDepth, AiFocus, AiPerspective, AiStyle } from './ai-recommendations-request.dto';

/** Contrato de GET /api/ai/status (docs/api/ai.md). */
export interface AiStatusDto {
  configured: boolean;
  model: string | null;
  cacheTtlSeconds: number;
  rateLimitPerHour: number;
  limits: typeof AI_LIMITS;
}

/** Contrato de POST /api/ai/recommendations (docs/api/ai.md). */
export interface AiRecommendationsResponseDto {
  generatedAt: string;
  model: string;
  /** `true` si se sirvió desde la caché (no consumió tokens ni cuota). */
  cached: boolean;
  perspective: AiPerspective;
  period: { from: string | null; to: string | null };
  scope: AnalyticsScopeDto;
  request: {
    focuses: AiFocus[];
    depth: AiDepth;
    style: AiStyle;
    maxRecommendations: number;
    rankingSize: number;
    minSample: number;
    includeComparison: boolean;
    includeMonthly: boolean;
    includeWeekdays: boolean;
    anonymize: boolean;
    question: string | null;
  };
  /** Resumen comprimido tal como se envió a OpenAI (con seudónimos si se anonimizó). */
  digest: {
    data: Record<string, unknown>;
    chars: number;
    sourceChars: number;
    approxTokens: number;
    compressionRatio: number | null;
    pseudonyms: number;
  };
  usage: { inputTokens: number; outputTokens: number } | null;
  report: AiReport;
}
