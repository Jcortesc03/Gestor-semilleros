import { Logger } from '@nestjs/common';
import type { ExpressAuthConfig } from '@auth/express';
import Credentials from '@auth/core/providers/credentials';
import Google from '@auth/core/providers/google';
import type { Provider } from '@auth/core/providers';
import type { AppEnv } from '../../../config/env';
import type { GoogleProfile } from '../models/auth-user';
import type { AuthService } from './auth.service';

/** Ruta base de Auth.js. Debe coincidir con el montaje en app.setup.ts. */
export const AUTH_BASE_PATH = '/api/auth';
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

/** Errores esperados en el uso normal (credenciales erróneas, CSRF ausente…). */
/** Ruta de la web que muestra los errores de inicio de sesión (apps/web lee `?error=`). */
export const AUTH_ERROR_PAGE = '/login';

const EXPECTED_AUTH_ERRORS = new Set(['CredentialsSignin', 'MissingCSRF', 'AccessDenied']);
const logger = new Logger('Auth');

/**
 * Configuración de Auth.js (único mecanismo de autenticación, AGENTS.md §6).
 * Sesión JWT en cookie; el token solo guarda el id del usuario y los datos
 * actuales (estado y roles) se recargan en cada petición protegida.
 */
export function createAuthConfig(env: AppEnv, auth: AuthService): ExpressAuthConfig {
  const providers: Provider[] = [
    Credentials({
      credentials: {
        email: { label: 'Correo', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      authorize: async (credentials) => {
        const user = await auth.authenticateWithPassword(credentials);
        return user ? { id: user.id, email: user.email, name: user.fullName } : null;
      },
    }),
  ];

  if (env.google) {
    providers.push(Google({ clientId: env.google.clientId, clientSecret: env.google.clientSecret }));
  }

  return {
    basePath: AUTH_BASE_PATH,
    // Los errores de OAuth (p. ej. AccessDenied con Google) vuelven a la web con `?error=`
    // en lugar de la página de error propia de Auth.js. El fallo de credenciales no cambia.
    pages: { error: AUTH_ERROR_PAGE },
    secret: env.authSecret,
    trustHost: env.authTrustHost,
    session: { strategy: 'jwt', maxAge: env.sessionMaxAge },
    logger: {
      error(error) {
        if (EXPECTED_AUTH_ERRORS.has(error.name)) logger.warn(`Inicio de sesión rechazado: ${error.name}`);
        else logger.error(error.message, error.stack);
      },
      warn(code) {
        logger.warn(code);
      },
    },
    providers,
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider === 'google') {
          return (await auth.resolveGoogleUser(profile as GoogleProfile)) !== null;
        }
        return true;
      },
      async jwt({ token, user, account, profile }) {
        if (account && user) {
          // Inicio de sesión: el `sub` debe ser el id interno, no el de Google.
          const resolved =
            account.provider === 'google' ? await auth.resolveGoogleUser(profile as GoogleProfile) : null;
          token.sub = resolved?.id ?? user.id;
        }
        return token;
      },
      async session({ session, token }) {
        if (token.sub) session.user.id = token.sub;
        return session;
      },
    },
  };
}
