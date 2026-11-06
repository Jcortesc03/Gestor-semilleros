import { config } from 'dotenv';

const DEFAULT_TEST_DATABASE_URL = 'postgresql://semilleros:semilleros@localhost:5432/semilleros_test?schema=public';

/** URL de la base de datos de pruebas. Debe terminar en `_test` para evitar borrar otra base. */
export function testDatabaseUrl(): string {
  config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL?.trim() || DEFAULT_TEST_DATABASE_URL;
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en "_test" (recibido: "${dbName}").`);
  }
  return url;
}
