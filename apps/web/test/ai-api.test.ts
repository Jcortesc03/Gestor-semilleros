import assert from 'node:assert/strict';
import test from 'node:test';
import type { ApiOptions } from '../src/types/api.ts';
import {
  buildAiBody, defaultAiForm, generateRecommendations, getAiStatus, parseAiResult, parseAiStatus,
} from '../src/features/ai/api.ts';
import { savedPercent, sortByPriority } from '../src/features/ai/labels.ts';

const status = {
  configured: true,
  model: 'gpt-test',
  cacheTtlSeconds: 600,
  rateLimitPerHour: 20,
  limits: {
    maxFocuses: 4, minRecommendations: 1, maxRecommendations: 10, minRankingSize: 0,
    maxRankingSize: 10, minSample: 1, maxSample: 50, questionMaxLength: 500,
  },
};

const result = {
  generatedAt: '2026-11-08T15:00:00.000Z',
  model: 'gpt-test',
  cached: false,
  perspective: 'ADMIN',
  period: { from: '2026-10-01', to: '2026-10-31' },
  scope: { global: true, areas: [], faculties: [] },
  request: { anything: true },
  digest: { data: { k: 1 }, chars: 400, sourceChars: 1000, approxTokens: 100, compressionRatio: 0.4, pseudonyms: 3 },
  usage: { inputTokens: 120, outputTokens: 60 },
  report: {
    summary: 'Resumen',
    overallStatus: 'ATTENTION',
    highlights: [{ title: 'H', detail: 'D' }],
    risks: [{ title: 'R', detail: 'D', severity: 'HIGH' }],
    recommendations: [{
      title: 'T', rationale: 'Por qué', actions: ['a1'], priority: 'LOW', focus: 'GENERAL',
      evidence: ['e1'], expectedImpact: 'Impacto', horizon: 'SHORT_TERM',
    }],
    answer: null,
    dataGaps: ['Sin datos de X'],
  },
};

test('parseAiStatus valida el estado y rechaza formas inválidas', () => {
  assert.equal(parseAiStatus(status).limits.maxSample, 50);
  assert.equal(parseAiStatus({ ...status, model: null }).model, null);
  assert.throws(() => parseAiStatus({ ...status, configured: 'sí' }));
  assert.throws(() => parseAiStatus({ ...status, limits: null }));
  assert.throws(() => parseAiStatus(null));
});

test('parseAiResult acepta una respuesta válida', () => {
  const parsed = parseAiResult(result);
  assert.equal(parsed.report.overallStatus, 'ATTENTION');
  assert.equal(parsed.digest.compressionRatio, 0.4);
  assert.equal(parsed.report.answer, null);
  assert.equal(parsed.report.risks[0]?.severity, 'HIGH');
  assert.equal(parseAiResult({ ...result, usage: null }).usage, null);
});

test('parseAiResult rechaza respuestas inválidas', () => {
  assert.throws(() => parseAiResult({ ...result, report: { ...result.report, overallStatus: 'BAD' } }));
  assert.throws(() => parseAiResult({ ...result, report: { ...result.report, recommendations: 'x' } }));
  assert.throws(() => parseAiResult({ ...result, digest: { ...result.digest, data: [] } }));
  assert.throws(() => parseAiResult({ ...result, cached: 'no' }));
  assert.throws(() => parseAiResult(undefined));
  const bad = { ...result.report, recommendations: [{ ...result.report.recommendations[0], horizon: 'NEVER' }] };
  assert.throws(() => parseAiResult({ ...result, report: bad }));
});

test('buildAiBody omite campos vacíos y respeta los límites', () => {
  const body = buildAiBody(defaultAiForm());
  for (const key of ['from', 'to', 'areaId', 'facultyId', 'projectId', 'tutorId', 'projectStatus', 'perspective', 'question', 'refresh']) {
    assert.equal(key in body, false, key);
  }
  assert.deepEqual(body.focuses, ['GENERAL']);
  assert.equal(body.anonymize, true);
  assert.equal(body.includeWeekdays, false);

  const full = buildAiBody({
    ...defaultAiForm(), from: '2026-10-01', to: ' 2026-10-31 ', areaId: 'a-1', projectStatus: 'ACTIVE',
    perspective: 'DEAN', maxRecommendations: 99, rankingSize: -3, minSample: 0, question: '  ¿Qué mejorar?  ',
    focuses: ['TRENDS', 'GENERAL'],
  }, true);
  assert.equal(full.to, '2026-10-31');
  assert.equal(full.areaId, 'a-1');
  assert.equal(full.perspective, 'DEAN');
  assert.equal(full.maxRecommendations, 10);
  assert.equal(full.rankingSize, 0);
  assert.equal(full.minSample, 1);
  assert.equal(full.question, '¿Qué mejorar?');
  assert.equal(full.refresh, true);
  assert.deepEqual(full.focuses, ['GENERAL', 'TRENDS']);
});

test('getAiStatus y generateRecommendations usan los endpoints del contrato', async () => {
  const calls: Array<{ path: string; options?: ApiOptions }> = [];
  const request = async (path: string, options?: ApiOptions) => {
    calls.push({ path, options });
    return path === '/api/ai/status' ? status : result;
  };
  assert.equal((await getAiStatus(request)).configured, true);
  const out = await generateRecommendations(request, { ...defaultAiForm(), question: '' }, { refresh: true });
  assert.equal(out.model, 'gpt-test');
  assert.equal(calls[1]?.path, '/api/ai/recommendations');
  assert.equal(calls[1]?.options?.method, 'POST');
  assert.equal((calls[1]?.options?.body as Record<string, unknown>).refresh, true);
});

test('sortByPriority y savedPercent', () => {
  const sorted = sortByPriority([{ priority: 'LOW' as const, n: 1 }, { priority: 'HIGH' as const, n: 2 }, { priority: 'HIGH' as const, n: 3 }]);
  assert.deepEqual(sorted.map((x) => x.n), [2, 3, 1]);
  assert.equal(savedPercent(400, 1000), 60);
  assert.equal(savedPercent(10, 0), null);
});
