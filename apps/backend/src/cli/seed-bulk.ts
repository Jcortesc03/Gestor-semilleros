/**
 * Seed masiva de desarrollo: miles de usuarios, proyectos, actividades, adjuntos y reuniones ficticios
 * para probar la analítica (ADR 0016). Rechaza ejecutarse con NODE_ENV=production.
 *
 * Variables:
 *   SEED_PASSWORD     (obligatoria) contraseña común de todos los usuarios generados; nunca se imprime.
 *   SEED_BULK_SCALE   (opcional, 1–10, por defecto 1) multiplicador del volumen.
 *   SEED_BULK_RESET=1 (opcional) borra antes solo los datos de una seed masiva anterior.
 *
 * Uso: SEED_PASSWORD='...' pnpm db:seed:bulk
 */
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { PasswordService } from '../modules/auth';
import { BULK_EMAIL_DOMAIN, MAX_BULK_SCALE, generateBulkData, parseBulkScale } from './bulk-seed-data';
import { hasBulkData, insertBulkData, removeBulkData } from './bulk-seed-database';
import { parseSeedPassword } from './seed-database';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('La seed masiva de desarrollo no puede ejecutarse con NODE_ENV=production.');
    process.exitCode = 1;
    return;
  }
  const password = parseSeedPassword(process.env.SEED_PASSWORD);
  if (!password.ok) {
    console.error(password.error);
    process.exitCode = 1;
    return;
  }
  const scale = parseBulkScale(process.env.SEED_BULK_SCALE);
  if (scale === null) {
    console.error(`SEED_BULK_SCALE debe ser un entero entre 1 y ${MAX_BULK_SCALE}.`);
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const prisma = app.get(PrismaService);
    if (await hasBulkData(prisma)) {
      if (process.env.SEED_BULK_RESET !== '1') {
        console.error('Ya existen datos de la seed masiva. Ejecuta con SEED_BULK_RESET=1 para reemplazarlos (solo se borran esos datos).');
        process.exitCode = 1;
        return;
      }
      console.log('Borrando la seed masiva anterior…');
      await removeBulkData(prisma);
    }

    const started = Date.now();
    const data = generateBulkData({ scale, now: new Date() });
    const passwordHash = await app.get(PasswordService).hash(password.value);
    const counts = await insertBulkData(prisma, data, passwordHash);

    console.log(`Seed masiva completada en ${((Date.now() - started) / 1000).toFixed(1)} s (escala ${scale}).`);
    console.table(counts);
    const sample = (role: string) => data.users.find((u) => u.roles.includes(role as never) && u.status === 'ACTIVE')?.email;
    console.log(`Usuarios @${BULK_EMAIL_DOMAIN} con la contraseña de SEED_PASSWORD. Ejemplos:`);
    console.table({ AREA_MANAGER: sample('AREA_MANAGER'), DEAN: sample('DEAN'), TUTOR: sample('TUTOR'), STUDENT: sample('STUDENT') });
    console.log('Los documentos son solo metadatos: no hay archivos en S3, así que su descarga falla.');
  } catch (error) {
    console.error('La seed masiva falló:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
