import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { buildProject, buildWorld, type World } from './fixtures';
import { createTestApp, createUser, resetDatabase } from './helpers';

const FORBIDDEN = 'No tienes permisos para realizar esta acción.';
const MISSING = '00000000-0000-4000-8000-000000000000';

describe('Administración de áreas y facultades (e2e)', () => {
  let app: INestApplication;
  let world: World;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    world = await buildWorld(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('autorización', () => {
    it('responde 401 sin sesión', async () => {
      await request(app.getHttpServer()).post('/api/areas').send({ name: 'X' }).expect(401);
      await request(app.getHttpServer()).delete(`/api/faculties/${world.facultyA.id}`).expect(401);
    });

    it.each(['dean', 'tutor', 'student'] as const)('%s no puede administrar áreas ni facultades', async (person) => {
      const agent = await world.as(person);
      const calls = [
        agent.post('/api/areas').send({ name: 'X' }),
        agent.patch(`/api/areas/${world.area.id}`).send({ name: 'X' }),
        agent.delete(`/api/areas/${world.area.id}`),
        agent.get(`/api/areas/${world.area.id}/managers`),
        agent.put(`/api/areas/${world.area.id}/managers/${world.ids.areaManager}`),
        agent.post('/api/faculties').send({ name: 'X' }),
        agent.patch(`/api/faculties/${world.facultyA.id}`).send({ name: 'X' }),
        agent.delete(`/api/faculties/${world.facultyA.id}`),
        agent.get(`/api/faculties/${world.facultyA.id}/deans`),
        agent.put(`/api/faculties/${world.facultyA.id}/dean`).send({ userId: world.ids.dean }),
        agent.delete(`/api/faculties/${world.facultyA.id}/dean`),
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.status).toBe(403);
        expect(res.body.message).toBe(FORBIDDEN);
      }
    });

    it('el encargado no crea, elimina ni asigna encargados', async () => {
      const agent = await world.as('areaManager');
      await agent.post('/api/areas').send({ name: 'X' }).expect(403);
      await agent.delete(`/api/areas/${world.area.id}`).expect(403);
      await agent.put(`/api/areas/${world.area.id}/managers/${world.ids.areaManager}`).expect(403);
      await agent.post('/api/faculties').send({ name: 'X' }).expect(403);
    });
  });

  describe('áreas', () => {
    it('el administrador crea, edita y elimina un área', async () => {
      const admin = await world.as('admin');
      const created = await admin.post('/api/areas').send({ name: '  Nueva   área ', description: 'Detalle' }).expect(201);
      expect(created.body).toEqual({ id: expect.any(String), name: 'Nueva área', description: 'Detalle' });

      const patched = await admin.patch(`/api/areas/${created.body.id}`).send({ description: null }).expect(200);
      expect(patched.body).toEqual({ id: created.body.id, name: 'Nueva área', description: null });

      await admin.delete(`/api/areas/${created.body.id}`).expect(204);
      await admin.delete(`/api/areas/${created.body.id}`).expect(404);
      const list = await admin.get('/api/areas').expect(200);
      expect(list.body.map((a: { name: string }) => a.name)).toEqual(['Semillero de investigación']);
    });

    it('valida el cuerpo con 400 { message, errors }', async () => {
      const admin = await world.as('admin');
      const res = await admin.post('/api/areas').send({ description: 3, otro: 1 }).expect(400);
      expect(res.body.message).toBe('Datos inválidos.');
      expect(res.body.errors).toEqual(expect.arrayContaining(['name es obligatorio.', 'description debe ser texto o null.']));
      await admin.patch(`/api/areas/${world.area.id}`).send({}).expect(400);
      await admin.patch('/api/areas/no-es-uuid').send({ name: 'X' }).expect(400);
    });

    it('responde 404 si el área no existe', async () => {
      const admin = await world.as('admin');
      const res = await admin.patch(`/api/areas/${MISSING}`).send({ name: 'X' }).expect(404);
      expect(res.body.message).toBe('Área no encontrada.');
    });

    it('rechaza nombres duplicados (sin distinguir mayúsculas) con 409', async () => {
      const admin = await world.as('admin');
      const dup = await admin.post('/api/areas').send({ name: 'SEMILLERO DE INVESTIGACIÓN' }).expect(409);
      expect(dup.body.message).toBe('Ya existe un área con ese nombre.');
      const other = (await admin.post('/api/areas').send({ name: 'Otra' }).expect(201)).body;
      await admin.patch(`/api/areas/${other.id}`).send({ name: 'Semillero de investigación' }).expect(409);
      // Conservar su propio nombre no es un duplicado.
      await admin.patch(`/api/areas/${other.id}`).send({ name: 'Otra', description: 'x' }).expect(200);
    });

    it('el encargado edita su área pero no otra', async () => {
      const admin = await world.as('admin');
      const other = (await admin.post('/api/areas').send({ name: 'Ajena' }).expect(201)).body;
      const manager = await world.as('areaManager');

      const own = await manager.patch(`/api/areas/${world.area.id}`).send({ name: 'Renombrada', description: 'Nueva' }).expect(200);
      expect(own.body).toMatchObject({ name: 'Renombrada', description: 'Nueva' });

      const res = await manager.patch(`/api/areas/${other.id}`).send({ name: 'Intento' }).expect(403);
      expect(res.body.message).toBe(FORBIDDEN);
      await manager.patch(`/api/areas/${MISSING}`).send({ name: 'X' }).expect(404);
    });

    it('no elimina un área con proyectos (409)', async () => {
      await buildProject(world);
      const admin = await world.as('admin');
      const res = await admin.delete(`/api/areas/${world.area.id}`).expect(409);
      expect(res.body.message).toBe('No se puede eliminar el área: tiene proyectos asociados.');
    });

    it('no elimina un área con novedades dirigidas a ella (409)', async () => {
      const announcement = await world.prisma.announcement.create({
        data: { authorId: world.ids.admin, title: 'T', content: 'C', audiences: { create: { audienceType: 'AREA', areaId: world.area.id } } },
      });
      expect(announcement.id).toBeDefined();
      const admin = await world.as('admin');
      const res = await admin.delete(`/api/areas/${world.area.id}`).expect(409);
      expect(res.body.message).toBe('No se puede eliminar el área: tiene novedades dirigidas a ella.');
    });

    it('al eliminar un área se retiran sus encargados', async () => {
      const admin = await world.as('admin');
      await admin.delete(`/api/areas/${world.area.id}`).expect(204);
      expect(await world.prisma.areaManager.count()).toBe(0);
    });
  });

  describe('encargados de área', () => {
    it('lista, asigna (idempotente) y retira', async () => {
      const admin = await world.as('admin');
      const second = await createUser(app, { email: 'encargado2@example.test', fullName: 'Segundo Encargado', roles: ['AREA_MANAGER'] });

      let list = await admin.get(`/api/areas/${world.area.id}/managers`).expect(200);
      expect(list.body).toEqual([
        { userId: world.ids.areaManager, fullName: 'Usuario de Prueba', email: 'areamanager@example.test', assignedAt: expect.any(String) },
      ]);

      const assigned = await admin.put(`/api/areas/${world.area.id}/managers/${second.id}`).expect(200);
      expect(assigned.body).toMatchObject({ userId: second.id, email: 'encargado2@example.test' });
      await admin.put(`/api/areas/${world.area.id}/managers/${second.id}`).expect(200);
      list = await admin.get(`/api/areas/${world.area.id}/managers`).expect(200);
      expect(list.body).toHaveLength(2);

      await admin.delete(`/api/areas/${world.area.id}/managers/${second.id}`).expect(204);
      const res = await admin.delete(`/api/areas/${world.area.id}/managers/${second.id}`).expect(404);
      expect(res.body.message).toBe('El usuario no es encargado de esta área.');
    });

    it('valida usuario y área al asignar', async () => {
      const admin = await world.as('admin');
      const base = `/api/areas/${world.area.id}/managers`;
      await admin.put(`${base}/${MISSING}`).expect(404);
      await admin.put(`/api/areas/${MISSING}/managers/${world.ids.areaManager}`).expect(404);
      await admin.put(`${base}/no-uuid`).expect(400);

      const noRole = await admin.put(`${base}/${world.ids.tutor}`).expect(400);
      expect(noRole.body.message).toBe('El usuario debe tener el rol de encargado de área.');

      const inactive = await createUser(app, { email: 'inactivo@example.test', status: 'INACTIVE', roles: ['AREA_MANAGER'] });
      const res = await admin.put(`${base}/${inactive.id}`).expect(400);
      expect(res.body.message).toBe('El usuario debe estar activo.');
    });

    it('un encargado recién asignado puede editar el área', async () => {
      const admin = await world.as('admin');
      const other = (await admin.post('/api/areas').send({ name: 'Ajena' }).expect(201)).body;
      const manager = await world.as('areaManager');
      await manager.patch(`/api/areas/${other.id}`).send({ name: 'Y' }).expect(403);
      await admin.put(`/api/areas/${other.id}/managers/${world.ids.areaManager}`).expect(200);
      await manager.patch(`/api/areas/${other.id}`).send({ name: 'Y' }).expect(200);
      await admin.delete(`/api/areas/${other.id}/managers/${world.ids.areaManager}`).expect(204);
      await manager.patch(`/api/areas/${other.id}`).send({ name: 'Z' }).expect(403);
    });
  });

  describe('facultades', () => {
    it('el administrador crea, renombra y elimina una facultad', async () => {
      const admin = await world.as('admin');
      const created = await admin.post('/api/faculties').send({ name: ' Facultad  C ' }).expect(201);
      expect(created.body).toEqual({ id: expect.any(String), name: 'Facultad C' });
      const patched = await admin.patch(`/api/faculties/${created.body.id}`).send({ name: 'Facultad D' }).expect(200);
      expect(patched.body.name).toBe('Facultad D');
      await admin.delete(`/api/faculties/${created.body.id}`).expect(204);
      await admin.delete(`/api/faculties/${created.body.id}`).expect(404);
    });

    it('valida el cuerpo y responde 404', async () => {
      const admin = await world.as('admin');
      const res = await admin.post('/api/faculties').send({ name: '   ' }).expect(400);
      expect(res.body).toEqual({ message: 'Datos inválidos.', errors: ['name es obligatorio.'] });
      await admin.patch(`/api/faculties/${world.facultyA.id}`).send({}).expect(400);
      const missing = await admin.patch(`/api/faculties/${MISSING}`).send({ name: 'X' }).expect(404);
      expect(missing.body.message).toBe('Facultad no encontrada.');
    });

    it('rechaza nombres duplicados con 409', async () => {
      const admin = await world.as('admin');
      const dup = await admin.post('/api/faculties').send({ name: 'facultad a' }).expect(409);
      expect(dup.body.message).toBe('Ya existe una facultad con ese nombre.');
      await admin.patch(`/api/faculties/${world.facultyB.id}`).send({ name: 'Facultad A' }).expect(409);
      await admin.patch(`/api/faculties/${world.facultyB.id}`).send({ name: 'Facultad B' }).expect(200);
    });

    it('no elimina una facultad con proyectos (409)', async () => {
      await buildProject(world);
      const admin = await world.as('admin');
      const res = await admin.delete(`/api/faculties/${world.facultyA.id}`).expect(409);
      expect(res.body.message).toBe('No se puede eliminar la facultad: tiene proyectos asociados.');
    });

    it('no elimina una facultad con novedades dirigidas a ella (409)', async () => {
      await world.prisma.announcement.create({
        data: { authorId: world.ids.admin, title: 'T', content: 'C', audiences: { create: { audienceType: 'FACULTY', facultyId: world.facultyB.id } } },
      });
      const admin = await world.as('admin');
      const res = await admin.delete(`/api/faculties/${world.facultyB.id}`).expect(409);
      expect(res.body.message).toBe('No se puede eliminar la facultad: tiene novedades dirigidas a ella.');
    });

    it('elimina una facultad sin dependencias junto con su historial de decanos', async () => {
      const admin = await world.as('admin');
      await admin.delete(`/api/faculties/${world.facultyB.id}`).expect(204);
      expect(await world.prisma.facultyDean.count({ where: { facultyId: world.facultyB.id } })).toBe(0);
      expect(await world.prisma.faculty.count()).toBe(1);
    });
  });

  describe('decanos', () => {
    it('el cambio de decano cierra el anterior y conserva el historial', async () => {
      const admin = await world.as('admin');
      const next = await createUser(app, { email: 'decano2@example.test', fullName: 'Nuevo Decano', roles: ['DEAN'] });
      const path = `/api/faculties/${world.facultyA.id}`;

      const assigned = await admin.put(`${path}/dean`).send({ userId: next.id }).expect(200);
      expect(assigned.body).toMatchObject({ userId: next.id, fullName: 'Nuevo Decano', endsAt: null });

      const history = (await admin.get(`${path}/deans`).expect(200)).body as { userId: string; endsAt: string | null }[];
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({ userId: next.id, endsAt: null });
      expect(history[1].userId).toBe(world.ids.dean);
      expect(history[1].endsAt).not.toBeNull();
      expect(await world.prisma.facultyDean.count({ where: { facultyId: world.facultyA.id, endsAt: null } })).toBe(1);

      // El decano anterior pierde su alcance sobre la facultad.
      const dean = await world.as('dean');
      await dean.post('/api/projects').send({ title: 'P', areaId: world.area.id, facultyIds: [world.facultyA.id] }).expect(403);
    });

    it('permite volver a asignar a un decano anterior', async () => {
      const admin = await world.as('admin');
      const next = await createUser(app, { email: 'decano2@example.test', roles: ['DEAN'] });
      const path = `/api/faculties/${world.facultyA.id}/dean`;
      await admin.put(path).send({ userId: next.id }).expect(200);
      await admin.put(path).send({ userId: world.ids.dean }).expect(200);
      const history = (await admin.get(`/api/faculties/${world.facultyA.id}/deans`).expect(200)).body as { userId: string; endsAt: string | null }[];
      expect(history.map((h) => h.userId)).toEqual([world.ids.dean, next.id, world.ids.dean]);
      expect(history.filter((h) => h.endsAt === null)).toHaveLength(1);
    });

    it('responde 409 si ya es el vigente', async () => {
      const admin = await world.as('admin');
      const res = await admin.put(`/api/faculties/${world.facultyA.id}/dean`).send({ userId: world.ids.dean }).expect(409);
      expect(res.body.message).toBe('El usuario ya es el decano vigente de esta facultad.');
    });

    it('valida userId, estado, rol y existencia', async () => {
      const admin = await world.as('admin');
      const path = `/api/faculties/${world.facultyA.id}/dean`;
      await admin.put(path).send({}).expect(400);
      await admin.put(path).send({ userId: 'x' }).expect(400);
      await admin.put(path).send({ userId: MISSING }).expect(404);
      await admin.put(`/api/faculties/${MISSING}/dean`).send({ userId: world.ids.dean }).expect(404);

      const noRole = await admin.put(path).send({ userId: world.ids.tutor }).expect(400);
      expect(noRole.body.message).toBe('El usuario debe tener el rol de decano.');

      const inactive = await createUser(app, { email: 'decano.inactivo@example.test', status: 'INACTIVE', roles: ['DEAN'] });
      const res = await admin.put(path).send({ userId: inactive.id }).expect(400);
      expect(res.body.message).toBe('El usuario debe estar activo.');
    });

    it('el decano de una facultad nueva se asigna sin cerrar nada', async () => {
      const admin = await world.as('admin');
      const faculty = (await admin.post('/api/faculties').send({ name: 'Facultad C' }).expect(201)).body;
      expect((await admin.get(`/api/faculties/${faculty.id}/deans`).expect(200)).body).toEqual([]);
      await admin.put(`/api/faculties/${faculty.id}/dean`).send({ userId: world.ids.dean }).expect(200);
      expect((await admin.get(`/api/faculties/${faculty.id}/deans`).expect(200)).body).toHaveLength(1);
    });

    it('retira el decano vigente sin sustituirlo y conserva el historial', async () => {
      const admin = await world.as('admin');
      const path = `/api/faculties/${world.facultyA.id}`;
      await admin.delete(`${path}/dean`).expect(204);
      const history = (await admin.get(`${path}/deans`).expect(200)).body as { endsAt: string | null }[];
      expect(history).toHaveLength(1);
      expect(history[0].endsAt).not.toBeNull();
      const res = await admin.delete(`${path}/dean`).expect(404);
      expect(res.body.message).toBe('La facultad no tiene un decano vigente.');
    });
  });
});
