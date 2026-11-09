import { Logger } from '@nestjs/common';
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  OverloadedError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import type { AiConfig } from '../../../config/ai.config.types';

/**
 * Cliente de la API de Claude (Messages API) con el SDK oficial `@anthropic-ai/sdk` (ADR 0018).
 * Pide salida estructurada (`output_config.format` con JSON Schema) y razonamiento adaptativo.
 */
export interface StructuredRequest {
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
}

export interface StructuredResponse {
  json: unknown;
  model: string;
  usage: { inputTokens: number; outputTokens: number } | null;
}

export type AiClientErrorKind = 'TIMEOUT' | 'RATE_LIMITED' | 'UPSTREAM' | 'REFUSED' | 'INCOMPLETE' | 'INVALID_OUTPUT';

export class AiClientError extends Error {
  constructor(readonly kind: AiClientErrorKind, message: string) {
    super(message);
  }
}

/** Punto de inyección para sustituir el cliente en pruebas. */
export const AI_CLIENT = Symbol('AI_CLIENT');

export interface AiClient {
  structured(config: AiConfig, request: StructuredRequest): Promise<StructuredResponse>;
}

/**
 * Modelos que admiten el reintento en el servidor ante un rechazo (`fallbacks: "default"`,
 * beta `server-side-fallback-2026-07-01`, solo en la API de Anthropic).
 */
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export class ClaudeClient implements AiClient {
  private readonly logger = new Logger(ClaudeClient.name);
  private sdk: Anthropic | null = null;
  private sdkKey = '';

  /** `fetchImpl` permite inyectar un `fetch` falso en pruebas. */
  constructor(private readonly fetchImpl?: typeof fetch) {}

  async structured(config: AiConfig, request: StructuredRequest): Promise<StructuredResponse> {
    const fallback = config.refusalFallback && config.baseUrl === null && FALLBACK_MODELS.has(config.model);
    let message;
    try {
      message = await this.client(config).beta.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        thinking: { type: 'adaptive' },
        output_config: { effort: config.effort, format: { type: 'json_schema', schema: request.schema } },
        system: request.instructions,
        messages: [{ role: 'user', content: request.input }],
        ...(fallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
      });
    } catch (error) {
      throw this.translate(error);
    }

    if (message.stop_reason === 'refusal') {
      this.logger.warn(`Claude rechazó el análisis (categoría: ${message.stop_details?.category ?? 'sin categoría'}).`);
      throw new AiClientError('REFUSED', 'Claude se negó a generar el análisis.');
    }
    if (message.stop_reason === 'max_tokens' || message.stop_reason === 'model_context_window_exceeded') {
      throw new AiClientError('INCOMPLETE', `La respuesta de Claude quedó incompleta (${message.stop_reason}).`);
    }

    // Con razonamiento adaptativo llegan bloques `thinking`; la salida estructurada va en los bloques `text`.
    const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiClientError('INVALID_OUTPUT', 'La salida de Claude no es JSON válido.');
    }
    return {
      json,
      model: message.model,
      usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    };
  }

  /** Reutiliza el cliente del SDK mientras no cambie la configuración. */
  private client(config: AiConfig): Anthropic {
    const key = JSON.stringify([config.apiKey, config.baseUrl, config.timeoutMs, config.maxRetries]);
    if (this.sdk === null || this.sdkKey !== key) {
      this.sdk = new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        timeout: config.timeoutMs,
        maxRetries: config.maxRetries,
        ...(this.fetchImpl ? { fetch: this.fetchImpl } : {}),
      });
      this.sdkKey = key;
    }
    return this.sdk;
  }

  /** Errores tipados del SDK, del más específico al más general. Nunca se registra la clave. */
  private translate(error: unknown): AiClientError {
    if (error instanceof APIConnectionTimeoutError) return new AiClientError('TIMEOUT', 'Claude no respondió a tiempo.');
    if (error instanceof APIConnectionError) {
      this.logger.warn(`Fallo de red con la API de Claude: ${error.message}`);
      return new AiClientError('UPSTREAM', 'No se pudo conectar con la API de Claude.');
    }
    if (error instanceof RateLimitError || error instanceof OverloadedError) {
      return new AiClientError('RATE_LIMITED', 'La API de Claude está limitando las peticiones o está saturada.');
    }
    if (error instanceof APIError) {
      this.logger.warn(`La API de Claude respondió ${error.status}: ${error.message}`);
      return new AiClientError('UPSTREAM', `La API de Claude respondió con estado ${error.status}.`);
    }
    return new AiClientError('UPSTREAM', 'No se pudo completar la petición a la API de Claude.');
  }
}
