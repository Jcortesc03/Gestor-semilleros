import type { ApiRequest } from '../../types/api.ts';
import { ApiError, isRecord, parseArray } from '../../lib/api.ts';

export const DIRECTORY_ROLES = ['ADMIN', 'AREA_MANAGER', 'DEAN', 'TUTOR', 'STUDENT'] as const;
export type DirectoryRole = (typeof DIRECTORY_ROLES)[number];

/** Usuario del directorio (`GET /api/users`): solo datos para elegir a una persona. */
export interface DirectoryUser { id: string; fullName: string; email: string; roles: DirectoryRole[] }
export interface Area { id: string; name: string; description: string | null }
export interface Faculty { id: string; name: string }

export interface SearchUsersParams { search?: string; role?: DirectoryRole; limit?: number }

function fail(): never { throw new ApiError(0); }
function str(value: unknown): string { if (typeof value !== 'string' || value === '') fail(); return value; }
function record(value: unknown): Record<string, unknown> { if (!isRecord(value)) fail(); return value; }
function role(value: unknown): DirectoryRole {
  if (typeof value !== 'string' || !(DIRECTORY_ROLES as readonly string[]).includes(value)) fail();
  return value as DirectoryRole;
}

export function parseDirectoryUser(value: unknown): DirectoryUser {
  const r = record(value);
  if (!Array.isArray(r.roles)) fail();
  return { id: str(r.id), fullName: str(r.fullName), email: str(r.email), roles: r.roles.map(role) };
}

export function parseArea(value: unknown): Area {
  const r = record(value);
  if (r.description !== null && r.description !== undefined && typeof r.description !== 'string') fail();
  return { id: str(r.id), name: str(r.name), description: typeof r.description === 'string' ? r.description : null };
}

export function parseFaculty(value: unknown): Faculty {
  const r = record(value);
  return { id: str(r.id), name: str(r.name) };
}

/** Busca usuarios activos. Solo ADMIN, DEAN, AREA_MANAGER y TUTOR; otro rol recibe 403. */
export async function searchUsers(request: ApiRequest, params: SearchUsersParams = {}): Promise<DirectoryUser[]> {
  const query = new URLSearchParams();
  if (params.search !== undefined) query.set('search', params.search);
  if (params.role !== undefined) query.set('role', params.role);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  const suffix = query.toString();
  return parseArray(await request(`/api/users${suffix ? `?${suffix}` : ''}`), parseDirectoryUser);
}

/** `managed`: solo las áreas del encargado actual (docs/api/catalogs.md). */
export type AreaScope = 'all' | 'managed';
/** `dean`: solo las facultades de las que el usuario es decano vigente. */
export type FacultyScope = 'all' | 'dean';

export const listAreas = async (request: ApiRequest, scope: AreaScope = 'all'): Promise<Area[]> =>
  parseArray(await request(scope === 'managed' ? '/api/areas?scope=managed' : '/api/areas'), parseArea);
export const listFaculties = async (request: ApiRequest, scope: FacultyScope = 'all'): Promise<Faculty[]> =>
  parseArray(await request(scope === 'dean' ? '/api/faculties?scope=dean' : '/api/faculties'), parseFaculty);

/**
 * Alcance de los catálogos según los roles (ADR 0010 §9). El administrador ve todo.
 * Un encargado de área solo elige entre sus áreas, salvo que además sea decano (su autoridad
 * sobre un proyecto puede venir de la facultad, así que cualquier área es válida).
 * Un decano solo elige entre sus facultades, salvo que además sea encargado de área.
 */
export function areaScopeFor(roles: readonly string[]): AreaScope {
  return roles.includes('AREA_MANAGER') && !roles.includes('ADMIN') && !roles.includes('DEAN') ? 'managed' : 'all';
}
export function facultyScopeFor(roles: readonly string[]): FacultyScope {
  return roles.includes('DEAN') && !roles.includes('ADMIN') && !roles.includes('AREA_MANAGER') ? 'dean' : 'all';
}

/** El directorio de usuarios solo lo consultan estos roles globales. */
export const canSearchUsers = (roles: readonly string[]): boolean => roles.some((item) => item === 'ADMIN' || item === 'DEAN' || item === 'AREA_MANAGER' || item === 'TUTOR');
