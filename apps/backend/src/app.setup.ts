import type { INestApplication } from '@nestjs/common';
import { ExpressAuth, type ExpressAuthConfig } from '@auth/express';
import { AUTH_BASE_PATH, AUTH_CONFIG } from './modules/auth';

/**
 * Configuración común de la aplicación, compartida por main.ts y las pruebas e2e.
 *
 * Rutas de Auth.js bajo /api/auth: csrf, providers, signin/:provider,
 * callback/:provider, session y signout.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  const authConfig = app.get<ExpressAuthConfig>(AUTH_CONFIG);
  app.use(AUTH_BASE_PATH, ExpressAuth(authConfig));
  return app;
}
