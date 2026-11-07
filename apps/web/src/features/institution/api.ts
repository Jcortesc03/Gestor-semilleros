import type { ApiRequest } from '../../types/api.ts';
import { ApiError, isRecord, parseArray } from '../../lib/api.ts';
import { parseArea, parseFaculty } from '../directory/api.ts';
import type { Area, Faculty } from '../directory/api.ts';

/** Contrato: `docs/api/catalogs.md`, sección «Administración» (ADR 0010, sección 1). */

export interface AreaCreateInput { name: string; description?: string }
/** En `PATCH` la descripción vacía se envía como `null` para borrarla. */
export interface AreaUpdateInput { name?: string; description?: string | null }

/** Encargado de un área (`GET /api/areas/:id/managers`). */
export interface AreaManager { userId: string; fullName: string; email: string; assignedAt: string }

/** Decanato de una facultad; `endsAt` nulo indica el decano vigente. */
export interface FacultyDean { id: string; userId: string; fullName: string; email: string; startsAt: string; endsAt: string | null }

function fail(): never { throw new ApiError(0); }
function str(value: unknown): string { if (typeof value !== 'string' || value === '') fail(); return value; }
function record(value: unknown): Record<string, unknown> { if (!isRecord(value)) fail(); return value; }
function nullableStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') fail();
  return value;
}

export function parseAreaManager(value: unknown): AreaManager {
  const r = record(value);
  return { userId: str(r.userId), fullName: str(r.fullName), email: str(r.email), assignedAt: str(r.assignedAt) };
}

export function parseFacultyDean(value: unknown): FacultyDean {
  const r = record(value);
  return {
    id: str(r.id),
    userId: str(r.userId),
    fullName: str(r.fullName),
    email: str(r.email),
    startsAt: str(r.startsAt),
    endsAt: nullableStr(r.endsAt),
  };
}

const areaPath = (id: string) => `/api/areas/${encodeURIComponent(id)}`;
const facultyPath = (id: string) => `/api/faculties/${encodeURIComponent(id)}`;

// Áreas. La lectura de la lista usa `listAreas` de `features/directory`.

export async function createArea(request: ApiRequest, input: AreaCreateInput): Promise<Area> {
  return parseArea(await request('/api/areas', { method: 'POST', body: input }));
}

export async function updateArea(request: ApiRequest, id: string, input: AreaUpdateInput): Promise<Area> {
  return parseArea(await request(areaPath(id), { method: 'PATCH', body: input }));
}

export async function deleteArea(request: ApiRequest, id: string): Promise<void> {
  await request(areaPath(id), { method: 'DELETE' });
}

export async function listAreaManagers(request: ApiRequest, areaId: string): Promise<AreaManager[]> {
  return parseArray(await request(`${areaPath(areaId)}/managers`), parseAreaManager);
}

export async function assignAreaManager(request: ApiRequest, areaId: string, userId: string): Promise<AreaManager> {
  return parseAreaManager(await request(`${areaPath(areaId)}/managers/${encodeURIComponent(userId)}`, { method: 'PUT' }));
}

export async function removeAreaManager(request: ApiRequest, areaId: string, userId: string): Promise<void> {
  await request(`${areaPath(areaId)}/managers/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

// Facultades. La lectura de la lista usa `listFaculties` de `features/directory`.

export async function createFaculty(request: ApiRequest, name: string): Promise<Faculty> {
  return parseFaculty(await request('/api/faculties', { method: 'POST', body: { name } }));
}

export async function renameFaculty(request: ApiRequest, id: string, name: string): Promise<Faculty> {
  return parseFaculty(await request(facultyPath(id), { method: 'PATCH', body: { name } }));
}

export async function deleteFaculty(request: ApiRequest, id: string): Promise<void> {
  await request(facultyPath(id), { method: 'DELETE' });
}

export async function listFacultyDeans(request: ApiRequest, facultyId: string): Promise<FacultyDean[]> {
  return parseArray(await request(`${facultyPath(facultyId)}/deans`), parseFacultyDean);
}

/** Asigna el decano vigente; el anterior se cierra y conserva el historial. */
export async function assignFacultyDean(request: ApiRequest, facultyId: string, userId: string): Promise<FacultyDean> {
  return parseFacultyDean(await request(`${facultyPath(facultyId)}/dean`, { method: 'PUT', body: { userId } }));
}

export async function closeFacultyDean(request: ApiRequest, facultyId: string): Promise<void> {
  await request(`${facultyPath(facultyId)}/dean`, { method: 'DELETE' });
}
