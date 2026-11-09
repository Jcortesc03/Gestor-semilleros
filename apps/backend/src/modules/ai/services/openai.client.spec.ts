import { Logger } from '@nestjs/common';
import type { AiConfig } from '../../../config/ai.config.types';
import { AiClientError, OpenAiClient, type StructuredRequest } from './openai.client';

const CONFIG: AiConfig = {
  apiKey: 'sk-prueba',
  model: 'modelo-prueba',
  baseUrl: 'https://api.ejemplo.test/v1',
  timeoutMs: 5000,
  maxOutputTokens: 1000,
  cacheTtlSeconds: 600,
  rateLimitPerHour: 20,
};

const REQUEST: StructuredRequest = {
  instructions: 'Eres un analista.',
  input: 'Resumen de prueba',
  schemaName: 'informe_semilleros',
  schema: { type: 'object', additionalProperties: false, required: ['summary'], properties: { summary: { type: 'string' } } },
};

type FakeFetch = jest.Mock<Promise<Response>, [string, RequestInit]>;

/** Respuesta JSON simulada de la API Responses. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Mensaje de salida (output) con un bloque de texto JSON. */
const outputText = (text: string) => ({
  type: 'message',
  content: [{ type: 'output_text', text }],
});

function fakeFetch(response: Response | Error): FakeFetch {
  return jest.fn<Promise<Response>, [string, RequestInit]>().mockImplementation(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

function clientWith(fetchImpl: FakeFetch): OpenAiClient {
  return new OpenAiClient(fetchImpl as unknown as typeof fetch);
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba un error.');
}

describe('OpenAiClient', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe('petición', () => {
    it('envía POST a /responses con Bearer, modelo, store:false y json_schema estricto', async () => {
      const fetchImpl = fakeFetch(jsonResponse({ status: 'completed', model: 'modelo-prueba', output: [outputText('{"summary":"ok"}')] }));

      await clientWith(fetchImpl).structured(CONFIG, REQUEST);

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0];
      expect(url).toBe('https://api.ejemplo.test/v1/responses');
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer sk-prueba' });
      expect(init.signal).toBeInstanceOf(AbortSignal);

      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        model: 'modelo-prueba',
        instructions: 'Eres un analista.',
        input: 'Resumen de prueba',
        max_output_tokens: 1000,
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'informe_semilleros',
            schema: REQUEST.schema,
            strict: true,
          },
        },
      });
    });
  });

  describe('respuesta', () => {
    it('parsea output_text a JSON y devuelve el uso de tokens', async () => {
      const fetchImpl = fakeFetch(
        jsonResponse({
          status: 'completed',
          model: 'modelo-devuelto',
          output: [outputText('{"summary":"Todo bien"}')],
          usage: { input_tokens: 120, output_tokens: 30 },
        }),
      );

      await expect(clientWith(fetchImpl).structured(CONFIG, REQUEST)).resolves.toEqual({
        json: { summary: 'Todo bien' },
        model: 'modelo-devuelto',
        usage: { inputTokens: 120, outputTokens: 30 },
      });
    });

    it('concatena varios bloques output_text antes de parsear', async () => {
      const fetchImpl = fakeFetch(
        jsonResponse({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"summary":' }, { type: 'output_text', text: '"partido"}' }] }] }),
      );

      await expect(clientWith(fetchImpl).structured(CONFIG, REQUEST)).resolves.toMatchObject({ json: { summary: 'partido' } });
    });

    it('sin usage devuelve usage null y usa el modelo de configuración si no viene en la respuesta', async () => {
      const fetchImpl = fakeFetch(jsonResponse({ status: 'completed', output: [outputText('{"summary":"x"}')] }));

      await expect(clientWith(fetchImpl).structured(CONFIG, REQUEST)).resolves.toEqual({
        json: { summary: 'x' },
        model: 'modelo-prueba',
        usage: null,
      });
    });
  });

  describe('errores', () => {
    it('429 se traduce a RATE_LIMITED', async () => {
      const fetchImpl = fakeFetch(jsonResponse({ error: { message: 'cuota agotada' } }, 429));

      const error = await captureError(clientWith(fetchImpl).structured(CONFIG, REQUEST));
      expect(error).toBeInstanceOf(AiClientError);
      expect((error as AiClientError).kind).toBe('RATE_LIMITED');
    });

    it('500 se traduce a UPSTREAM', async () => {
      const fetchImpl = fakeFetch(jsonResponse({ error: { message: 'fallo interno' } }, 500));

      const error = await captureError(clientWith(fetchImpl).structured(CONFIG, REQUEST));
      expect((error as AiClientError).kind).toBe('UPSTREAM');
    });

    it('no registra la clave de API al fallar con estado HTTP', async () => {
      const fetchImpl = fakeFetch(jsonResponse({ error: { message: 'clave inválida' } }, 401));

      const error = await captureError(clientWith(fetchImpl).structured(CONFIG, REQUEST));
      expect((error as AiClientError).kind).toBe('UPSTREAM');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('sk-prueba');
    });

    it('status incomplete se traduce a INCOMPLETE', async () => {
      const fetchImpl = fakeFetch(jsonResponse({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }));

      const error = await captureError(clientWith(fetchImpl).structured(CONFIG, REQUEST));
      expect((error as AiClientError).kind).toBe('INCOMPLETE');
      expect((error as AiClientError).message).toContain('max_output_tokens');
    });

    it('contenido de tipo refusal se traduce a REFUSED', async () => {
      const fetchImpl = fakeFetch(
        jsonResponse({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No puedo ayudar.' }] }] }),
      );

      const error = await captureError(clientWith(fetchImpl).structured(CONFIG, REQUEST));
      expect((error as AiClientError).kind).toBe('REFUSED');
    });

    it('texto que no es JSON se traduce a INVALID_OUTPUT', async () => {
      const fetchImpl = fakeFetch(jsonResponse({ status: 'completed', output: [outputText('esto no es json')] }));

      const error = await captureError(clientWith(fetchImpl).structured(CONFIG, REQUEST));
      expect((error as AiClientError).kind).toBe('INVALID_OUTPUT');
    });

    it('un cuerpo que no es JSON se traduce a INVALID_OUTPUT', async () => {
      const fetchImpl = fakeFetch(new Response('<html>pasarela</html>', { status: 200 }));

      const error = await captureError(clientWith(fetchImpl).structured(CONFIG, REQUEST));
      expect((error as AiClientError).kind).toBe('INVALID_OUTPUT');
    });

    it('un fetch que lanza TimeoutError se traduce a TIMEOUT', async () => {
      const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
      const fetchImpl = fakeFetch(timeout);

      const error = await captureError(clientWith(fetchImpl).structured(CONFIG, REQUEST));
      expect((error as AiClientError).kind).toBe('TIMEOUT');
    });

    it('un fallo de red se traduce a UPSTREAM', async () => {
      const fetchImpl = fakeFetch(new TypeError('fetch failed'));

      const error = await captureError(clientWith(fetchImpl).structured(CONFIG, REQUEST));
      expect((error as AiClientError).kind).toBe('UPSTREAM');
    });
  });
});
