import type { AppEnv } from '../../../config/env';
import { loadNotificationsConfig } from '../../../config/notifications.config';
import type { AuthUser } from '../models/auth-user';
import { AUTH_BASE_PATH, createAuthConfig } from './auth-config.factory';
import type { AuthService } from './auth.service';

const env: AppEnv = {
  port: 3000,
  databaseUrl: 'postgresql://x',
  authSecret: 's'.repeat(32),
  authTrustHost: true,
  sessionMaxAge: 3600,
  google: null,
  notifications: loadNotificationsConfig({}),
};

const dbUser: AuthUser = { id: 'interno-1', email: 'ana@example.test', fullName: 'Ana', roles: ['STUDENT'] };

function fakeAuth(googleUser: AuthUser | null = dbUser) {
  return {
    authenticateWithPassword: jest.fn(),
    resolveGoogleUser: jest.fn(async () => googleUser),
  } as unknown as AuthService & { resolveGoogleUser: jest.Mock };
}

/** Llama un callback de Auth.js sin depender de su firma completa. */
function call<T>(fn: unknown, args: Record<string, unknown>): Promise<T> {
  return (fn as (a: Record<string, unknown>) => Promise<T>)(args);
}

describe('createAuthConfig', () => {
  it('usa sesión JWT, la ruta base y la duración configuradas', () => {
    const config = createAuthConfig(env, fakeAuth());
    expect(config.basePath).toBe(AUTH_BASE_PATH);
    expect(config.session).toEqual({ strategy: 'jwt', maxAge: 3600 });
  });

  it('solo registra Google si está configurado', () => {
    const ids = (e: AppEnv) => createAuthConfig(e, fakeAuth()).providers.map((p) => (typeof p === 'function' ? p() : p).id);
    expect(ids(env)).toEqual(['credentials']);
    expect(ids({ ...env, google: { clientId: 'id', clientSecret: 'sec' } })).toEqual(['credentials', 'google']);
  });

  describe('callbacks', () => {
    it('signIn rechaza cuentas de Google no registradas', async () => {
      const config = createAuthConfig(env, fakeAuth(null));
      await expect(call(config.callbacks!.signIn, { account: { provider: 'google' }, profile: {} })).resolves.toBe(false);
    });

    it('signIn acepta cuentas de Google registradas y credenciales ya validadas', async () => {
      const config = createAuthConfig(env, fakeAuth());
      await expect(call(config.callbacks!.signIn, { account: { provider: 'google' }, profile: {} })).resolves.toBe(true);
      await expect(call(config.callbacks!.signIn, { account: { provider: 'credentials' } })).resolves.toBe(true);
    });

    it('jwt guarda el id interno, no el id de Google', async () => {
      const config = createAuthConfig(env, fakeAuth());
      const token = await call<{ sub: string }>(config.callbacks!.jwt, {
        token: { sub: 'google-sub-123' },
        user: { id: 'google-sub-123' },
        account: { provider: 'google' },
        profile: { email: dbUser.email, email_verified: true },
      });
      expect(token.sub).toBe('interno-1');
    });

    it('jwt conserva el token en peticiones posteriores al inicio de sesión', async () => {
      const auth = fakeAuth();
      const config = createAuthConfig(env, auth);
      const token = await call<{ sub: string }>(config.callbacks!.jwt, { token: { sub: 'interno-1' } });
      expect(token.sub).toBe('interno-1');
      expect(auth.resolveGoogleUser).not.toHaveBeenCalled();
    });

    it('session expone el id del usuario', async () => {
      const config = createAuthConfig(env, fakeAuth());
      const session = await call<{ user: { id: string } }>(config.callbacks!.session, {
        session: { user: {} },
        token: { sub: 'interno-1' },
      });
      expect(session.user.id).toBe('interno-1');
    });
  });
});
