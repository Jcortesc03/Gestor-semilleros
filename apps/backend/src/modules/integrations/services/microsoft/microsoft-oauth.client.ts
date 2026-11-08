import { createHash, randomBytes } from 'node:crypto';
import type { MicrosoftConfig } from '../../../../config/microsoft.config.types';
import {
  MICROSOFT_SCOPES,
  MicrosoftAuthError,
  type MicrosoftTokens,
} from './microsoft.types';

const AUTHORIZE_BASE_URL = 'https://login.microsoftonline.com';
const TOKEN_TIMEOUT_MS = 10_000;

interface TokenPayload {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  error?: unknown;
  error_description?: unknown;
}

/**
 * Genera el par PKCE (S256): un verificador aleatorio de 32 bytes en base64url
 * y su reto, que es el sha256 del verificador en base64url.
 */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readExpiresIn(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

export class MicrosoftOAuthClient {
  constructor(
    private readonly config: MicrosoftConfig,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  authorizeUrl(state: string, codeChallenge: string): string {
    const url = new URL(
      `${AUTHORIZE_BASE_URL}/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/authorize`,
    );
    const params = url.searchParams;
    params.set('client_id', this.config.clientId);
    params.set('response_type', 'code');
    params.set('redirect_uri', this.config.redirectUri);
    params.set('response_mode', 'query');
    params.set('scope', MICROSOFT_SCOPES);
    params.set('state', state);
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
    params.set('prompt', 'select_account');
    return url.toString();
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<MicrosoftTokens> {
    const params = new URLSearchParams();
    params.set('client_id', this.config.clientId);
    params.set('client_secret', this.config.clientSecret);
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', this.config.redirectUri);
    params.set('code_verifier', codeVerifier);
    params.set('scope', MICROSOFT_SCOPES);
    return this.requestTokens(params, null);
  }

  async refresh(refreshToken: string): Promise<MicrosoftTokens> {
    const params = new URLSearchParams();
    params.set('client_id', this.config.clientId);
    params.set('client_secret', this.config.clientSecret);
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', refreshToken);
    params.set('scope', MICROSOFT_SCOPES);
    return this.requestTokens(params, refreshToken);
  }

  private async requestTokens(
    body: URLSearchParams,
    previousRefreshToken: string | null,
  ): Promise<MicrosoftTokens> {
    const url = `${AUTHORIZE_BASE_URL}/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
      });
    } catch {
      throw new MicrosoftAuthError('No se pudo contactar a Microsoft.');
    }

    const payload = readJsonObject(await this.readJson(response));

    if (!response.ok) {
      const errorCode = readNonEmptyString(payload?.error) ?? 'desconocido';
      throw new MicrosoftAuthError(
        `Microsoft rechazó la solicitud de tokens (${errorCode}).`,
        errorCode === 'invalid_grant',
      );
    }

    const accessToken = readNonEmptyString(payload?.access_token);
    const expiresIn = readExpiresIn(payload?.expires_in);
    if (accessToken === null || expiresIn === null) {
      throw new MicrosoftAuthError('Microsoft devolvió una respuesta de tokens incompleta.');
    }

    const issuedRefreshToken =
      readNonEmptyString(payload?.refresh_token) ?? previousRefreshToken;
    if (issuedRefreshToken === null) {
      throw new MicrosoftAuthError('Microsoft devolvió una respuesta de tokens incompleta.');
    }

    return {
      accessToken,
      refreshToken: issuedRefreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      scopes: readNonEmptyString(payload?.scope) ?? MICROSOFT_SCOPES,
    };
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}
