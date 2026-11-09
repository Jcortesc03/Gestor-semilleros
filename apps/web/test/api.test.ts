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

test('envía FormData tal cual y deja que el navegador fije el Content-Type', async () => {
  const form = new FormData();
  form.append('file', new File(['%PDF-1.4'], 'informe.pdf', { type: 'application/pdf' }));
  const request = createApiRequest(async (_input, init) => {
    assert.equal(init?.method, 'POST');
    assert.ok(init?.body instanceof FormData);
    assert.equal(init.body, form);
    assert.equal(new Headers(init?.headers).get('Content-Type'), null);
    assert.equal(new Headers(init?.headers).get('Accept'), 'application/json');
    return Response.json({ id: 'document' }, { status: 201 });
  });
  assert.deepEqual(await request('/api/projects/project/documents', { method: 'POST', body: form }), { id: 'document' });
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

test('muestra el mensaje del backend en errores 403 y 409', async () => {
  const forbidden = createApiRequest(async () => Response.json({ message: 'Solo el encargado puede editar esta actividad.' }, { status: 403 }));
  await assert.rejects(forbidden('/api/projects'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 403);
    assert.equal(error.message, 'Solo el encargado puede editar esta actividad.');
    assert.equal(error.errors, undefined);
    return true;
  });
  const conflict = createApiRequest(async () => Response.json({ message: 'Ya existe un usuario con ese correo.' }, { status: 409 }));
  await assert.rejects(conflict('/api/users', { method: 'POST', body: {} }), (error: unknown) => error instanceof ApiError && error.message === 'Ya existe un usuario con ese correo.');
});

test('conserva errors[] de la validación 400 y descarta entradas no válidas', async () => {
  const many = Array.from({ length: 25 }, (_, index) => `Error ${index + 1}.`);
  const request = createApiRequest(async () => Response.json({ message: 'Datos inválidos.', errors: ['  Falta el título.  ', '', 42, null, ...many] }, { status: 400 }));
  await assert.rejects(request('/api/projects', { method: 'POST', body: {} }), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, 'Datos inválidos.');
    assert.equal(error.errors?.length, 20);
    assert.equal(error.errors?.[0], 'Falta el título.');
    assert.equal(error.errors?.[1], 'Error 1.');
    return true;
  });
});

test('un cuerpo de error no JSON usa el mensaje genérico por código', async () => {
  const request = createApiRequest(async () => new Response('<html>Forbidden</html>', { status: 403 }));
  await assert.rejects(request('/api/projects'), (error: unknown) => error instanceof ApiError && error.message === 'No tienes permiso para realizar esta acción.');
});

test('los errores 5xx usan el mensaje genérico aunque el backend envíe texto', async () => {
  const request = createApiRequest(async () => Response.json({ message: 'Cannot read properties of undefined', errors: ['detalle interno'] }, { status: 503 }));
  await assert.rejects(request('/api/projects'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, 'El servicio no está disponible en este momento.');
    assert.equal(error.errors, undefined);
    return true;
  });
});

test('el constructor conserva la firma original y acepta detalles opcionales', () => {
  const legacy = new ApiError(403);
  assert.equal(legacy.status, 403);
  assert.equal(legacy.name, 'ApiError');
  assert.equal(legacy.message, 'No tienes permiso para realizar esta acción.');
  assert.equal(legacy.errors, undefined);

  const detailed = new ApiError(409, { message: '  Conflicto con el estado.  ' });
  assert.equal(detailed.message, 'Conflicto con el estado.');

  const blank = new ApiError(404, { message: '   ' });
  assert.equal(blank.message, 'No encontramos el recurso solicitado.');

  const long = new ApiError(400, { message: 'a'.repeat(500) });
  assert.equal(long.message.length, 300);
});

test('ApiError ignora los mensajes por defecto de NestJS en inglés', () => {
  assert.equal(new ApiError(404, { message: 'Cannot GET /api/inexistente' }).message, 'No encontramos el recurso solicitado.');
  assert.equal(new ApiError(403, { message: 'Forbidden resource' }).message, 'No tienes permiso para realizar esta acción.');
  assert.equal(new ApiError(403, { message: 'Solo el tutor del proyecto puede aprobar.' }).message, 'Solo el tutor del proyecto puede aprobar.');
});

test('ApiError da un mensaje claro para 413 sin cuerpo JSON (lo corta el proxy)', () => {
  assert.equal(new ApiError(413).message, 'El archivo supera el tamaño máximo permitido.');
});
