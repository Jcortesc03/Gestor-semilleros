import assert from 'node:assert/strict';
import test from 'node:test';
import { areaScopeFor, canSearchUsers, facultyScopeFor, listAreas, listFaculties, searchUsers } from '../src/features/directory/api.ts';

function mockApiRequest(response: unknown) {
  const calls: { path: string; options?: { method?: string; body?: unknown } }[] = [];
  const request = async (path: string, options?: { method?: string; body?: unknown }) => {
    calls.push({ path, options });
    return response;
  };
  return { calls, request };
}

const user = { id: 'u-1', fullName: 'Tatiana Tutora', email: 'tutor@example.test', roles: ['TUTOR'] };

const page = (items: unknown[]) => ({ items, total: items.length, page: 1, pageSize: 20 });

test('searchUsers builds the query string and parses the page', async () => {
  const mock = mockApiRequest({ items: [user], total: 31, page: 2, pageSize: 10 });
  const result = await searchUsers(mock.request, { search: 'ta ñ', role: 'TUTOR', page: 2, pageSize: 10 });
  assert.deepEqual(result, { items: [user], total: 31, page: 2, pageSize: 10 });
  assert.equal(mock.calls[0].path, '/api/users?search=ta+%C3%B1&role=TUTOR&page=2&pageSize=10');
  assert.equal(mock.calls[0].options, undefined);
});

test('searchUsers without parameters calls the bare endpoint', async () => {
  const mock = mockApiRequest(page([]));
  assert.deepEqual(await searchUsers(mock.request), page([]));
  assert.equal(mock.calls[0].path, '/api/users');
});

test('searchUsers rejects malformed responses with ApiError(0)', async () => {
  for (const bad of [{}, [user], page([{ ...user, roles: ['SUPERUSER'] }]), page([{ ...user, email: 3 }]), page([{ ...user, roles: 'TUTOR' }]), page([{ id: 'u-1' }]), page([null]), { items: [user], total: -1, page: 1, pageSize: 20 }]) {
    await assert.rejects(() => searchUsers(mockApiRequest(bad).request), { name: 'ApiError', status: 0 });
  }
});

test('lists areas and normalises a missing description to null', async () => {
  const mock = mockApiRequest([{ id: 'a-1', name: 'Investigación', description: null }, { id: 'a-2', name: 'Extensión', description: 'Texto' }]);
  const areas = await listAreas(mock.request);
  assert.equal(mock.calls[0].path, '/api/areas');
  assert.deepEqual(areas.map((a) => a.description), [null, 'Texto']);
  await assert.rejects(() => listAreas(mockApiRequest([{ id: 'a-1' }]).request), { status: 0 });
  await assert.rejects(() => listAreas(mockApiRequest({}).request), { status: 0 });
});

test('lists faculties and validates the shape', async () => {
  const mock = mockApiRequest([{ id: 'f-1', name: 'Ingeniería' }]);
  assert.deepEqual(await listFaculties(mock.request), [{ id: 'f-1', name: 'Ingeniería' }]);
  assert.equal(mock.calls[0].path, '/api/faculties');
  await assert.rejects(() => listFaculties(mockApiRequest([{ name: 'x' }]).request), { status: 0 });
});

test('canSearchUsers is limited to ADMIN, DEAN, AREA_MANAGER and TUTOR', () => {
  assert.equal(canSearchUsers(['STUDENT']), false);
  assert.equal(canSearchUsers(['AREA_MANAGER']), true);
  assert.equal(canSearchUsers(['STUDENT', 'TUTOR']), true);
  assert.equal(canSearchUsers(['DEAN']), true);
  assert.equal(canSearchUsers(['ADMIN']), true);
});

test('listAreas y listFaculties piden solo el alcance del usuario cuando se indica', async () => {
  const paths: string[] = [];
  const request = (async (path: string) => { paths.push(path); return []; }) as unknown as Parameters<typeof listAreas>[0];
  await listAreas(request, 'managed');
  await listFaculties(request, 'dean');
  await listAreas(request);
  assert.deepEqual(paths, ['/api/areas?scope=managed', '/api/faculties?scope=dean', '/api/areas']);
});

test('areaScopeFor y facultyScopeFor solo filtran cuando el alcance viene de un único cargo', () => {
  assert.equal(areaScopeFor(['AREA_MANAGER']), 'managed');
  assert.equal(areaScopeFor(['AREA_MANAGER', 'DEAN']), 'all');
  assert.equal(areaScopeFor(['ADMIN', 'AREA_MANAGER']), 'all');
  assert.equal(facultyScopeFor(['DEAN']), 'dean');
  assert.equal(facultyScopeFor(['DEAN', 'TUTOR']), 'dean');
  assert.equal(facultyScopeFor(['DEAN', 'AREA_MANAGER']), 'all');
  assert.equal(facultyScopeFor(['ADMIN']), 'all');
});
