import {
  BadGatewayException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { APP_ENV, type AppEnv } from '../../../config/env';
import type { AiConfig } from '../../../config/ai.config.types';
import type { AuthUser } from '../../auth';
import { AnalyticsService } from '../../analytics';
import { AI_LIMITS, AI_ROLES, type AiPerspective, type AiRecommendationsRequest } from '../dtos/ai-recommendations-request.dto';
import type { AiRecommendationsResponseDto, AiStatusDto } from '../dtos/ai-recommendations-response.dto';
import { buildInput, buildInstructions, reportJsonSchema, type AiReport } from '../models/ai-prompt';
import { buildDigest, restoreAliases, type DigestLabels } from '../models/analytics-digest';
import { AI_CLIENT, AiClientError, type AiClient } from './claude.client';

const NOT_CONFIGURED = 'La IA no está configurada en el servidor (ANTHROPIC_API_KEY).';
const MAX_CACHE_ENTRIES = 200;
const HOUR_MS = 3_600_000;

interface CacheEntry {
  expiresAt: number;
  value: AiRecommendationsResponseDto;
}

/** Recorre el informe y reemplaza los seudónimos en todos los textos. */
function restoreDeep<T>(value: T, aliases: Map<string, string>): T {
  if (aliases.size === 0) return value;
  if (typeof value === 'string') return restoreAliases(value, aliases) as T;
  if (Array.isArray(value)) return value.map((v) => restoreDeep(v, aliases)) as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, restoreDeep(v, aliases)])) as T;
  }
  return value;
}

function isReport(value: unknown): value is AiReport {
  const r = value as AiReport | null;
  return (
    typeof r === 'object' && r !== null && typeof r.summary === 'string' &&
    Array.isArray(r.highlights) && Array.isArray(r.risks) && Array.isArray(r.recommendations) && Array.isArray(r.dataGaps)
  );
}

@Injectable()
export class AiService {
  private readonly config: AiConfig | null;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly calls = new Map<string, number[]>();

  constructor(
    private readonly analytics: AnalyticsService,
    @Inject(AI_CLIENT) private readonly client: AiClient,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.config = env.ai;
  }

  status(): AiStatusDto {
    return {
      configured: this.config !== null,
      model: this.config?.model ?? null,
      cacheTtlSeconds: this.config?.cacheTtlSeconds ?? 0,
      rateLimitPerHour: this.config?.rateLimitPerHour ?? 0,
      limits: AI_LIMITS,
    };
  }

  async recommend(user: AuthUser, req: AiRecommendationsRequest, now: Date = new Date()): Promise<AiRecommendationsResponseDto> {
    const config = this.config;
    if (config === null) throw new ServiceUnavailableException(NOT_CONFIGURED);
    const perspective = this.perspective(user, req.perspective);

    // Valida alcance y filtros (403/404) y calcula los indicadores con la misma lógica de la analítica.
    const data = await this.analytics.get(user, req.filters, now);

    const key = this.cacheKey(user.id, perspective, req);
    const cached = this.cache.get(key);
    if (!req.refresh && cached && cached.expiresAt > now.getTime()) return { ...cached.value, cached: true };

    const labels = await this.labels(user, req, now);
    const { digest, aliases, hasData } = buildDigest(data, req, perspective, labels);
    if (!hasData) {
      throw new UnprocessableEntityException('No hay actividades, tableros ni reuniones con los filtros elegidos; amplía el periodo o quita filtros.');
    }

    this.consumeQuota(user.id, config, now.getTime());

    const input = buildInput(digest, req.question);
    let result;
    try {
      result = await this.client.structured(config, {
        instructions: buildInstructions(req, perspective),
        input,
        schema: reportJsonSchema(req.focuses),
      });
    } catch (error) {
      // Si Claude no llegó a generar nada (red, 5xx, 429) no se cobraron tokens: se devuelve la cuota.
      if (error instanceof AiClientError && (error.kind === 'UPSTREAM' || error.kind === 'RATE_LIMITED')) this.refundQuota(user.id);
      throw this.translate(error);
    }
    if (!isReport(result.json)) throw new BadGatewayException('La respuesta de la IA no tiene el formato esperado.');

    const report = restoreDeep(result.json, aliases);
    report.recommendations = report.recommendations.slice(0, req.maxRecommendations);
    if (!req.question) report.answer = null;

    const digestChars = JSON.stringify(digest).length;
    const sourceChars = JSON.stringify(data).length;
    const value: AiRecommendationsResponseDto = {
      generatedAt: now.toISOString(),
      model: result.model,
      cached: false,
      perspective,
      period: data.period,
      scope: data.scope,
      request: {
        focuses: req.focuses,
        depth: req.depth,
        style: req.style,
        maxRecommendations: req.maxRecommendations,
        rankingSize: req.rankingSize,
        minSample: req.minSample,
        includeComparison: req.includeComparison,
        includeMonthly: req.includeMonthly,
        includeWeekdays: req.includeWeekdays,
        anonymize: req.anonymize,
        question: req.question,
      },
      digest: {
        data: digest,
        chars: digestChars,
        sourceChars,
        approxTokens: Math.ceil(input.length / 4),
        compressionRatio: sourceChars > 0 ? Math.round((digestChars / sourceChars) * 100) / 100 : null,
        pseudonyms: aliases.size,
      },
      usage: result.usage,
      report,
    };
    this.store(key, value, config, now.getTime());
    return value;
  }

