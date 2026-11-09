import { Logger } from '@nestjs/common';
import type { AiConfig } from '../../../config/ai.config.types';
import { AiClientError, ClaudeClient } from './claude.client';

const CONFIG: AiConfig = {
  apiKey: 'sk-ant-prueba',
  model: 'claude-sonnet-5-5',
  baseUrl: null,
  timeoutMs: 5_000,
  maxRetries: 0,
  maxTokens: 16_000,
  effort: 'high',
  refusalFallback: true,
  cacheTtlSeconds: 600,
  rateLimitPerHour: 20,
};

const REQUEST = { instructions: 'Instrucciones', input: 'Resumen', schema: { type: 'object', additionalProperties: false, required: [], properties: {} } };

function message(over: Record<string, unknown> = {}) {
  return {
    id: 'msg_prueba',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [
      { type: 'thinking', thinking: '', signature: 'firma' },
      { type: 'text', text: '{"summary":' },
      { type: 'text', text: '"ok"}' },
    ],
    stop_reason: 'end_turn',
    stop_details: null,
    usage: { input_tokens: 120, output_tokens: 80 },
    ...over,
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fakeFetch(response: () => Response | Promise<Response>) {
  return jest.fn(async (_url: string | URL | Request, _init?: RequestInit) => response());
}

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AiClientError) return error.kind;
    throw error;
  }
  throw new Error('No falló');
}

describe('ClaudeClient', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('envía la petición de mensajes con salida estructurada, razonamiento adaptativo y la clave', async () => {
    const fetch = fakeFetch(() => json(200, message()));
    await new ClaudeClient(fetch as unknown as typeof globalThis.fetch).structured(CONFIG, REQUEST);

    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages(\?|$)/);
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer sk-ant-prueba');
    expect(headers.get('anthropic-beta')).toBe('server-side-fallback-2026-07-01');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: 16_000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: REQUEST.schema } },
      system: 'Instrucciones',
      messages: [{ role: 'user', content: 'Resumen' }],
      fallbacks: 'default',
    });
  });

  it.each([
    ['otro modelo', { model: 'claude-haiku-5-5' }],
    ['URL propia', { baseUrl: 'http://proxy.local' }],
    ['desactivado', { refusalFallback: false }],
  ])('no pide el reintento ante rechazos con %s', async (_caso, over) => {
    const fetch = fakeFetch(() => json(200, message()));
    await new ClaudeClient(fetch as unknown as typeof globalThis.fetch).structured({ ...CONFIG, ...over }, REQUEST);
    const [, init] = fetch.mock.calls[0];
    expect(new Headers(init?.headers).get('anthropic-beta')).toBeNull();
    expect(JSON.parse(String(init?.body)).fallbacks).toBeUndefined();
  });

  it('une los bloques de texto, ignora el razonamiento y devuelve el uso', async () => {
    const result = await new ClaudeClient(fakeFetch(() => json(200, message())) as unknown as typeof fetch).structured(CONFIG, REQUEST);
    expect(result).toEqual({ json: { summary: 'ok' }, model: 'claude-sonnet-5-5', usage: { inputTokens: 120, outputTokens: 80 } });
  });

  it.each([
    ['refusal', message({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null } }), 'REFUSED'],
    ['max_tokens', message({ stop_reason: 'max_tokens' }), 'INCOMPLETE'],
    ['texto no JSON', message({ content: [{ type: 'text', text: 'hola' }] }), 'INVALID_OUTPUT'],
  ])('traduce %s', async (_caso, body, kind) => {
    const client = new ClaudeClient(fakeFetch(() => json(200, body)) as unknown as typeof fetch);
    expect(await kindOf(client.structured(CONFIG, REQUEST))).toBe(kind);
  });

  it.each([
    [429, 'RATE_LIMITED'],
    [529, 'RATE_LIMITED'],
    [400, 'UPSTREAM'],
    [401, 'UPSTREAM'],
    [500, 'UPSTREAM'],
  ])('traduce el estado HTTP %i', async (status, kind) => {
    const body = { type: 'error', error: { type: 'error', message: 'fallo' } };
    const client = new ClaudeClient(fakeFetch(() => json(status, body)) as unknown as typeof fetch);
    expect(await kindOf(client.structured(CONFIG, REQUEST))).toBe(kind);
  });

  it('traduce un fallo de red', async () => {
    const client = new ClaudeClient(fakeFetch(() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch);
    expect(await kindOf(client.structured(CONFIG, REQUEST))).toBe('UPSTREAM');
  });

  it('traduce el tiempo de espera agotado', async () => {
    const hanging = jest.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('abortado'), { name: 'AbortError' })));
        }),
    );
    const client = new ClaudeClient(hanging as unknown as typeof fetch);
    expect(await kindOf(client.structured({ ...CONFIG, timeoutMs: 20 }, REQUEST))).toBe('TIMEOUT');
  });
});
