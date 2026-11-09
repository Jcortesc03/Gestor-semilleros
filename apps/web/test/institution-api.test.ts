import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignAreaManager,
  assignFacultyDean,
  closeFacultyDean,
  createArea,
  createFaculty,
  deleteArea,
  deleteFaculty,
  listAreaManagers,
  listFacultyDeans,
  removeAreaManager,
  renameFaculty,
  updateArea,
} from '../src/features/institution/api.ts';
import { listAreas, listFaculties } from '../src/features/directory/api.ts';

function mockApiRequest(response: unknown = undefined) {
  const calls: { path: string; options?: { method?: string; body?: unknown } }[] = [];
  const request = async (path: string, options?: { method?: string; body?: unknown }) => {
    calls.push({ path, options });
    return response;
  };
  return { calls, request };
}

const manager = { userId: 'u-1', fullName: 'Elena Encargada', email: 'encargada@example.test', assignedAt: '2026-11-07T10:00:00.000Z' };
const dean = { id: 'd-1', userId: 'u-2', fullName: 'Diego Decano', email: 'decano@example.test', startsAt: '2026-11-01T08:00:00.000Z', endsAt: null };

test('createArea sends the body of the contract and parses the area', async () => {
  const mock = mockApiRequest({ id: 'a-1', name: 'Investigación', description: null });
  const area = await createArea(mock.request, { name: 'Investigación' });
  assert.deepEqual(area, { id: 'a-1', name: 'Investigación', description: null });
  assert.equal(mock.calls[0].path, '/api/areas');
  assert.deepEqual(mock.calls[0].options, { method: 'POST', body: { name: 'Investigación' } });
});

test('updateArea sends PATCH with the given fields and accepts null description', async () => {
  const mock = mockApiRequest({ id: 'a-1', name: 'Extensión', description: 'Texto' });
  assert.equal((await updateArea(mock.request, 'a-1', { name: 'Extensión', description: 'Texto' })).description, 'Texto');
  await updateArea(mock.request, 'a-1', { description: null });
  assert.equal(mock.calls[0].path, '/api/areas/a-1');
  assert.deepEqual(mock.calls[0].options, { method: 'PATCH', body: { name: 'Extensión', description: 'Texto' } });
  assert.deepEqual(mock.calls[1].options, { method: 'PATCH', body: { description: null } });
});

test('deleteArea and removeAreaManager issue DELETE and tolerate 204', async () => {
  const mock = mockApiRequest(undefined);
  await deleteArea(mock.request, 'a-1');
  await removeAreaManager(mock.request, 'a-1', 'u-1');
  assert.deepEqual(mock.calls[0], { path: '/api/areas/a-1', options: { method: 'DELETE' } });
  assert.deepEqual(mock.calls[1], { path: '/api/areas/a-1/managers/u-1', options: { method: 'DELETE' } });
});

test('area managers: list, assign with PUT and validate the shape', async () => {
  const list = mockApiRequest([manager]);
  assert.deepEqual(await listAreaManagers(list.request, 'a-1'), [manager]);
  assert.equal(list.calls[0].path, '/api/areas/a-1/managers');

  const put = mockApiRequest(manager);
  assert.deepEqual(await assignAreaManager(put.request, 'a-1', 'u-1'), manager);
  assert.deepEqual(put.calls[0].options, { method: 'PUT' });
  assert.equal(put.calls[0].path, '/api/areas/a-1/managers/u-1');

  for (const bad of [{}, [{ ...manager, assignedAt: 3 }], [{ userId: 'u-1' }], [null]]) {
    await assert.rejects(() => listAreaManagers(mockApiRequest(bad).request, 'a-1'), { name: 'ApiError', status: 0 });
  }
});

test('faculties: create, rename and delete use the contract paths', async () => {
  const mock = mockApiRequest({ id: 'f-1', name: 'Ciencias' });
  assert.deepEqual(await createFaculty(mock.request, 'Ciencias'), { id: 'f-1', name: 'Ciencias' });
  assert.deepEqual(mock.calls[0].options, { method: 'POST', body: { name: 'Ciencias' } });
  await renameFaculty(mock.request, 'f-1', 'Ciencias Básicas');
  assert.deepEqual(mock.calls[1], { path: '/api/faculties/f-1', options: { method: 'PATCH', body: { name: 'Ciencias Básicas' } } });
  await deleteFaculty(mock.request, 'f-1');
  assert.deepEqual(mock.calls[2], { path: '/api/faculties/f-1', options: { method: 'DELETE' } });
});

test('deans: history keeps endsAt null for the current dean and rejects malformed rows', async () => {
  const past = { ...dean, id: 'd-0', endsAt: '2026-10-31T08:00:00.000Z' };
  const mock = mockApiRequest([dean, past]);
  const deans = await listFacultyDeans(mock.request, 'f-1');
  assert.deepEqual(deans.map((item) => item.endsAt), [null, '2026-10-31T08:00:00.000Z']);
  assert.equal(mock.calls[0].path, '/api/faculties/f-1/deans');

  await assert.rejects(() => listFacultyDeans(mockApiRequest([{ ...dean, endsAt: 5 }]).request, 'f-1'), { status: 0 });
  await assert.rejects(() => listFacultyDeans(mockApiRequest({}).request, 'f-1'), { status: 0 });
});

test('assignFacultyDean sends PUT with userId and closeFacultyDean sends DELETE', async () => {
  const mock = mockApiRequest(dean);
  assert.deepEqual(await assignFacultyDean(mock.request, 'f-1', 'u-2'), dean);
  assert.equal(mock.calls[0].path, '/api/faculties/f-1/dean');
  assert.deepEqual(mock.calls[0].options, { method: 'PUT', body: { userId: 'u-2' } });

  const close = mockApiRequest(undefined);
  await closeFacultyDean(close.request, 'f-1');
  assert.deepEqual(close.calls[0], { path: '/api/faculties/f-1/dean', options: { method: 'DELETE' } });
});

test('ids are encoded in the path', async () => {
  const mock = mockApiRequest(undefined);
  await deleteArea(mock.request, 'a/1');
  assert.equal(mock.calls[0].path, '/api/areas/a%2F1');
});

test('the read lists come from the directory adapters', async () => {
  const areas = mockApiRequest([{ id: 'a-1', name: 'Investigación', description: null }]);
  assert.deepEqual(await listAreas(areas.request), [{ id: 'a-1', name: 'Investigación', description: null }]);
  const faculties = mockApiRequest([{ id: 'f-1', name: 'Ciencias' }]);
  assert.deepEqual(await listFaculties(faculties.request), [{ id: 'f-1', name: 'Ciencias' }]);
});
