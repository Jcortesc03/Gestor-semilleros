import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApiRequest, isRecord, parseArray } from '../src/lib/api.ts';

test('consulta JSON con cookies de mismo origen y sin caché', async () => {
  const request = createApiRequest(async (input, init) => {
    assert.equal(input, '/api/projects');
    assert.equal(init?.credentials, 'same-origin');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.method, 'GET');
    assert.equal(new Headers(init?.headers).get('Accept'), 'application/json');
    return Response.json([{ id: 'project' }]);
  });
  assert.deepEqual(await request('/api/projects'), [{ id: 'project' }]);
});

test('codifica las escrituras como JSON sin modificar el cuerpo original', async () => {
  const body = { title: 'Proyecto de prueba' };
  const request = createApiRequest(async (_input, init) => {
    assert.equal(init?.method, 'POST');
    assert.equal(init?.body, JSON.stringify(body));
    assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json');
    return Response.json({ id: 'new-project', ...body }, { status: 201 });
  });
  assert.deepEqual(await request('/api/projects', { method: 'POST', body }), { id: 'new-project', ...body });
  assert.deepEqual(body, { title: 'Proyecto de prueba' });
});

test('acepta borrado 204 sin intentar leer JSON', async () => {
  const request = createApiRequest(async (_input, init) => {
    assert.equal(init?.method, 'DELETE');
    return new Response(null, { status: 204 });
  });
  assert.equal(await request('/api/projects/project', { method: 'DELETE' }), undefined);
});

test('rechaza rutas externas o que escapan de /api antes de enviar', async () => {
  let calls = 0;
  const request = createApiRequest(async () => { calls++; return Response.json({}); });
  for (const path of ['https://outside.example/api/projects', '//outside.example/api/projects', '/api/../private', '/api/%2e%2e/private']) {
    await assert.rejects(request(path), ApiError);
  }
  assert.equal(calls, 0);
});

test('una sesión vencida avisa al padre sin confundirla con un permiso denegado', async () => {
  let expired = 0;
  const request = createApiRequest(async () => new Response(null, { status: 401 }), () => { expired++; });
  await assert.rejects(request('/api/projects'), (error: unknown) => error instanceof ApiError && error.status === 401);
  assert.equal(expired, 1);
  const forbidden = createApiRequest(async () => new Response(null, { status: 403 }), () => { expired++; });
  await assert.rejects(forbidden('/api/projects'), (error: unknown) => error instanceof ApiError && error.status === 403);
  assert.equal(expired, 1);
});

test('los errores no exponen mensajes internos del backend', async () => {
  const request = createApiRequest(async () => Response.json({ message: 'PRIVATE_DATABASE_DIAGNOSTIC' }, { status: 500 }));
  await assert.rejects(request('/api/projects'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 500);
    assert.equal(error.message.includes('PRIVATE_DATABASE_DIAGNOSTIC'), false);
    return true;
  });
});

test('convierte fallos de red y respuestas JSON inválidas en errores seguros', async () => {
  const network = createApiRequest(async () => { throw new Error('PRIVATE_NETWORK_DIAGNOSTIC'); });
  await assert.rejects(network('/api/projects'), ApiError);
  const invalid = createApiRequest(async () => new Response('not-json', { headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(invalid('/api/projects'), ApiError);
});

test('los validadores compartidos distinguen objetos y listas', () => {
  assert.equal(isRecord(null), false);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord({ id: 'a' }), true);
  assert.deepEqual(parseArray([1, 2], (value) => {
    if (typeof value !== 'number') throw new ApiError(0);
    return value * 2;
  }), [2, 4]);
  assert.throws(() => parseArray({}, (value) => value), ApiError);
});
