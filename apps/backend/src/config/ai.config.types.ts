/** Configuración de la integración con la API de OpenAI (ADR 0018). */
export interface AiConfig {
  apiKey: string;
  /** Modelo de OpenAI; se fija por entorno, el código no impone uno. */
  model: string;
  /** URL base de la API (por defecto https://api.openai.com/v1). */
  baseUrl: string;
  /** Tiempo máximo de espera de la respuesta, en milisegundos. */
  timeoutMs: number;
  /** Límite de tokens de salida por análisis. */
  maxOutputTokens: number;
  /** Vigencia de la caché de análisis idénticos, en segundos (0 la desactiva). */
  cacheTtlSeconds: number;
  /** Análisis nuevos (no servidos desde caché) por usuario y hora. */
  rateLimitPerHour: number;
}
