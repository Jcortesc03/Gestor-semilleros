/**
 * Lectura de las variables de entorno de Claude (ADR 0018).
 * Sin ANTHROPIC_API_KEY la IA queda "no configurada" (503 en sus rutas).
 */
import { EnvValidationError } from './env';
import type { AiConfig, AiEffort } from './ai.config.types';

export const DEFAULT_AI_MODEL = 'claude-sonnet-5-5';
const EFFORTS: readonly AiEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

function optional(source: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = source[key]?.trim();
  return value ? value : undefined;
}

function intInRange(source: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = optional(source, key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new EnvValidationError(`${key} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

function bool(source: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = optional(source, key)?.toLowerCase();
  if (raw === undefined) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new EnvValidationError(`${key} debe ser true o false.`);
}

export function loadAiConfig(source: NodeJS.ProcessEnv): AiConfig | null {
  const baseUrl = optional(source, 'ANTHROPIC_BASE_URL') ?? null;
  if (baseUrl !== null) {
    try {
      const protocol = new URL(baseUrl).protocol;
      if (protocol !== 'http:' && protocol !== 'https:') throw new Error('protocolo');
    } catch {
      throw new EnvValidationError('ANTHROPIC_BASE_URL debe ser una URL http(s) válida.');
    }
  }
  const effort = (optional(source, 'ANTHROPIC_EFFORT') ?? 'high') as AiEffort;
  if (!EFFORTS.includes(effort)) throw new EnvValidationError(`ANTHROPIC_EFFORT debe ser uno de: ${EFFORTS.join(', ')}.`);

  const config = {
    model: optional(source, 'ANTHROPIC_MODEL') ?? DEFAULT_AI_MODEL,
    baseUrl: baseUrl?.replace(/\/+$/, '') ?? null,
    timeoutMs: intInRange(source, 'ANTHROPIC_TIMEOUT_MS', 120_000, 5_000, 300_000),
    maxRetries: intInRange(source, 'ANTHROPIC_MAX_RETRIES', 1, 0, 3),
    maxTokens: intInRange(source, 'ANTHROPIC_MAX_TOKENS', 16_000, 1_000, 32_000),
    effort,
    refusalFallback: bool(source, 'ANTHROPIC_REFUSAL_FALLBACK', true),
    cacheTtlSeconds: intInRange(source, 'AI_CACHE_TTL_SECONDS', 600, 0, 86_400),
    rateLimitPerHour: intInRange(source, 'AI_RATE_LIMIT_PER_HOUR', 20, 1, 1_000),
  };
  const apiKey = optional(source, 'ANTHROPIC_API_KEY');
  return apiKey ? { apiKey, ...config } : null;
}
