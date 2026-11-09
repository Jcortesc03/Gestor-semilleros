/**
 * Lectura de las variables de entorno de OpenAI (ADR 0018).
 * Sin OPENAI_API_KEY u OPENAI_MODEL la IA queda "no configurada" (503 en sus rutas).
 */
import { EnvValidationError } from './env';
import type { AiConfig } from './ai.config.types';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

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

export function loadAiConfig(source: NodeJS.ProcessEnv): AiConfig | null {
  const baseUrl = optional(source, 'OPENAI_BASE_URL') ?? DEFAULT_BASE_URL;
  try {
    const protocol = new URL(baseUrl).protocol;
    if (protocol !== 'http:' && protocol !== 'https:') throw new Error('protocolo');
  } catch {
    throw new EnvValidationError('OPENAI_BASE_URL debe ser una URL http(s) válida.');
  }
  const timeoutMs = intInRange(source, 'OPENAI_TIMEOUT_MS', 90_000, 5_000, 300_000);
  const maxOutputTokens = intInRange(source, 'OPENAI_MAX_OUTPUT_TOKENS', 4_000, 500, 32_000);
  const cacheTtlSeconds = intInRange(source, 'AI_CACHE_TTL_SECONDS', 600, 0, 86_400);
  const rateLimitPerHour = intInRange(source, 'AI_RATE_LIMIT_PER_HOUR', 20, 1, 1_000);

  const apiKey = optional(source, 'OPENAI_API_KEY');
  const model = optional(source, 'OPENAI_MODEL');
  if (!apiKey || !model) return null;
  return { apiKey, model, baseUrl: baseUrl.replace(/\/+$/, ''), timeoutMs, maxOutputTokens, cacheTtlSeconds, rateLimitPerHour };
}
