import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthError, authErrorFromUrl, createAuthClient } from '../src/services/auth.ts';
import type { CurrentUser } from '../src/types/auth.ts';

const USER: CurrentUser = {
  id: 'user-1',
  email: 'ana@example.test',
  fullName: 'Ana de Prueba',
  roles: ['TUTOR'],
};

interface RecordedCall {
  url: string;
  init: RequestInit;
}

type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

function createFetcher(handler: FetchHandler) {
  const calls: RecordedCall[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const requestInit = init ?? {};
    calls.push({ url, init: requestInit });
    return handler(url, requestInit);
  }) as typeof fetch;
  return { fetcher, calls };
}

function jsonResponse(payload: unknown, status = 200, url = ''): Response {
  const response = new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  if (url) Object.defineProperty(response, 'url', { configurable: true, value: url });
  return response;
}

function redirectResponse(url: string): Response {
  return jsonResponse({}, 200, url);
}

function formBody(init: RequestInit): URLSearchParams {
  assert.ok(init.body instanceof URLSearchParams);
  return init.body;
}

function assertAuthError(error: unknown, kind: string): AuthError {
  assert.ok(error instanceof AuthError, 'debe ser una instancia de AuthError');
  assert.ok(error instanceof Error, 'debe ser una instancia de Error');
  assert.equal(error.kind, kind);
  assert.equal(error.name, 'AuthError');
  assert.ok(error.message.length > 0, 'debe incluir un mensaje seguro');
  return error;
}

test('getCurrentUser consulta /api/me con cookies de mismo origen y devuelve el usuario', async () => {
  const { fetcher, calls } = createFetcher(() => jsonResponse(USER));
  const client = createAuthClient(fetcher);

  const user = await client.getCurrentUser();

  assert.deepEqual(user, USER);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, '/api/me');
  assert.equal(calls[0]?.init.method, 'GET');
  assert.equal(calls[0]?.init.credentials, 'same-origin');
  assert.equal(calls[0]?.init.cache, 'no-store');
});

test('getCurrentUser interpreta 401 como ausencia de sesión', async () => {
  const { fetcher } = createFetcher(() =>
    jsonResponse({ message: 'Sesión no válida o expirada.' }, 401),
  );
  const client = createAuthClient(fetcher);

  assert.equal(await client.getCurrentUser(), null);
});

test('getCurrentUser rechaza una caída del servicio en vez de cerrar sesión', async () => {
  const { fetcher } = createFetcher(() => jsonResponse({ message: 'Error interno' }, 503));
  const client = createAuthClient(fetcher);

  await assert.rejects(
    () => client.getCurrentUser(),
    (error: unknown) => {
      assertAuthError(error, 'unavailable');
      return true;
    },
  );
});

test('getCurrentUser rechaza un JSON con forma inválida', async () => {
  const { fetcher } = createFetcher(() =>
    jsonResponse({ ...USER, roles: ['TUTOR', 7] }, 200),
  );
  const client = createAuthClient(fetcher);

  await assert.rejects(
    () => client.getCurrentUser(),
    (error: unknown) => {
      assertAuthError(error, 'invalid-response');
      return true;
    },
  );
});

test('getCurrentUser convierte los fallos de red en AuthError', async () => {
  const { fetcher } = createFetcher(() => {
    throw new TypeError('fetch failed');
  });
  const client = createAuthClient(fetcher);

  await assert.rejects(
    () => client.getCurrentUser(),
    (error: unknown) => {
      const authError = assertAuthError(error, 'network');
      assert.ok(!authError.message.includes('fetch failed'));
      return true;
    },
  );
});

