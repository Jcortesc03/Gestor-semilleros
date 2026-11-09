// API pública del módulo de analítica (ADR 0016). El módulo de IA (ADR 0018) consume el servicio y los tipos.
export { AnalyticsModule } from './analytics.module';
export { AnalyticsService } from './services/analytics.service';
export { parseAnalyticsQuery, type AnalyticsQuery } from './dtos/analytics-query.dto';
export type { AnalyticsResponseDto, AnalyticsScopeDto } from './dtos/analytics-response.dto';
export { ANALYTICS_ROLES } from './models/analytics-scope';
