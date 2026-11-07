import { defineConfig, devices } from '@playwright/test';
import { backendEnv } from './e2e/backend-env.ts';

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
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm db:deploy && pnpm db:seed && node dist/main',
      cwd: '../backend',
      env: backendEnv(),
      url: 'http://localhost:3000/api/auth/providers',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'pnpm exec vite --host localhost',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
