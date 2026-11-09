import {
  BadGatewayException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AppEnv } from '../../../config/env';
import type { AiConfig } from '../../../config/ai.config.types';
import type { AuthUser } from '../../auth';
import type { AnalyticsResponseDto, AnalyticsService } from '../../analytics';

type TutorStatsDto = AnalyticsResponseDto['tutors'][number];
import { AI_LIMITS, parseAiRecommendationsRequest, type AiRecommendationsRequest } from '../dtos/ai-recommendations-request.dto';
import type { AiReport } from '../models/ai-prompt';
import { AiService } from './ai.service';
import { AiClientError, type AiClient } from './claude.client';

const TUTOR_ID = '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b';
const NOW = new Date('2026-11-08T15:00:00.000Z');

const AI_CONFIG: AiConfig = {
  apiKey: 'sk-ant-prueba',
  model: 'modelo-prueba',
  baseUrl: null,
  timeoutMs: 5000,
  maxRetries: 0,
  maxTokens: 1000,
  effort: 'high',
  refusalFallback: false,
  cacheTtlSeconds: 600,
  rateLimitPerHour: 2,
};

/** Informe válido que devuelve el modelo (salida estructurada). */
function validReport(over: Partial<AiReport> = {}): AiReport {
  const recommendation = {
    title: 'Revisar plazos',
    rationale: 'La tasa a tiempo es baja.',
    actions: ['Recordar vencimientos'],
    priority: 'HIGH' as const,
    focus: 'DEADLINES' as const,
    evidence: ['onTimePct 75'],
    expectedImpact: 'Subir onTimePct.',
    horizon: 'IMMEDIATE' as const,
  };
  return {
    summary: 'Resumen general del periodo.',
    overallStatus: 'ATTENTION',
    highlights: [{ title: 'Buen avance', detail: 'Completitud alta.' }],
    risks: [{ title: 'Atrasos', detail: 'Actividades vencidas.', severity: 'MEDIUM' }],
    recommendations: [recommendation, { ...recommendation, title: 'Segunda' }, { ...recommendation, title: 'Tercera' }],
    answer: 'Respuesta de prueba.',
    dataGaps: [],
    ...over,
  };
}

const tutor = (id: string, name: string, completionRate: number): TutorStatsDto => ({
  id,
  name,
  projects: 1,
  boards: 2,
  activities: 10,
  done: 9,
  completionRate,
  onTimeRate: 0.5,
  approvalRate: 0.6,
  meetingsOrganized: 1,
  meetingsAttended: 2,
});

