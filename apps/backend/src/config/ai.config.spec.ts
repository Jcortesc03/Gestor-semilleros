import { loadAiConfig } from './ai.config';
import { EnvValidationError } from './env';

const full = { OPENAI_API_KEY: 'sk-prueba', OPENAI_MODEL: 'modelo-prueba' };

describe('loadAiConfig', () => {
  it('queda no configurada sin clave o sin modelo', () => {
    expect(loadAiConfig({})).toBeNull();
    expect(loadAiConfig({ OPENAI_API_KEY: 'sk' })).toBeNull();
    expect(loadAiConfig({ OPENAI_MODEL: 'm', OPENAI_API_KEY: ' ' })).toBeNull();
  });

  it('aplica valores por defecto', () => {
    expect(loadAiConfig(full)).toEqual({
      apiKey: 'sk-prueba',
      model: 'modelo-prueba',
      baseUrl: 'https://api.openai.com/v1',
      timeoutMs: 90_000,
      maxOutputTokens: 4_000,
      cacheTtlSeconds: 600,
      rateLimitPerHour: 20,
    });
  });

  it('lee los valores opcionales y quita la barra final de la URL', () => {
    const config = loadAiConfig({ ...full, OPENAI_BASE_URL: 'http://localhost:8080/v1/', AI_CACHE_TTL_SECONDS: '0', AI_RATE_LIMIT_PER_HOUR: '5' });
    expect(config).toMatchObject({ baseUrl: 'http://localhost:8080/v1', cacheTtlSeconds: 0, rateLimitPerHour: 5 });
  });

  it.each([
    [{ OPENAI_BASE_URL: 'ftp://x' }],
    [{ OPENAI_TIMEOUT_MS: '10' }],
    [{ OPENAI_MAX_OUTPUT_TOKENS: 'mucho' }],
    [{ AI_RATE_LIMIT_PER_HOUR: '0' }],
  ])('rechaza valores inválidos aunque no esté configurada: %p', (extra) => {
    expect(() => loadAiConfig(extra)).toThrow(EnvValidationError);
  });
});
