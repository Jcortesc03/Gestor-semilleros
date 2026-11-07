// Local browser fixture only. Never load this module from the application.
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let authenticated = process.env.FIXTURE_SESSION === 'authenticated';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'investigacion@example.test',
  fullName: 'Persona de prueba',
  roles: ['TUTOR'],
};

const api = http.createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'GET' && pathname === '/api/me') {
    response.writeHead(authenticated ? 200 : 401, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(authenticated ? user : { message: 'Sesión no válida o expirada.' }));
    return;
  }
  if (request.method === 'GET' && pathname === '/api/auth/csrf') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ csrfToken: 'synthetic-fixture-csrf' }));
    return;
  }
  if (request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    const fields = new URLSearchParams(body);
    if (fields.get('csrfToken') !== 'synthetic-fixture-csrf') {
      response.writeHead(403).end();
      return;
    }
    if (pathname === '/api/auth/callback/credentials') {
      const accepted = fields.get('email') === user.email && fields.get('password') === 'synthetic-password';
      authenticated = accepted;
      response.writeHead(302, { Location: accepted ? '/panel' : '/login?error=CredentialsSignin&code=credentials' });
      response.end();
      return;
    }
    if (pathname === '/api/auth/signout') {
      authenticated = false;
      response.writeHead(302, { Location: '/login' }).end();
      return;
    }
  }
  response.writeHead(404).end();
});

await new Promise((resolve, reject) => {
  api.once('error', reject);
  api.listen(0, '127.0.0.1', resolve);
});
const address = api.address();
if (!address || typeof address === 'string') throw new Error('Fixture API did not bind a TCP port.');

const web = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${address.port}`, changeOrigin: false } },
  },
});
await web.listen();
console.log(`MOCK API ONLY — http://127.0.0.1:5180 (${authenticated ? 'authenticated' : 'anonymous'})`);

async function close() {
  await web.close();
  api.close();
}
process.once('SIGTERM', close);
process.once('SIGINT', close);
