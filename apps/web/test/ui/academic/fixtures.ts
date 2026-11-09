import { vi } from 'vitest';
import type { ApiOptions, ApiRequest } from '../../../src/types/api.ts';
import type { CurrentUser } from '../../../src/types/auth.ts';

export const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const iso = '2026-11-06T15:00:00.000Z';

export const admin: CurrentUser = { id: uuid(900), email: 'admin@example.test', fullName: 'Admin', roles: ['ADMIN'], mustChangePassword: false };
export const student: CurrentUser = { id: uuid(31), email: 'est@example.test', fullName: 'Estudiante de Ejemplo', roles: ['STUDENT'], mustChangePassword: false };

export const makeProject = (n: number, title: string) => ({
  id: uuid(n), title, description: null, status: 'ACTIVE',
  area: { id: uuid(1), name: 'Área de prueba' }, faculties: [{ id: uuid(2), name: 'Ingeniería' }],
  startsOn: null, endsOn: null, createdAt: iso,
});

export const makeMember = (n: number, fullName: string, projectRole: string) => ({
  id: uuid(n + 500), user: { id: uuid(n), fullName, email: `u${n}@example.test` },
  projectRole, isPrimary: projectRole === 'TUTOR', status: 'ACTIVE', joinedAt: iso, leftAt: null,
});

export const makeBoard = (n: number, projectId: string, title: string) => ({
  id: uuid(n), projectId, title, dueDate: '2026-12-01', progressStatus: 'PENDING', result: null,
  responsibleTutor: { id: uuid(30), fullName: 'Tutor de Ejemplo' }, responsibleStudent: { id: uuid(31), fullName: 'Estudiante de Ejemplo' },
  activityCount: 1, createdAt: iso,
});

export const makeActivity = (n: number, boardId: string, title: string) => ({
  id: uuid(n), boardId, title, description: null, progressStatus: 'PENDING', result: null, approvalStatus: 'PENDING',
  approvedBy: null, approvedAt: null, author: { id: uuid(30), fullName: 'Tutor de Ejemplo' },
  assignees: [], attachments: [], createdAt: iso, updatedAt: iso,
});

export type Routes = Record<string, (options?: ApiOptions) => unknown>;

/** Respuesta paginada del backend (ADR 0017) para las rutas que devuelven `{ items, total, page, pageSize }`. */
export function pageOf<T>(items: readonly T[], page = 1, pageSize = 20) {
  return { items, total: items.length, page, pageSize };
}

/** `request` falso: resuelve por "MÉTODO ruta"; una ruta ausente rechaza la prueba. */
export function fakeRequest(routes: Routes) {
  return vi.fn<ApiRequest>(async (path, options) => {
    const handler = routes[`${options?.method ?? 'GET'} ${path}`];
    if (!handler) throw new Error(`Ruta sin simular: ${options?.method ?? 'GET'} ${path}`);
    return handler(options);
  });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
