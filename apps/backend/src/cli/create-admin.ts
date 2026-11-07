/**
 * Crea un usuario Administrador desde la terminal (p. ej. el primero del sistema).
 *
 * Los datos se leen de variables de entorno para que la contraseña no quede en
 * el historial de la terminal ni en la lista de procesos:
 *   ADMIN_EMAIL, ADMIN_FULL_NAME, ADMIN_PASSWORD
 *
 * Uso: pnpm --filter @gestor-semilleros/backend admin:create
 */
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { parseCreateUser, UsersService } from '../modules/users';

async function main(): Promise<void> {
  const parsed = parseCreateUser({
    email: process.env.ADMIN_EMAIL,
    fullName: process.env.ADMIN_FULL_NAME,
    password: process.env.ADMIN_PASSWORD,
    roles: ['ADMIN'],
  });
  if (!parsed.ok) {
    console.error('Datos inválidos (ADMIN_EMAIL, ADMIN_FULL_NAME, ADMIN_PASSWORD):');
    for (const error of parsed.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  if (!parsed.value.password) {
    console.error('ADMIN_PASSWORD es obligatoria para crear un administrador.');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const user = await app.get(UsersService).create(parsed.value);
    console.log(`Administrador creado: ${user.email} (${user.id})`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
