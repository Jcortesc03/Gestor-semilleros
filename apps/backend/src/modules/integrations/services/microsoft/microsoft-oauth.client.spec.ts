import { createHash } from 'node:crypto';
import type { MicrosoftConfig } from '../../../../config/microsoft.config.types';
import { MicrosoftOAuthClient, createPkcePair } from './microsoft-oauth.client';
import { MICROSOFT_SCOPES, MicrosoftAuthError } from './microsoft.types';

const config: MicrosoftConfig = {
  tenantId: 'organizations',
  clientId: 'client-id-prueba',
  clientSecret: 'secreto-super-privado',
  redirectUri: 'http://localhost:3000/api/integrations/microsoft/callback',
  tokenEncryptionKey: Buffer.alloc(32, 1),
  linkRedirectUrl: null,
};

const TOKEN_URL = 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createPkcePair', () => {
  it('genera un verificador base64url de 43 a 128 caracteres', () => {
    const { verifier } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it('el reto es el sha256 del verificador en base64url (S256)', () => {
    const { verifier, challenge } = createPkcePair();
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });

  it('genera pares distintos en cada llamada', () => {
    expect(createPkcePair().verifier).not.toBe(createPkcePair().verifier);
  });
});

describe('MicrosoftOAuthClient', () => {
  const fetchFn = jest.fn();
  const client = new MicrosoftOAuthClient(config, fetchFn as unknown as typeof fetch);

  beforeEach(() => {
    fetchFn.mockReset();
  });

  it('arma la URL de autorización con todos los parámetros', () => {
    const url = new URL(client.authorizeUrl('estado-1', 'reto-1'));
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
    );
    const p = url.searchParams;
    expect(p.get('client_id')).toBe('client-id-prueba');
    expect(p.get('response_type')).toBe('code');
    expect(p.get('redirect_uri')).toBe(config.redirectUri);
    expect(p.get('response_mode')).toBe('query');
    expect(p.get('scope')).toBe(MICROSOFT_SCOPES);
    expect(p.get('state')).toBe('estado-1');
    expect(p.get('code_challenge')).toBe('reto-1');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('prompt')).toBe('select_account');
    expect(url.search).not.toContain('secreto-super-privado');
  });

  it('intercambia el código con el cuerpo form-urlencoded esperado', async () => {
    fetchFn.mockResolvedValue(
      jsonResponse({
        access_token: 'acceso-1',
        refresh_token: 'refresco-1',
        expires_in: 3600,
        scope: 'User.Read Calendars.ReadWrite',
        id_token: 'a.b.c',
      }),
    );
    const before = Date.now();
    const tokens = await client.exchangeCode('codigo-1', 'verificador-1');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TOKEN_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(body)).toEqual({
      client_id: 'client-id-prueba',
      client_secret: 'secreto-super-privado',
      grant_type: 'authorization_code',
      code: 'codigo-1',
      redirect_uri: config.redirectUri,
      code_verifier: 'verificador-1',
      scope: MICROSOFT_SCOPES,
    });

    expect(tokens.accessToken).toBe('acceso-1');
    expect(tokens.refreshToken).toBe('refresco-1');
    expect(tokens.scopes).toBe('User.Read Calendars.ReadWrite');
    expect(tokens.idToken).toBe('a.b.c');
    expect(tokens.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 3600_000);
    expect(tokens.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 3600_000);
  });

  it('renueva con refresh_token y usa el nuevo si Microsoft lo rota', async () => {
    fetchFn.mockResolvedValue(
      jsonResponse({ access_token: 'acceso-2', refresh_token: 'refresco-nuevo', expires_in: 60 }),
    );
    const tokens = await client.refresh('refresco-viejo');

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TOKEN_URL);
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      client_id: 'client-id-prueba',
      client_secret: 'secreto-super-privado',
      grant_type: 'refresh_token',
      refresh_token: 'refresco-viejo',
      scope: MICROSOFT_SCOPES,
    });
    expect(tokens.refreshToken).toBe('refresco-nuevo');
  });

  it('conserva el refresh token anterior si la respuesta no trae uno', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ access_token: 'acceso-3', expires_in: 60 }));
    const tokens = await client.refresh('refresco-viejo');
    expect(tokens.refreshToken).toBe('refresco-viejo');
    expect(tokens.accessToken).toBe('acceso-3');
  });

  it.each([
    ['sin access_token', { expires_in: 60, refresh_token: 'r' }],
    ['sin expires_in', { access_token: 'a', refresh_token: 'r' }],
  ])('lanza MicrosoftAuthError si la respuesta viene %s', async (_nombre, payload) => {
    fetchFn.mockResolvedValue(jsonResponse(payload));
    const error = await client.exchangeCode('c', 'v').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MicrosoftAuthError);
    expect((error as MicrosoftAuthError).invalidGrant).toBe(false);
  });

  it('marca invalid_grant y no filtra secretos ni tokens en el mensaje', async () => {
    fetchFn.mockResolvedValue(
      jsonResponse(
        { error: 'invalid_grant', error_description: 'AADSTS70000 token refresco-secreto' },
        400,
      ),
    );
    const error = (await client.refresh('refresco-secreto').catch((e: unknown) => e)) as MicrosoftAuthError;
    expect(error).toBeInstanceOf(MicrosoftAuthError);
    expect(error.invalidGrant).toBe(true);
    expect(error.message).toContain('invalid_grant');
    expect(error.message).not.toContain('secreto-super-privado');
    expect(error.message).not.toContain('refresco-secreto');
  });

  it('otros errores HTTP no son invalid_grant y conservan el código', async () => {
    fetchFn.mockResolvedValue(jsonResponse({ error: 'invalid_client' }, 401));
    const error = (await client.exchangeCode('codigo-x', 'v').catch((e: unknown) => e)) as MicrosoftAuthError;
    expect(error.invalidGrant).toBe(false);
    expect(error.message).toContain('invalid_client');
    expect(error.message).not.toContain('codigo-x');
    expect(error.message).not.toContain('secreto-super-privado');
  });

  it('tolera un error HTTP con cuerpo no JSON', async () => {
    fetchFn.mockResolvedValue(new Response('<html>caído</html>', { status: 502 }));
    const error = await client.exchangeCode('c', 'v').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MicrosoftAuthError);
    expect((error as MicrosoftAuthError).invalidGrant).toBe(false);
  });

  it('convierte un fallo de red en un mensaje genérico', async () => {
    fetchFn.mockRejectedValue(new Error('ECONNRESET secreto-super-privado'));
    const error = (await client.exchangeCode('c', 'v').catch((e: unknown) => e)) as MicrosoftAuthError;
    expect(error).toBeInstanceOf(MicrosoftAuthError);
    expect(error.message).toBe('No se pudo contactar a Microsoft.');
    expect(error.invalidGrant).toBe(false);
  });
});