/** Respuesta de la analítica con datos en todas las secciones (forma de GET /api/analytics). */
function sampleData(over: Partial<AnalyticsResponseDto> = {}): AnalyticsResponseDto {
  const summary = { completions: 4, completionRate: 0.8, onTimeRate: 0.75, meetings: 3, attachments: 2, activitiesCreated: 6 };
  return {
    generatedAt: NOW.toISOString(),
    timeZone: 'America/Bogota',
    period: { from: '2026-01-01', to: '2026-10-31' },
    scope: { global: true, areas: [], faculties: [] },
    users: {
      platform: { total: 10, active: 8, inactive: 2, byRole: { ADMIN: 1, AREA_MANAGER: 1, DEAN: 1, TUTOR: 2, STUDENT: 5 }, newInPeriod: 3 },
      participants: 6,
      withAssignedActivities: 5,
      completingActivities: 4,
      completionRate: 0.8,
    },
    activities: {
      total: 20,
      byProgress: { PENDING: 5, IN_PROGRESS: 5, DONE: 8, CANCELLED: 2 },
      byResult: { SUCCESS: 6, FAILURE: 2, NONE: 12 },
      byApproval: { PENDING: 3, APPROVED: 4, REJECTED: 1 },
      completionRate: 0.8,
      approvalRate: 0.5,
      successRate: 0.75,
      onTime: { evaluated: 8, onTime: 6, late: 2, rate: 0.75 },
      overdueOpen: 3,
      avgDaysToComplete: 4.5,
    },
    boards: {
      total: 4,
      byProgress: { PENDING: 1, IN_PROGRESS: 2, DONE: 1, CANCELLED: 0 },
      overdue: 1,
      onTime: { evaluated: 3, onTime: 2, late: 1, rate: 0.6667 },
    },
    patterns: [],
    faculties: [{ id: 'f1', name: 'Ingeniería', projects: 2, activities: 10, done: 8, completionRate: 0.8, onTimeRate: 0.75, meetings: 2, attachments: 3 }],
    areas: [{ id: 'ar1', name: 'Área Tecnológica', projects: 2, activities: 10, done: 8, completionRate: 0.8, onTimeRate: 0.75, meetings: 2, attachments: 3 }],
    tutors: [tutor(TUTOR_ID, 'Ana Tutora', 0.9), tutor('22222222-2222-4222-8222-222222222222', 'Luis Tutor', 0.5)],
    deans: [
      { id: 'd1', name: 'Decana Rosa', faculties: ['Ingeniería'], projects: 2, activities: 10, done: 8, completionRate: 0.8, onTimeRate: 0.75, meetingsOrganized: 1, meetingsAttended: 2 },
    ],
    meetings: { total: 5, byStatus: { SCHEDULED: 1, IN_PROGRESS: 0, FINISHED: 3, CANCELLED: 1 }, totalMinutes: 300, avgMinutes: 60, withRecording: 2, withProject: 4, avgParticipants: 3.5 },
    attachments: { total: 7, byKind: { LINK: 4, DOCUMENT: 3 }, byFormat: { PDF: 2, WORD: 1, EXCEL: 0, IMAGE: 0 }, totalBytes: 5_242_880, activitiesWithAttachments: 6 },
    weekdays: [],
    monthly: [{ month: '2026-10', activitiesCreated: 8, completions: 4, meetings: 3, attachments: 2 }],
    comparison: {
      previousPeriod: { from: '2025-11-01', to: '2025-12-31' },
      current: summary,
      previous: { completions: 2, completionRate: 0.5, onTimeRate: 0.5, meetings: 1, attachments: 0, activitiesCreated: 4 },
    },
    ...over,
  };
}

/** Sin actividades, tableros ni reuniones: no hay hechos que analizar. */
const emptyData = (): AnalyticsResponseDto =>
  sampleData({
    activities: { ...sampleData().activities, total: 0, onTime: { evaluated: 0, onTime: 0, late: 0, rate: null } },
    boards: { ...sampleData().boards, total: 0 },
    meetings: { ...sampleData().meetings, total: 0 },
  });

function user(roles: AuthUser['roles']): AuthUser {
  return { id: 'u1', email: 'usuario@ejemplo.test', fullName: 'Usuario de Prueba', roles, mustChangePassword: false };
}

function request(over: Record<string, unknown> = {}): AiRecommendationsRequest {
  const result = parseAiRecommendationsRequest(over);
  if (!result.ok) throw new Error(`Petición de prueba inválida: ${result.errors.join(' | ')}`);
  return result.value;
}

interface Fakes {
  analytics: { get: jest.Mock; filters: jest.Mock };
  client: { structured: jest.Mock };
}

function fakes(): Fakes {
  return {
    analytics: { get: jest.fn().mockResolvedValue(sampleData()), filters: jest.fn() },
    client: {
      structured: jest.fn().mockResolvedValue({ json: validReport(), model: 'modelo-prueba', usage: { inputTokens: 100, outputTokens: 50 } }),
    },
  };
}

function buildService(f: Fakes, ai: AiConfig | null = AI_CONFIG): AiService {
  const env = { ai } as AppEnv;
  return new AiService(f.analytics as unknown as AnalyticsService, f.client as unknown as AiClient, env);
}

