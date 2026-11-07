/**
 * Siembra datos de desarrollo: un usuario de cada tipo y un proyecto demo (ver seed-database.ts).
 * Es idempotente: se puede ejecutar varias veces. Rechaza ejecutarse con NODE_ENV=production.
 *
 * La contraseña común se lee de SEED_PASSWORD (8–256 caracteres) y nunca se imprime.
 *
 * Uso: SEED_PASSWORD='...' pnpm db:seed
 */
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { PasswordService } from '../modules/auth';
import { parseSeedPassword, seedDatabase } from './seed-database';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('La seed de desarrollo no puede ejecutarse con NODE_ENV=production.');
    process.exitCode = 1;
    return;
  }
  const password = parseSeedPassword(process.env.SEED_PASSWORD);
  if (!password.ok) {
    console.error(password.error);
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const summary = await seedDatabase(app.get(PrismaService), app.get(PasswordService), password.value);
    console.log('Seed completada. Usuarios disponibles (todos con la contraseña de SEED_PASSWORD):');
    console.table(summary.users.map((u) => ({ Correo: u.email, Rol: u.roles })));
    console.log(`Área: ${summary.area} | Facultad: ${summary.faculty} | Proyecto: ${summary.project}`);
  } catch (error) {
    console.error('La seed falló:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