  // ─── Internos ───

  /** La perspectiva pedida debe ser un rol del usuario; por defecto, el de mayor alcance. */
  private perspective(user: AuthUser, requested: AiPerspective | null): AiPerspective {
    if (requested !== null) {
      if (!user.roles.includes(requested)) throw new ForbiddenException('Solo puedes pedir recomendaciones desde un rol que tengas.');
      return requested;
    }
    const own = AI_ROLES.find((r) => user.roles.includes(r));
    if (!own) throw new ForbiddenException('No tienes un rol con acceso a la IA.');
    return own;
  }

  /** Nombres de los filtros aplicados (ya validados por la analítica). */
  private async labels(user: AuthUser, req: AiRecommendationsRequest, now: Date): Promise<DigestLabels> {
    const f = req.filters;
    const none: DigestLabels = { area: null, faculty: null, project: null, tutor: null };
    if (!f.areaId && !f.facultyId && !f.projectId && !f.tutorId) return none;
    const options = await this.analytics.filters(user, now);
    const name = (list: Array<{ id: string; name: string }>, id: string | null) => (id ? list.find((i) => i.id === id)?.name ?? null : null);
    return {
      area: name(options.areas, f.areaId),
      faculty: name(options.faculties, f.facultyId),
      project: name(options.projects, f.projectId),
      tutor: f.tutorId ? name(options.tutors, f.tutorId) ?? 'Tutor filtrado' : null,
    };
  }

  private cacheKey(userId: string, perspective: AiPerspective, req: AiRecommendationsRequest): string {
    const { refresh: _refresh, ...rest } = req;
    return createHash('sha256').update(JSON.stringify([userId, perspective, rest])).digest('hex');
  }

  private store(key: string, value: AiRecommendationsResponseDto, config: AiConfig, now: number): void {
    if (config.cacheTtlSeconds === 0) return;
    for (const [k, entry] of this.cache) if (entry.expiresAt <= now) this.cache.delete(k);
    while (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, { value, expiresAt: now + config.cacheTtlSeconds * 1000 });
  }

  /** Límite de análisis nuevos por usuario en la última hora (en memoria, por instancia). */
  private consumeQuota(userId: string, config: AiConfig, now: number): void {
    const recent = (this.calls.get(userId) ?? []).filter((t) => t > now - HOUR_MS);
    if (recent.length >= config.rateLimitPerHour) {
      const retryMinutes = Math.ceil((recent[0] + HOUR_MS - now) / 60_000);
      throw new HttpException(
        `Alcanzaste el límite de ${config.rateLimitPerHour} análisis por hora. Intenta de nuevo en ${retryMinutes} min.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.calls.set(userId, recent);
  }

  private refundQuota(userId: string): void {
    this.calls.get(userId)?.pop();
  }

  private translate(error: unknown): Error {
    if (!(error instanceof AiClientError)) return new BadGatewayException('No se pudo completar el análisis con la IA.');
    switch (error.kind) {
      case 'TIMEOUT':
        return new GatewayTimeoutException('La IA tardó demasiado en responder. Prueba con menos enfoques o menor profundidad.');
      case 'RATE_LIMITED':
        return new ServiceUnavailableException('El proveedor de IA está limitando las peticiones o no hay cuota disponible. Intenta más tarde.');
      case 'INCOMPLETE':
        return new BadGatewayException('La respuesta de la IA quedó incompleta. Prueba con menor profundidad o menos recomendaciones.');
      case 'REFUSED':
        return new BadGatewayException('La IA no generó el análisis para esta consulta.');
      default:
        return new BadGatewayException('No se pudo completar el análisis con la IA.');
    }
  }
}