test('signIn obtiene el CSRF y envía el formulario de credenciales', async () => {
  const { fetcher, calls } = createFetcher((url) => {
    if (url === '/api/auth/csrf') return jsonResponse({ csrfToken: 'csrf-123' });
    if (url === '/api/auth/callback/credentials') return redirectResponse('http://localhost:5173/panel');
    if (url === '/api/me') return jsonResponse(USER);
    throw new Error(`URL inesperada: ${url}`);
  });
  const client = createAuthClient(fetcher);

  const user = await client.signIn({ email: 'ana@example.test', password: 'Clave-Prueba-123' });

  assert.deepEqual(user, USER);
  assert.deepEqual(
    calls.map((call) => call.url),
    ['/api/auth/csrf', '/api/auth/callback/credentials', '/api/me'],
  );

  const [, loginCall] = calls;
  assert.ok(loginCall);
  assert.equal(loginCall.init.method, 'POST');
  assert.equal(loginCall.init.credentials, 'same-origin');
  assert.equal(loginCall.init.cache, 'no-store');
  assert.notEqual(loginCall.init.redirect, 'manual');
  assert.equal(new Headers(loginCall.init.headers).get('content-type'), 'application/x-www-form-urlencoded');
  assert.equal(
    formBody(loginCall.init).toString(),
    'csrfToken=csrf-123&email=ana%40example.test&password=Clave-Prueba-123&callbackUrl=%2Fpanel',
  );

  const meCall = calls[2];
  assert.ok(meCall);
  assert.equal(meCall.init.credentials, 'same-origin');
  assert.equal(meCall.init.cache, 'no-store');
});

test('signIn usa el mismo mensaje genérico para error de Auth.js y para verificación fallida', async () => {
  const rejectedByAuthJs = createFetcher((url) => {
    if (url === '/api/auth/csrf') return jsonResponse({ csrfToken: 'csrf-123' });
    if (url === '/api/auth/callback/credentials') {
      return redirectResponse('http://localhost:5173/api/auth/signin?error=CredentialsSignin&code=credentials');
    }
    throw new Error(`URL inesperada: ${url}`);
  });

  let firstError: AuthError | undefined;
  await assert.rejects(
    () => createAuthClient(rejectedByAuthJs.fetcher).signIn({ email: 'ana@example.test', password: 'mala' }),
    (error: unknown) => {
      firstError = assertAuthError(error, 'invalid-credentials');
      return true;
    },
  );

  const rejectedBySession = createFetcher((url) => {
    if (url === '/api/auth/csrf') return jsonResponse({ csrfToken: 'csrf-456' });
    if (url === '/api/auth/callback/credentials') return redirectResponse('http://localhost:5173/panel');
    if (url === '/api/me') return jsonResponse({ message: 'Sesión no válida o expirada.' }, 401);
    throw new Error(`URL inesperada: ${url}`);
  });

  let secondError: AuthError | undefined;
  await assert.rejects(
    () => createAuthClient(rejectedBySession.fetcher).signIn({ email: 'nadie@example.test', password: 'mala' }),
    (error: unknown) => {
      secondError = assertAuthError(error, 'invalid-credentials');
      return true;
    },
  );

  assert.ok(firstError && secondError);
  assert.equal(firstError.message, secondError.message);
  assert.ok(!firstError.message.includes('ana@example.test'));
  assert.ok(!firstError.message.includes('mala'));
  assert.ok(!firstError.message.includes('CredentialsSignin'));
});

