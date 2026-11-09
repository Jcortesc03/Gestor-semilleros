import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ExpressAuth, type ExpressAuthConfig } from '@auth/express';
import { APP_ENV, type AppEnv } from './config/env';
import { AUTH_BASE_PATH, AUTH_CONFIG } from './modules/auth';

/**
 * Configuración común de la aplicación, compartida por main.ts y las pruebas e2e.
 *
 * Rutas de Auth.js bajo /api/auth: csrf, providers, signin/:provider,
 * callback/:provider, session y signout.
 */
export function configureApp(app: INestApplication): INestApplication {
  // Detrás de un proxy inverso de confianza (AUTH_TRUST_HOST=true), Express debe leer
  // X-Forwarded-Proto/Host: @auth/express arma la URL base con req.protocol, y sin esto
  // las redirecciones salen como http:// aunque el usuario entre por https (p. ej. Railway).
  if (app.get<AppEnv>(APP_ENV).authTrustHost) {
    (app as NestExpressApplication).set('trust proxy', true);
  }
  app.setGlobalPrefix('api');
  const authConfig = app.get<ExpressAuthConfig>(AUTH_CONFIG);
  app.use(AUTH_BASE_PATH, ExpressAuth(authConfig));
  return app;
}
