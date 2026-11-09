import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AiWorkspace } from '../../../src/features/ai';
import { ApiError } from '../../../src/lib/api';
import type { ApiRequest } from '../../../src/types/api';
import type { CurrentUser } from '../../../src/types/auth';

const limits = { maxFocuses: 4, minRecommendations: 1, maxRecommendations: 10, minRankingSize: 0, maxRankingSize: 10, minSample: 1, maxSample: 50, questionMaxLength: 500 };
const filters = { scope: { global: true, areas: [], faculties: [] }, areas: [], faculties: [], projects: [], tutors: [] };
const result = {
  generatedAt: '2026-11-08T15:00:00.000Z', model: 'gpt-test', cached: true, perspective: 'ADMIN',
  period: { from: null, to: null }, scope: { global: true, areas: [], faculties: [] },
  digest: { data: { clave: 'valor' }, chars: 400, sourceChars: 1000, approxTokens: 100, compressionRatio: 0.4, pseudonyms: 0 },
  usage: null,
  report: {
    summary: 'Resumen del informe', overallStatus: 'CRITICAL', highlights: [], risks: [],
    recommendations: [{ title: 'Revisar plazos', rationale: 'Hay retrasos', actions: ['Hablar con tutores'], priority: 'HIGH', focus: 'DEADLINES', evidence: ['5 vencidas'], expectedImpact: 'Menos retrasos', horizon: 'IMMEDIATE' }],
    answer: null, dataGaps: [],
  },
};

function user(roles: string[]): CurrentUser {
  return { id: 'u', email: 'a@example.test', fullName: 'Admin', roles, mustChangePassword: false };
}

function api(configured: boolean, post: () => Promise<unknown> = async () => result): ApiRequest {
  return vi.fn(async (path: string) => {
    if (path === '/api/ai/status') return { configured, model: configured ? 'gpt-test' : null, cacheTtlSeconds: 600, rateLimitPerHour: 20, limits };
    if (path === '/api/analytics/filters') return filters;
    return post();
  });
}

describe('AiWorkspace', () => {
  it('avisa que la IA no está configurada y deshabilita generar', async () => {
    render(<AiWorkspace request={api(false)} user={user(['ADMIN'])} />);
    expect(await screen.findByText(/La IA no está configurada en el servidor/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Generar recomendaciones' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Aún no hay recomendaciones')).toBeTruthy();
  });

  it('genera y muestra el informe; la perspectiva solo aparece con varios roles', async () => {
    render(<AiWorkspace request={api(true)} user={user(['ADMIN', 'DEAN'])} />);
    expect(screen.getByLabelText('Perspectiva')).toBeTruthy();
    const button = await screen.findByRole('button', { name: 'Generar recomendaciones' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    expect(await screen.findByText('Revisar plazos')).toBeTruthy();
    expect(screen.getByText('Estado crítico')).toBeTruthy();
    expect(screen.getByText(/desde caché/)).toBeTruthy();
    expect(screen.getByText('Ver datos enviados a la IA')).toBeTruthy();
  });

  it('con un solo rol oculta la perspectiva y muestra el error del backend', async () => {
    const request = api(true, async () => { throw new ApiError(422, { message: 'No hay datos con esos filtros.' }); });
    render(<AiWorkspace request={request} user={user(['ADMIN'])} />);
    expect(screen.queryByLabelText('Perspectiva')).toBeNull();
    const button = await screen.findByRole('button', { name: 'Generar recomendaciones' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    expect(await screen.findByText('No hay datos con esos filtros.')).toBeTruthy();
  });
});