test('signIn no envía el formulario si el token CSRF falta o no es válido', async () => {
  const { fetcher, calls } = createFetcher(() => jsonResponse({ csrfToken: '' }));
  const client = createAuthClient(fetcher);

  await assert.rejects(
    () => client.signIn({ email: 'ana@example.test', password: 'Clave-Prueba-123' }),
    (error: unknown) => {
      assertAuthError(error, 'invalid-response');
      return true;
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, '/api/auth/csrf');
});

test('signOut obtiene un CSRF nuevo, cierra sesión y verifica /api/me', async () => {
  const { fetcher, calls } = createFetcher((url) => {
    if (url === '/api/auth/csrf') return jsonResponse({ csrfToken: 'csrf-logout' });
    if (url === '/api/auth/signout') return redirectResponse('http://localhost:5173/login');
    if (url === '/api/me') return jsonResponse({ message: 'Sesión no válida o expirada.' }, 401);
    throw new Error(`URL inesperada: ${url}`);
  });
  const client = createAuthClient(fetcher);

  await client.signOut();

  assert.deepEqual(
    calls.map((call) => call.url),
    ['/api/auth/csrf', '/api/auth/signout', '/api/me'],
  );

  const logoutCall = calls[1];
  assert.ok(logoutCall);
  assert.equal(logoutCall.init.method, 'POST');
  assert.equal(logoutCall.init.credentials, 'same-origin');
  assert.equal(logoutCall.init.cache, 'no-store');
  assert.equal(new Headers(logoutCall.init.headers).get('content-type'), 'application/x-www-form-urlencoded');
  assert.equal(formBody(logoutCall.init).toString(), 'csrfToken=csrf-logout&callbackUrl=%2Flogin');
});

test('signOut falla y conserva la sesión si /api/me sigue devolviendo un usuario', async () => {
  const { fetcher } = createFetcher((url) => {
    if (url === '/api/auth/csrf') return jsonResponse({ csrfToken: 'csrf-logout' });
    if (url === '/api/auth/signout') return redirectResponse('http://localhost:5173/login');
    if (url === '/api/me') return jsonResponse(USER);
    throw new Error(`URL inesperada: ${url}`);
  });
  const client = createAuthClient(fetcher);

  await assert.rejects(
    () => client.signOut(),
    (error: unknown) => {
      const authError = assertAuthError(error, 'signout-failed');
      assert.ok(!authError.message.includes(USER.email));
      return true;
    },
  );
});

test('signOut no envía el formulario si el token CSRF no es válido', async () => {
  const { fetcher, calls } = createFetcher(() => jsonResponse({ csrfToken: 42 }));
  const client = createAuthClient(fetcher);

  await assert.rejects(
    () => client.signOut(),
    (error: unknown) => {
      assertAuthError(error, 'invalid-response');
      return true;
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, '/api/auth/csrf');
});

test('getProviders detecta Google solo si el backend lo publica', async () => {
  const { fetcher, calls } = createFetcher(() => jsonResponse({
    credentials: { id: 'credentials', type: 'credentials' },
    google: { id: 'google', type: 'oidc' },
  }));
  assert.deepEqual(await createAuthClient(fetcher).getProviders(), { credentials: true, google: true });
  assert.equal(calls[0]?.url, '/api/auth/providers');

  const onlyCredentials = createFetcher(() => jsonResponse({ credentials: { id: 'credentials' } }));
  assert.deepEqual(await createAuthClient(onlyCredentials.fetcher).getProviders(), { credentials: true, google: false });
});

test('getProviders rechaza una caída del servicio', async () => {
  const { fetcher } = createFetcher(() => jsonResponse({}, 503));
  await assert.rejects(() => createAuthClient(fetcher).getProviders(), (error) => {
    assertAuthError(error, 'unavailable');
    return true;
  });
});

test('signInWithGoogle pide CSRF y envía un formulario real a Auth.js', async () => {
  const { fetcher, calls } = createFetcher(() => jsonResponse({ csrfToken: 'csrf-google' }));
  const submitted: { action: string; fields: Record<string, string> }[] = [];
  const client = createAuthClient(fetcher, (action, fields) => submitted.push({ action, fields }));

  await client.signInWithGoogle();

  assert.equal(calls[0]?.url, '/api/auth/csrf');
  assert.deepEqual(submitted, [{
    action: '/api/auth/signin/google',
    fields: { csrfToken: 'csrf-google', callbackUrl: '/panel' },
  }]);
});

test('signInWithGoogle no navega si no hay CSRF', async () => {
  const { fetcher } = createFetcher(() => jsonResponse({}, 500));
  let navigated = false;
  const client = createAuthClient(fetcher, () => { navigated = true; });
  await assert.rejects(() => client.signInWithGoogle());
  assert.equal(navigated, false);
});

test('authErrorFromUrl traduce los códigos de Auth.js a mensajes seguros', () => {
  assert.equal(authErrorFromUrl(''), null);
  assert.equal(authErrorFromUrl('?foo=bar'), null);
  assertAuthError(authErrorFromUrl('?error=AccessDenied'), 'google-denied');
  assertAuthError(authErrorFromUrl('?error=CredentialsSignin'), 'invalid-credentials');
  assertAuthError(authErrorFromUrl('?error=Configuration'), 'unavailable');
});
