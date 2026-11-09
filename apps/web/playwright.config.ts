import { defineConfig, devices } from '@playwright/test';
import { E2E_BACKEND_PORT, E2E_WEB_PORT, backendEnv } from './e2e/backend-env.ts';

/**
 * E2E contra el backend real y una base PostgreSQL aislada (`semilleros_web_e2e_test`).
 * Requiere `pnpm db:up`. Aplica migraciones y la seed de desarrollo con una contraseña
 * sintética antes de levantar el backend; nunca usa la base de desarrollo.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${E2E_WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm db:deploy && pnpm db:seed && node dist/main',
      cwd: '../backend',
      env: backendEnv(),
      url: `http://localhost:${E2E_BACKEND_PORT}/api/auth/providers`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `pnpm exec vite --host localhost --port ${E2E_WEB_PORT} --strictPort`,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${E2E_BACKEND_PORT}` },
      url: `http://localhost:${E2E_WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