describe('AiService', () => {
  let f: Fakes;

  beforeEach(() => {
    f = fakes();
  });

  describe('configuración', () => {
    it('sin configuración lanza ServiceUnavailableException y status indica no configurada', async () => {
      const service = buildService(f, null);

      await expect(service.recommend(user(['ADMIN']), request(), NOW)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(service.status()).toEqual({
        configured: false,
        model: null,
        cacheTtlSeconds: 0,
        rateLimitPerHour: 0,
        limits: AI_LIMITS,
      });
      expect(f.client.structured).not.toHaveBeenCalled();
    });

    it('con configuración status expone el modelo y los límites', () => {
      expect(buildService(f).status()).toEqual({
        configured: true,
        model: 'modelo-prueba',
        cacheTtlSeconds: 600,
        rateLimitPerHour: 2,
        limits: AI_LIMITS,
      });
    });
  });

  describe('perspectiva', () => {
    it('por defecto usa el rol de mayor alcance: ADMIN antes que AREA_MANAGER y DEAN', async () => {
      const result = await buildService(f).recommend(user(['DEAN', 'AREA_MANAGER', 'ADMIN']), request(), NOW);
      expect(result.perspective).toBe('ADMIN');
    });

    it('por defecto usa AREA_MANAGER antes que DEAN', async () => {
      const result = await buildService(f).recommend(user(['DEAN', 'AREA_MANAGER']), request(), NOW);
      expect(result.perspective).toBe('AREA_MANAGER');
    });

    it('por defecto usa DEAN si es el único rol con acceso', async () => {
      const result = await buildService(f).recommend(user(['TUTOR', 'DEAN']), request(), NOW);
      expect(result.perspective).toBe('DEAN');
    });

    it('una perspectiva pedida que el usuario no tiene lanza ForbiddenException', async () => {
      await expect(buildService(f).recommend(user(['DEAN']), request({ perspective: 'ADMIN' }), NOW)).rejects.toBeInstanceOf(ForbiddenException);
      expect(f.client.structured).not.toHaveBeenCalled();
    });

    it('un usuario sin rol con acceso a la IA lanza ForbiddenException', async () => {
      await expect(buildService(f).recommend(user(['STUDENT', 'TUTOR']), request(), NOW)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('sin datos con los filtros lanza UnprocessableEntityException y no llama al cliente', async () => {
    f.analytics.get.mockResolvedValue(emptyData());

    await expect(buildService(f).recommend(user(['ADMIN']), request(), NOW)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(f.client.structured).not.toHaveBeenCalled();
  });

  describe('respuesta correcta', () => {
    it('restaura los seudónimos en los textos del informe', async () => {
      f.client.structured.mockResolvedValue({
        json: validReport({ summary: 'TUTOR_1 lidera el avance.', recommendations: [{ ...validReport().recommendations[0], rationale: 'Revisar a TUTOR_1.' }] }),
        model: 'modelo-prueba',
        usage: null,
      });

      const result = await buildService(f).recommend(user(['ADMIN']), request({ maxRecommendations: 5 }), NOW);

      expect(result.report.summary).toBe('Ana Tutora lidera el avance.');
      expect(result.report.recommendations[0].rationale).toBe('Revisar a Ana Tutora.');
      expect(JSON.stringify(result.report)).not.toContain('TUTOR_1');
      expect(result.digest.pseudonyms).toBe(3);
    });

    it('envía el resumen con seudónimos, no con los nombres reales', async () => {
      await buildService(f).recommend(user(['ADMIN']), request(), NOW);

      const sent = f.client.structured.mock.calls[0][1] as { input: string };
      expect(sent.input).toContain('TUTOR_1');
      expect(sent.input).not.toContain('Ana Tutora');
    });

    it('recorta recommendations a maxRecommendations', async () => {
      const result = await buildService(f).recommend(user(['ADMIN']), request({ maxRecommendations: 2 }), NOW);
      expect(result.report.recommendations).toHaveLength(2);
    });

    it('answer es null si la petición no trae pregunta', async () => {
      const result = await buildService(f).recommend(user(['ADMIN']), request(), NOW);
      expect(result.report.answer).toBeNull();
    });

    it('conserva answer si la petición trae pregunta', async () => {
      const result = await buildService(f).recommend(user(['ADMIN']), request({ question: '¿Qué hago?' }), NOW);
      expect(result.report.answer).toBe('Respuesta de prueba.');
      expect(result.request.question).toBe('¿Qué hago?');
    });

    it('devuelve metadatos de la respuesta y el uso de tokens', async () => {
      const result = await buildService(f).recommend(user(['ADMIN']), request(), NOW);

      expect(result).toMatchObject({
        generatedAt: NOW.toISOString(),
        model: 'modelo-prueba',
        cached: false,
        perspective: 'ADMIN',
        usage: { inputTokens: 100, outputTokens: 50 },
      });
    });
  });

  describe('caché', () => {
    it('una segunda llamada idéntica sale de la caché sin llamar de nuevo al cliente', async () => {
      const service = buildService(f);
      const first = await service.recommend(user(['ADMIN']), request(), NOW);
      const second = await service.recommend(user(['ADMIN']), request(), NOW);

      expect(first.cached).toBe(false);
      expect(second.cached).toBe(true);
      expect(second.report).toEqual(first.report);
      expect(f.client.structured).toHaveBeenCalledTimes(1);
    });

    it('refresh=true ignora la caché y genera un análisis nuevo', async () => {
      const service = buildService(f);
      await service.recommend(user(['ADMIN']), request(), NOW);
      const refreshed = await service.recommend(user(['ADMIN']), request({ refresh: true }), NOW);

      expect(refreshed.cached).toBe(false);
      expect(f.client.structured).toHaveBeenCalledTimes(2);
    });

    it('la caché es por usuario: otro usuario genera su propio análisis', async () => {
      const service = buildService(f);
      await service.recommend(user(['ADMIN']), request(), NOW);
      await service.recommend({ ...user(['ADMIN']), id: 'u2' }, request(), NOW);

      expect(f.client.structured).toHaveBeenCalledTimes(2);
    });

    it('una respuesta servida desde caché no consume cuota', async () => {
      const service = buildService(f);
      await service.recommend(user(['ADMIN']), request(), NOW);
      await service.recommend(user(['ADMIN']), request(), NOW);

      // Con límite 2 por hora, la tercera petición distinta todavía debe pasar.
      await expect(service.recommend(user(['ADMIN']), request({ focuses: ['TUTORS'] }), NOW)).resolves.toMatchObject({ cached: false });
    });
  });

  it('el tercer análisis nuevo en la misma hora supera el límite y lanza 429', async () => {
    const service = buildService(f);
    const user1 = user(['ADMIN']);
    await service.recommend(user1, request({ focuses: ['GENERAL'] }), NOW);
    await service.recommend(user1, request({ focuses: ['ACTIVITIES'] }), NOW);

    const error = await service.recommend(user1, request({ focuses: ['TUTORS'] }), NOW).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(f.client.structured).toHaveBeenCalledTimes(2);
  });

  describe('errores del cliente', () => {
    it.each([
      ['TIMEOUT', GatewayTimeoutException],
      ['RATE_LIMITED', ServiceUnavailableException],
      ['UPSTREAM', BadGatewayException],
      ['INCOMPLETE', BadGatewayException],
      ['REFUSED', BadGatewayException],
      ['INVALID_OUTPUT', BadGatewayException],
    ] as const)('AiClientError %s se traduce a la excepción HTTP correspondiente', async (kind, expected) => {
      f.client.structured.mockRejectedValue(new AiClientError(kind, 'detalle técnico'));

      await expect(buildService(f).recommend(user(['ADMIN']), request(), NOW)).rejects.toBeInstanceOf(expected);
    });

    it('un error que no es AiClientError se traduce a BadGatewayException', async () => {
      f.client.structured.mockRejectedValue(new Error('boom'));

      await expect(buildService(f).recommend(user(['ADMIN']), request(), NOW)).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('una salida sin el formato del informe lanza BadGatewayException', async () => {
      f.client.structured.mockResolvedValue({ json: { summary: 'sin listas' }, model: 'modelo-prueba', usage: null });

      await expect(buildService(f).recommend(user(['ADMIN']), request(), NOW)).rejects.toBeInstanceOf(BadGatewayException);
    });
  });
});
