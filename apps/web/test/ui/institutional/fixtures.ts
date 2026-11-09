import { vi, type Mock } from 'vitest';
import type { ApiOptions, ApiRequest } from '../../../src/types/api.ts';
import type { CurrentUser } from '../../../src/types/auth.ts';

/** Usuarios ficticios: no representan personas reales. */
export const admin: CurrentUser = { id: 'u-admin', email: 'admin@example.test', fullName: 'Administrador de Ejemplo', roles: ['ADMIN'], mustChangePassword: false };
export const student: CurrentUser = { id: 'u-student', email: 'estudiante@example.test', fullName: 'Estudiante de Ejemplo', roles: ['STUDENT'], mustChangePassword: false };

/** `request` falso: cada prueba decide la respuesta según la ruta y el método. */
export function fakeRequest(handler: (path: string, options?: ApiOptions) => Promise<unknown> | unknown): Mock<ApiRequest> {
  return vi.fn<ApiRequest>(async (path: string, options?: ApiOptions) => handler(path, options));
}
