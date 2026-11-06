import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { testDatabaseUrl } from './test-env';

/** Crea la base de pruebas si no existe y aplica las migraciones pendientes. */
export default function globalSetup(): void {
  const prismaBin = resolve(__dirname, '../node_modules/.bin/prisma');
  execFileSync(prismaBin, ['migrate', 'deploy'], {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'pipe',
  });
}
