import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, createUser, loginWithPassword, newAgent, resetDatabase } from './helpers';

const PASSWORD = 'Clave-Catalogos-1';
const STUDENT = { email: 'estudiante.catalogos@example.test', fullName: 'Estudiante de Catálogos' };

describe('Catálogos: GET /api/areas y GET /api/faculties (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    await createUser(app, { ...STUDENT, password: PASSWORD, roles: ['STUDENT'] });
    // Se crean desordenados para comprobar el orden por nombre.
    await prisma.area.create({ data: { name: 'Semillero', description: 'Descripción de prueba' } });
    await prisma.area.create({ data: { name: 'Investigación' } });
    await prisma.area.create({ data: { name: 'Proyectos de grado' } });
    await prisma.faculty.create({ data: { name: 'Facultad de Ingeniería' } });
    await prisma.faculty.create({ data: { name: 'Facultad de Artes' } });
    await prisma.faculty.create({ data: { name: 'Facultad de Ciencias' } });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('autorización', () => {
    it.each(['/api/areas', '/api/faculties'])('responde 401 en %s sin sesión', async (path) => {
      const res = await request(app.getHttpServer()).get(path).expect(401);
      expect(res.body.message).toBe('Sesión no válida o expirada.');
    });

    it.each(['/api/areas', '/api/faculties'])('responde 401 en %s si el usuario fue desactivado', async (path) => {
      const agent = newAgent(app);
      await loginWithPassword(agent, STUDENT.email, PASSWORD);
      await prisma.user.update({ where: { email: STUDENT.email }, data: { status: 'INACTIVE' } });
      await agent.get(path).expect(401);
    });
  });

  describe('contenido', () => {
    it('lista las áreas ordenadas por nombre, solo con id, nombre y descripción', async () => {
      const agent = newAgent(app);
      await loginWithPassword(agent, STUDENT.email, PASSWORD);
      const res = await agent.get('/api/areas').expect(200);

      expect(res.body.map((a: { name: string }) => a.name)).toEqual(['Investigación', 'Proyectos de grado', 'Semillero']);
      for (const area of res.body) {
        expect(Object.keys(area).sort()).toEqual(['description', 'id', 'name']);
      }
      expect(res.body[0].description).toBeNull();
      expect(res.body[2].description).toBe('Descripción de prueba');
    });

    it('lista las facultades ordenadas por nombre, solo con id y nombre', async () => {
      const agent = newAgent(app);
      await loginWithPassword(agent, STUDENT.email, PASSWORD);
      const res = await agent.get('/api/faculties').expect(200);

      expect(res.body.map((f: { name: string }) => f.name)).toEqual([
        'Facultad de Artes',
        'Facultad de Ciencias',
        'Facultad de Ingeniería',
      ]);
      for (const faculty of res.body) {
        expect(Object.keys(faculty).sort()).toEqual(['id', 'name']);
      }
    });
  });

  describe('filtros scope (ADR 0010 §9)', () => {
    const MANAGER = { email: 'encargado.catalogos@example.test', fullName: 'Encargado de Catálogos' };
    const DEAN = { email: 'decano.catalogos@example.test', fullName: 'Decano de Catálogos' };

    async function areaId(name: string): Promise<string> {
      return (await prisma.area.findUniqueOrThrow({ where: { name } })).id;
    }

    async function facultyId(name: string): Promise<string> {
      return (await prisma.faculty.findUniqueOrThrow({ where: { name } })).id;
    }

    it('GET /api/areas?scope=managed devuelve solo el área asignada al encargado', async () => {
      await createUser(app, { ...MANAGER, password: PASSWORD, roles: ['AREA_MANAGER'] });
      const manager = await prisma.user.findUniqueOrThrow({ where: { email: MANAGER.email } });
      await prisma.areaManager.create({ data: { areaId: await areaId('Investigación'), userId: manager.id } });

      const agent = newAgent(app);
      await loginWithPassword(agent, MANAGER.email, PASSWORD);
      const res = await agent.get('/api/areas').query({ scope: 'managed' }).expect(200);

      expect(res.body.map((a: { name: string }) => a.name)).toEqual(['Investigación']);
      expect(Object.keys(res.body[0]).sort()).toEqual(['description', 'id', 'name']);
    });

    it('GET /api/areas?scope=managed devuelve [] si el usuario no es encargado de ninguna área', async () => {
      const agent = newAgent(app);
      await loginWithPassword(agent, STUDENT.email, PASSWORD);
      const res = await agent.get('/api/areas').query({ scope: 'managed' }).expect(200);
      expect(res.body).toEqual([]);
    });

    it('GET /api/faculties?scope=dean devuelve solo las facultades con decanato vigente', async () => {
      await createUser(app, { ...DEAN, password: PASSWORD, roles: ['DEAN'] });
      const dean = await prisma.user.findUniqueOrThrow({ where: { email: DEAN.email } });
      const DAY = 24 * 60 * 60 * 1000;
      const now = Date.now();
      await prisma.facultyDean.createMany({
        data: [
          { facultyId: await facultyId('Facultad de Ingeniería'), userId: dean.id, startsAt: new Date(now - 30 * DAY), endsAt: null },
          // Decanato cerrado hace un año: no cuenta.
          {
            facultyId: await facultyId('Facultad de Artes'),
            userId: dean.id,
            startsAt: new Date(now - 2 * 365 * DAY),
            endsAt: new Date(now - 365 * DAY),
          },
          // Decanato con cierre programado en el futuro: sigue vigente.
          {
            facultyId: await facultyId('Facultad de Ciencias'),
            userId: dean.id,
            startsAt: new Date(now - 30 * DAY),
            endsAt: new Date(now + 365 * DAY),
          },
        ],
      });

      const agent = newAgent(app);
      await loginWithPassword(agent, DEAN.email, PASSWORD);
      const res = await agent.get('/api/faculties').query({ scope: 'dean' }).expect(200);

      expect(res.body.map((f: { name: string }) => f.name)).toEqual(['Facultad de Ciencias', 'Facultad de Ingeniería']);
      for (const faculty of res.body) {
        expect(Object.keys(faculty).sort()).toEqual(['id', 'name']);
      }
    });

    it('GET /api/faculties?scope=dean devuelve [] si el usuario no es decano', async () => {
      const agent = newAgent(app);
      await loginWithPassword(agent, STUDENT.email, PASSWORD);
      const res = await agent.get('/api/faculties').query({ scope: 'dean' }).expect(200);
      expect(res.body).toEqual([]);
    });

    it.each([
      ['/api/areas', { scope: 'dean' }],
      ['/api/areas', { scope: 'todas' }],
      ['/api/areas', { scope: '' }],
      ['/api/faculties', { scope: 'managed' }],
      ['/api/faculties', { scope: 'todas' }],
      ['/api/areas', { scope: 'managed', foo: 'bar' }],
    ])('responde 400 en %s con %j', async (path, query) => {
      const agent = newAgent(app);
      await loginWithPassword(agent, STUDENT.email, PASSWORD);
      const res = await agent.get(path).query(query).expect(400);
      expect(res.body.message).toBe('Datos inválidos.');
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(res.body.errors.length).toBeGreaterThan(0);
    });
  });
});
