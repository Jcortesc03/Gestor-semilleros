import { loadAiConfig } from './ai.config';
import { EnvValidationError } from './env';

const full = { ANTHROPIC_API_KEY: 'sk-ant-prueba' };

describe('loadAiConfig', () => {
  it('queda no configurada sin clave', () => {
    expect(loadAiConfig({})).toBeNull();
    expect(loadAiConfig({ ANTHROPIC_API_KEY: ' ', ANTHROPIC_MODEL: 'claude-opus-5-5' })).toBeNull();
  });

  it('aplica valores por defecto', () => {
    expect(loadAiConfig(full)).toEqual({
      apiKey: 'sk-ant-prueba',
      model: 'claude-sonnet-5-5',
      baseUrl: null,
      timeoutMs: 120_000,
      maxRetries: 1,
      maxTokens: 16_000,
      effort: 'high',
      refusalFallback: true,
      cacheTtlSeconds: 600,
      rateLimitPerHour: 20,
    });
  });

  it('lee los valores opcionales y quita la barra final de la URL', () => {
    const config = loadAiConfig({
      ...full,
      ANTHROPIC_MODEL: 'claude-opus-5-5',
      ANTHROPIC_BASE_URL: 'http://localhost:8080/',
      ANTHROPIC_EFFORT: 'medium',
      ANTHROPIC_REFUSAL_FALLBACK: 'false',
      ANTHROPIC_MAX_RETRIES: '0',
      AI_CACHE_TTL_SECONDS: '0',
    });
    expect(config).toMatchObject({ model: 'claude-opus-5-5', baseUrl: 'http://localhost:8080', effort: 'medium', refusalFallback: false, maxRetries: 0, cacheTtlSeconds: 0 });
  });

  it.each([
    [{ ANTHROPIC_BASE_URL: 'ftp://x' }],
    [{ ANTHROPIC_TIMEOUT_MS: '10' }],
    [{ ANTHROPIC_MAX_TOKENS: 'mucho' }],
    [{ ANTHROPIC_EFFORT: 'extremo' }],
    [{ ANTHROPIC_REFUSAL_FALLBACK: 'si' }],
    [{ AI_RATE_LIMIT_PER_HOUR: '0' }],
  ])('rechaza valores inválidos aunque no esté configurada: %p', (extra) => {
    expect(() => loadAiConfig(extra)).toThrow(EnvValidationError);
  });
});
