import { Logger } from '@nestjs/common';
import type { AiConfig } from '../../../config/ai.config.types';

/**
 * Cliente mínimo de la API Responses de OpenAI (POST /responses) con `fetch` nativo de Node 24,
 * sin SDK (ADR 0018). Pide salida estructurada con un JSON Schema estricto.
 */
export interface StructuredRequest {
  instructions: string;
  input: string;
  schemaName: string;
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

interface ResponsesApiBody {
  status?: string;
  model?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { message?: string } | null;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class OpenAiClient implements AiClient {
  private readonly logger = new Logger(OpenAiClient.name);

  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch) {}

  async structured(config: AiConfig, request: StructuredRequest): Promise<StructuredResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${config.baseUrl}/responses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          instructions: request.instructions,
          input: request.input,
          max_output_tokens: config.maxOutputTokens,
          store: false,
          text: { format: { type: 'json_schema', name: request.schemaName, schema: request.schema, strict: true } },
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new AiClientError('TIMEOUT', 'OpenAI no respondió a tiempo.');
      }
      this.logger.warn(`Fallo de red con OpenAI: ${error instanceof Error ? error.message : String(error)}`);
      throw new AiClientError('UPSTREAM', 'No se pudo conectar con OpenAI.');
    }

    const body = (await response.json().catch(() => null)) as ResponsesApiBody | null;
    if (!response.ok) {
      // Nunca se registra la clave; solo el estado y el mensaje del proveedor.
      this.logger.warn(`OpenAI respondió ${response.status}: ${body?.error?.message ?? 'sin detalle'}`);
      if (response.status === 429) throw new AiClientError('RATE_LIMITED', 'OpenAI rechazó la petición por límite de uso o cuota.');
      throw new AiClientError('UPSTREAM', `OpenAI respondió con estado ${response.status}.`);
    }
    if (body === null) throw new AiClientError('INVALID_OUTPUT', 'La respuesta de OpenAI no es JSON.');
    if (body.status === 'incomplete') {
      throw new AiClientError('INCOMPLETE', `La respuesta de OpenAI quedó incompleta (${body.incomplete_details?.reason ?? 'sin motivo'}).`);
    }

    const content = (body.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []);
    const refusal = content.find((c) => c.type === 'refusal');
    if (refusal) throw new AiClientError('REFUSED', 'El modelo se negó a generar el análisis.');
    const text = content.filter((c) => c.type === 'output_text').map((c) => c.text ?? '').join('');
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiClientError('INVALID_OUTPUT', 'La salida del modelo no es JSON válido.');
    }
    const usage = body.usage ? { inputTokens: body.usage.input_tokens ?? 0, outputTokens: body.usage.output_tokens ?? 0 } : null;
    return { json, model: body.model ?? config.model, usage };
  }
}
