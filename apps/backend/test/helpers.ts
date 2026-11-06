import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/database/prisma.service';
import { PasswordService } from '../src/modules/auth';
import type { Role } from '../src/generated/prisma/enums';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return app;
}

/** Vacía todas las tablas de la base de pruebas (excepto el historial de migraciones). */
export async function resetDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (!db.endsWith('_test')) throw new Error(`Se negó a vaciar la base "${db}".`);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

interface UserSeed {
  email: string;
  password?: string | null;
  fullName?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  roles?: Role[];
}

/** Crea un usuario ficticio (sin datos personales reales). */
export async function createUser(app: INestApplication, seed: UserSeed) {
  const prisma = app.get(PrismaService);
  const passwordHash = seed.password ? await app.get(PasswordService).hash(seed.password) : null;
  return prisma.user.create({
    data: {
      email: seed.email,
      fullName: seed.fullName ?? 'Usuario de Prueba',
      status: seed.status ?? 'ACTIVE',
      passwordHash,
      roles: { create: (seed.roles ?? ['STUDENT']).map((role) => ({ role })) },
    },
  });
}

/** Inicia sesión con credenciales siguiendo el flujo de Auth.js (CSRF + callback). */
export async function loginWithPassword(agent: TestAgent, email: string, password: string, csrf = true) {
  const csrfResponse = await agent.get('/api/auth/csrf').expect(200);
  const form: Record<string, string> = { email, password };
  if (csrf) form.csrfToken = csrfResponse.body.csrfToken;
  return agent.post('/api/auth/callback/credentials').type('form').send(form);
}

export function newAgent(app: INestApplication): TestAgent {
  return request.agent(app.getHttpServer());
}

export function sessionCookie(setCookie: string[] | string | undefined): string | undefined {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.find((c) => c.startsWith('authjs.session-token=') && !c.startsWith('authjs.session-token=;'));
}
