import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

/** Contraseña sintética de la seed en la base E2E aislada. No es un secreto real. */
/** Puertos propios del E2E, distintos de `pnpm dev` (3000 y 5173), para poder ejecutarlos a la vez. */
export const E2E_BACKEND_PORT = 3100;
export const E2E_WEB_PORT = 5174;

export const E2E_SEED_PASSWORD = 'semilla-e2e-2026';
export const E2E_DATABASE_NAME = 'semilleros_web_e2e_test';

const DEFAULT_TEST_DATABASE_URL = 'postgresql://semilleros:semilleros@localhost:5432/semilleros_test?schema=public';

/**
 * URL de una base exclusiva para el E2E web: misma instancia que `TEST_DATABASE_URL`
 * del backend, pero otra base, para no interferir con `pnpm test:e2e` del backend
 * ni con la base de desarrollo.
 */
export function e2eDatabaseUrl(): string {
  const envFile = resolve(import.meta.dirname, '../../backend/.env');
  const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  const base = process.env.TEST_DATABASE_URL ?? fileEnv.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const url = new URL(base);
  url.pathname = `/${E2E_DATABASE_NAME}`;
  return url.toString();
}

/** Entorno controlado del backend durante el E2E (sin envíos reales ni OAuth real). */
export function backendEnv(): Record<string, string> {
  return {
    NODE_ENV: 'development',
    PORT: String(E2E_BACKEND_PORT),
    DATABASE_URL: e2eDatabaseUrl(),
    SEED_PASSWORD: E2E_SEED_PASSWORD,
    AUTH_SECRET: 'secreto-e2e-web-no-usar-en-produccion',
    AUTH_TRUST_HOST: 'true',
    AUTH_SESSION_MAX_AGE: '3600',
    // Credenciales ficticias: solo registran el proveedor; la prueba intercepta Google.
    AUTH_GOOGLE_ID: 'google-client-id-e2e',
    AUTH_GOOGLE_SECRET: 'google-client-secret-e2e',
    NOTIFICATIONS_AUTO_DISPATCH: 'false',
    NOTIFICATIONS_EMAIL_TRANSPORT: 'log',
    NOTIFICATIONS_WHATSAPP_TRANSPORT: 'log',
    MICROSOFT_CLIENT_ID: 'client-id-e2e',
    MICROSOFT_CLIENT_SECRET: 'client-secret-e2e',
    MICROSOFT_REDIRECT_URI: `http://localhost:${E2E_WEB_PORT}/api/integrations/microsoft/callback`,
    MICROSOFT_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    MEETINGS_TIME_ZONE: 'America/Bogota',
    // Documentos (ADR 0013): RustFS de docker/compose.yaml con un bucket exclusivo del E2E.
    S3_BUCKET: 'semilleros-web-e2e',
    S3_REGION: 'us-east-1',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_ACCESS_KEY_ID: 'semilleros',
    S3_SECRET_ACCESS_KEY: 'semilleros-local',
    S3_FORCE_PATH_STYLE: 'true',
    S3_CREATE_BUCKET: 'true',
  };
}
