/** Esfuerzo de razonamiento de Claude (`output_config.effort`). */
export type AiEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Configuración de la integración con la API de Claude (ADR 0018). */
export interface AiConfig {
  apiKey: string;
  /** Modelo de Claude (por defecto `claude-sonnet-5-5`). */
  model: string;
  /** URL base de la API; `null` usa la de Anthropic. */
  baseUrl: string | null;
  /** Tiempo máximo de espera por intento, en milisegundos. */
  timeoutMs: number;
  /** Reintentos automáticos del SDK ante 429, 5xx y errores de red. */
  maxRetries: number;
  /** Límite de tokens de salida por análisis (incluye el razonamiento). */
  maxTokens: number;
  effort: AiEffort;
  /** Reintento en el servidor con otro modelo si Claude rechaza la petición (solo en modelos que lo admiten). */
  refusalFallback: boolean;
  /** Vigencia de la caché de análisis idénticos, en segundos (0 la desactiva). */
  cacheTtlSeconds: number;
  /** Análisis nuevos (no servidos desde caché) por usuario y hora. */
  rateLimitPerHour: number;
}
