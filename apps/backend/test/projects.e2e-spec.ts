import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { buildProject, buildWorld, type World } from './fixtures';
import { createTestApp, resetDatabase } from './helpers';

describe('Proyectos y participantes (e2e)', () => {
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

  const body = (over: Record<string, unknown> = {}) => ({
    title: 'Semillero de robótica',
    areaId: world.area.id,
    facultyIds: [world.facultyA.id],
    ...over,
  });

  describe('POST /api/projects', () => {
    it('responde 401 sin sesión', async () => {
      await request(app.getHttpServer()).post('/api/projects').send({}).expect(401);
    });

    it('el decano crea proyectos en sus facultades', async () => {
      const res = await (await world.as('dean'))
        .post('/api/projects')
        .send(body({ description: 'Demo', startsOn: '2026-02-01', endsOn: '2026-11-30' }))
        .expect(201);
      expect(res.body).toMatchObject({
        title: 'Semillero de robótica',
        status: 'ACTIVE',
        area: { id: world.area.id },
        faculties: [{ id: world.facultyA.id, name: 'Facultad A' }],
        startsOn: '2026-02-01',
        endsOn: '2026-11-30',
      });
    });

    it('permite proyectos interfacultad si el decano dirige al menos una', async () => {
      const res = await (await world.as('dean'))
        .post('/api/projects')
        .send(body({ facultyIds: [world.facultyA.id, world.facultyB.id] }))
        .expect(201);
      expect(res.body.faculties).toHaveLength(2);
    });

    it('responde 403 si el decano no dirige ninguna de las facultades', async () => {
      await (await world.as('dean')).post('/api/projects').send(body({ facultyIds: [world.facultyB.id] })).expect(403);
    });

    it('el administrador crea proyectos en cualquier facultad', async () => {
      await (await world.as('admin')).post('/api/projects').send(body({ facultyIds: [world.facultyB.id] })).expect(201);
    });

    it('responde 403 a tutores y estudiantes', async () => {
      await (await world.as('tutor')).post('/api/projects').send(body()).expect(403);
      await (await world.as('student')).post('/api/projects').send(body()).expect(403);
    });

    it('responde 400 con área inexistente o datos inválidos', async () => {
      const dean = await world.as('dean');
      const missingArea = await dean.post('/api/projects').send(body({ areaId: crypto.randomUUID() })).expect(400);
      expect(missingArea.body.errors).toEqual(['El área indicada no existe.']);
      const invalid = await dean.post('/api/projects').send({ title: '' }).expect(400);
      expect(invalid.body.message).toBe('Datos inválidos.');
    });
  });

  describe('encargado de área', () => {
    const otherArea = () => world.prisma.area.create({ data: { name: 'Otra área' } });

    it('crea proyectos solo con un área asignada (cualquier facultad)', async () => {
      const manager = await world.as('areaManager');
      const created = await manager.post('/api/projects').send(body({ facultyIds: [world.facultyB.id] })).expect(201);
      expect(created.body.area.id).toBe(world.area.id);
      const other = await otherArea();
      await manager.post('/api/projects').send(body({ areaId: other.id })).expect(403);
    });

    it('edita y elimina proyectos de su área, no de otra', async () => {
      const project = await buildProject(world);
      const other = await otherArea();
      const foreign = (
        await (await world.as('admin')).post('/api/projects').send(body({ title: 'Ajeno', areaId: other.id })).expect(201)
      ).body as { id: string };
      const manager = await world.as('areaManager');

      const res = await manager.patch(`/api/projects/${project.id}`).send({ title: 'Del encargado', status: 'FINISHED' }).expect(200);
      expect(res.body).toMatchObject({ title: 'Del encargado', status: 'FINISHED' });
      await manager.patch(`/api/projects/${foreign.id}`).send({ title: 'X' }).expect(404);
      await manager.delete(`/api/projects/${foreign.id}`).expect(404);
      // No puede mover su proyecto a un área que no le pertenece.
      await manager.patch(`/api/projects/${project.id}`).send({ areaId: other.id }).expect(403);
      await manager.delete(`/api/projects/${project.id}`).expect(204);
      await manager.get(`/api/projects/${project.id}`).expect(404);
    });

    it('lista los proyectos de sus áreas', async () => {
      await buildProject(world);
      const other = await otherArea();
      await (await world.as('admin')).post('/api/projects').send(body({ title: 'Ajeno', areaId: other.id })).expect(201);
      const list = (await (await world.as('areaManager')).get('/api/projects').expect(200)).body as {
        items: { title: string }[];
      };
      expect(list.items.map((p) => p.title)).toEqual(['Proyecto de prueba']);
    });

    it('gestiona tutores y estudiantes de los proyectos de su área', async () => {
      const project = await buildProject(world);
      const manager = await world.as('areaManager');
      const add = (userId: string, projectRole: string) =>
        manager.post(`/api/projects/${project.id}/members`).send({ userId, projectRole });
      const tutor2 = (await add(world.ids.tutor2, 'TUTOR').expect(201)).body as { id: string };
      await add(world.ids.outsider, 'STUDENT').expect(201);
      await manager.delete(`/api/projects/${project.id}/members/${tutor2.id}`).expect(204);
    });

    it('no gestiona participantes de proyectos de otra área', async () => {
      const other = await otherArea();
      const foreign = (
        await (await world.as('admin')).post('/api/projects').send(body({ areaId: other.id })).expect(201)
      ).body as { id: string };
      await (await world.as('areaManager'))
        .post(`/api/projects/${foreign.id}/members`)
        .send({ userId: world.ids.outsider, projectRole: 'STUDENT' })
        .expect(404);
    });

    it('decano y encargado tienen los mismos permisos sobre el mismo proyecto (sin precedencia)', async () => {
      const project = await buildProject(world);
      const dean = await world.as('dean');
      const manager = await world.as('areaManager');
      await dean.patch(`/api/projects/${project.id}`).send({ title: 'Del decano' }).expect(200);
      const res = await manager.patch(`/api/projects/${project.id}`).send({ title: 'Del encargado' }).expect(200);
      expect(res.body.title).toBe('Del encargado');
      const final = await dean.get(`/api/projects/${project.id}`).expect(200);
      expect(final.body.title).toBe('Del encargado');
      await dean.post(`/api/projects/${project.id}/members`).send({ userId: world.ids.tutor2, projectRole: 'TUTOR' }).expect(201);
    });
  });

  describe('límites del tutor (ADR 0010, sec. 6)', () => {
    async function memberIds(projectId: string) {
      const members = (await (await world.as('tutor')).get(`/api/projects/${projectId}/members`).expect(200)).body as {
        id: string;
        user: { id: string };
      }[];
      return (userId: string) => members.find((m) => m.user.id === userId)!.id;
    }

    it('no añade ni cambia tutores, pero sí estudiantes', async () => {
      const project = await buildProject(world);
      const tutor = await world.as('tutor');
      await tutor.post(`/api/projects/${project.id}/members`).send({ userId: world.ids.tutor2, projectRole: 'TUTOR' }).expect(403);
      await tutor
        .post(`/api/projects/${project.id}/members`)
        .send({ userId: world.ids.tutor2, projectRole: 'TUTOR', isPrimary: true })
        .expect(403);
      const idOf = await memberIds(project.id);
      await tutor.patch(`/api/projects/${project.id}/members/${idOf(world.ids.tutor)}`).send({ projectRole: 'STUDENT' }).expect(403);
      await tutor.delete(`/api/projects/${project.id}/members/${idOf(world.ids.tutor)}`).expect(403);
      await tutor.delete(`/api/projects/${project.id}/members/${idOf(world.ids.student)}`).expect(204);
    });

    it('no cambia sus roles globales ni gestiona el proyecto', async () => {
      const project = await buildProject(world);
      const tutor = await world.as('tutor');
      await tutor.patch(`/api/projects/${project.id}`).send({ title: 'X' }).expect(403);
      await tutor.delete(`/api/projects/${project.id}`).expect(403);
    });
  });

  describe('visibilidad', () => {
    it('cada usuario solo ve los proyectos que le corresponden', async () => {
      const project = await buildProject(world);
      await (await world.as('admin')).post('/api/projects').send(body({ title: 'De la B', facultyIds: [world.facultyB.id] })).expect(201);

      const titles = async (p: Parameters<World['as']>[0]) =>
        ((await (await world.as(p)).get('/api/projects').expect(200)).body as { items: { title: string }[] }).items
          .map((x) => x.title)
          .sort();

      expect(await titles('admin')).toEqual(['De la B', 'Proyecto de prueba']);
      expect(await titles('dean')).toEqual(['Proyecto de prueba']);
      expect(await titles('otherDean')).toEqual(['De la B']);
      expect(await titles('tutor')).toEqual(['Proyecto de prueba']);
      expect(await titles('student')).toEqual(['Proyecto de prueba']);
      expect(await titles('outsider')).toEqual([]);

      await (await world.as('outsider')).get(`/api/projects/${project.id}`).expect(404);
      await (await world.as('otherDean')).get(`/api/projects/${project.id}`).expect(404);
      await (await world.as('student')).get(`/api/projects/${project.id}`).expect(200);
    });

    it('responde 400 con un id que no es UUID', async () => {
      await (await world.as('admin')).get('/api/projects/no-es-uuid').expect(400);
    });
  });

  describe('GET /api/projects (paginación y búsqueda, ADR 0017)', () => {
    it('devuelve la primera página con 20 elementos por defecto', async () => {
      await buildProject(world);
      const res = await (await world.as('admin')).get('/api/projects').expect(200);
      expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
      expect(res.body.items).toHaveLength(1);
    });

    it('pagina en el servidor manteniendo el total', async () => {
      await buildProject(world);
      const admin = await world.as('admin');
      for (const title of ['Alfa', 'Beta']) await admin.post('/api/projects').send(body({ title })).expect(201);

      const first = await admin.get('/api/projects?page=1&pageSize=2').expect(200);
      const second = await admin.get('/api/projects?page=2&pageSize=2').expect(200);
      expect(first.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(first.body.items).toHaveLength(2);
      expect(second.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
      expect(second.body.items).toHaveLength(1);
      const ids = [...first.body.items, ...second.body.items].map((p: { id: string }) => p.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('ordena por fecha de creación descendente y luego por id', async () => {
      await buildProject(world);
      const admin = await world.as('admin');
      for (const title of ['Alfa', 'Beta']) await admin.post('/api/projects').send(body({ title })).expect(201);

      const res = await admin.get('/api/projects?pageSize=100').expect(200);
      const expected = await world.prisma.project.findMany({
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      expect((res.body.items as { id: string }[]).map((p) => p.id)).toEqual(expected.map((p) => p.id));
    });

    it('una página posterior al final devuelve la lista vacía con el total real', async () => {
      await buildProject(world);
      const res = await (await world.as('admin')).get('/api/projects?page=9&pageSize=2').expect(200);
      expect(res.body).toMatchObject({ items: [], total: 1, page: 9, pageSize: 2 });
    });

    it('busca por título sin distinguir mayúsculas y respeta la visibilidad', async () => {
      await buildProject(world);
      const admin = await world.as('admin');
      await admin
        .post('/api/projects')
        .send(body({ title: 'Robótica avanzada', facultyIds: [world.facultyB.id] }))
        .expect(201);

      const res = await admin.get('/api/projects?search=%20ROB%C3%93TICA%20').expect(200);
      expect(res.body).toMatchObject({ total: 1, page: 1 });
      expect((res.body.items as { title: string }[]).map((p) => p.title)).toEqual(['Robótica avanzada']);

      const dean = await (await world.as('dean')).get('/api/projects?search=avanzada').expect(200);
      expect(dean.body).toMatchObject({ items: [], total: 0 });
    });

    it('responde 400 con paginación o búsqueda inválidas', async () => {
      const admin = await world.as('admin');
      const page = await admin.get('/api/projects?page=0').expect(400);
      expect(page.body.message).toBe('Datos inválidos.');
      expect(page.body.errors).toContain('page debe ser un entero mayor o igual que 1.');

      const size = await admin.get('/api/projects?pageSize=101').expect(400);
      expect(size.body.errors).toContain('pageSize debe ser un entero entre 1 y 100.');

      const search = await admin.get('/api/projects?search=%20').expect(400);
      expect(search.body.errors).toContain('search debe tener entre 1 y 100 caracteres.');

      const unknown = await admin.get('/api/projects?desconocido=1').expect(400);
      expect(unknown.body.errors).toContain('Campos no permitidos: desconocido.');
    });
  });

  describe('PATCH y DELETE /api/projects/:id', () => {
    it('solo el decano o el administrador modifican el proyecto', async () => {
      const project = await buildProject(world);
      await (await world.as('tutor')).patch(`/api/projects/${project.id}`).send({ title: 'X' }).expect(403);
      const res = await (await world.as('dean'))
        .patch(`/api/projects/${project.id}`)
        .send({ title: 'Renombrado', status: 'FINISHED' })
        .expect(200);
      expect(res.body).toMatchObject({ title: 'Renombrado', status: 'FINISHED' });
    });

    it('valida el orden de fechas combinando las guardadas y las nuevas', async () => {
      const project = await buildProject(world);
      const dean = await world.as('dean');
      await dean.patch(`/api/projects/${project.id}`).send({ startsOn: '2026-06-01' }).expect(200);
      const res = await dean.patch(`/api/projects/${project.id}`).send({ endsOn: '2026-01-01' }).expect(400);
      expect(res.body.errors).toEqual(['endsOn no puede ser anterior a startsOn.']);
    });

    it('el decano no puede mover el proyecto a facultades que no dirige', async () => {
      const project = await buildProject(world);
      await (await world.as('dean')).patch(`/api/projects/${project.id}`).send({ facultyIds: [world.facultyB.id] }).expect(403);
    });

    it('la eliminación es lógica y el proyecto deja de ser visible', async () => {
      const project = await buildProject(world);
      await (await world.as('student')).delete(`/api/projects/${project.id}`).expect(403);
      await (await world.as('dean')).delete(`/api/projects/${project.id}`).expect(204);

      await (await world.as('dean')).get(`/api/projects/${project.id}`).expect(404);
      expect((await (await world.as('tutor')).get('/api/projects').expect(200)).body).toMatchObject({ items: [], total: 0 });
      const stored = await world.prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(stored.deletedAt).not.toBeNull();
    });
  });

  describe('participantes', () => {
    it('lista los participantes activos con sus roles', async () => {
      const project = await buildProject(world);
      const res = await (await world.as('student')).get(`/api/projects/${project.id}/members`).expect(200);
      const summary = (res.body as { user: { id: string }; projectRole: string; isPrimary: boolean }[]).map((m) => [
        m.user.id,
        m.projectRole,
        m.isPrimary,
      ]);
      expect(summary).toEqual(
        expect.arrayContaining([
          [world.ids.tutor, 'TUTOR', true],
          [world.ids.leader, 'STUDENT_LEADER', false],
          [world.ids.student, 'STUDENT', false],
        ]),
      );
    });

    it('solo el decano o el administrador asignan tutores', async () => {
      const project = await buildProject(world);
      const send = { userId: world.ids.tutor2, projectRole: 'TUTOR' };
      await (await world.as('tutor')).post(`/api/projects/${project.id}/members`).send(send).expect(403);
      await (await world.as('dean')).post(`/api/projects/${project.id}/members`).send(send).expect(201);
    });

    it('los tutores añaden estudiantes', async () => {
      const project = await buildProject(world);
      await (await world.as('tutor'))
        .post(`/api/projects/${project.id}/members`)
        .send({ userId: world.ids.outsider, projectRole: 'STUDENT' })
        .expect(201);
    });

    it('los estudiantes no gestionan participantes', async () => {
      const project = await buildProject(world);
      await (await world.as('leader'))
        .post(`/api/projects/${project.id}/members`)
        .send({ userId: world.ids.outsider, projectRole: 'STUDENT' })
        .expect(403);
    });

    it('exige el rol global correspondiente', async () => {
      const project = await buildProject(world);
      const res = await (await world.as('dean'))
        .post(`/api/projects/${project.id}/members`)
        .send({ userId: world.ids.outsider, projectRole: 'TUTOR' })
        .expect(400);
      expect(res.body.errors[0]).toMatch(/rol global TUTOR/);
    });

    it.each([
      ['participante duplicado', 'student', 'STUDENT', false, 'El usuario ya participa en este proyecto.'],
      ['segundo líder', 'outsider', 'STUDENT_LEADER', false, 'El proyecto ya tiene un estudiante líder.'],
      ['segundo tutor principal', 'tutor2', 'TUTOR', true, 'El proyecto ya tiene un tutor principal.'],
    ] as const)('responde 409: %s', async (_caso, person, projectRole, isPrimary, message) => {
      const project = await buildProject(world);
      const res = await (await world.as('dean'))
        .post(`/api/projects/${project.id}/members`)
        .send({ userId: world.ids[person], projectRole, isPrimary })
        .expect(409);
      expect(res.body.message).toBe(message);
    });

    it('un estudiante no puede estar en dos proyectos activos (P-25)', async () => {
      await buildProject(world);
      const other = (
        await (await world.as('dean')).post('/api/projects').send(body({ title: 'Otro' })).expect(201)
      ).body as { id: string };
      const res = await (await world.as('dean'))
        .post(`/api/projects/${other.id}/members`)
        .send({ userId: world.ids.student, projectRole: 'STUDENT' })
        .expect(409);
      expect(res.body.message).toBe('El estudiante ya participa en otro proyecto activo.');
    });

    it('el tutor cambia al líder: degrada al actual y promueve a otro', async () => {
      const project = await buildProject(world);
      const tutor = await world.as('tutor');
      const members = (await tutor.get(`/api/projects/${project.id}/members`).expect(200)).body as {
        id: string;
        user: { id: string };
      }[];
      const idOf = (userId: string) => members.find((m) => m.user.id === userId)!.id;

      await tutor.patch(`/api/projects/${project.id}/members/${idOf(world.ids.student)}`).send({ projectRole: 'STUDENT_LEADER' }).expect(409);
      await tutor.patch(`/api/projects/${project.id}/members/${idOf(world.ids.leader)}`).send({ projectRole: 'STUDENT' }).expect(200);
      const promoted = await tutor
        .patch(`/api/projects/${project.id}/members/${idOf(world.ids.student)}`)
        .send({ projectRole: 'STUDENT_LEADER' })
        .expect(200);
      expect(promoted.body.projectRole).toBe('STUDENT_LEADER');

      await tutor.patch(`/api/projects/${project.id}/members/${idOf(world.ids.tutor)}`).send({ isPrimary: false }).expect(403);
    });

    it('retirar a un participante lo inactiva y le quita el acceso', async () => {
      const project = await buildProject(world);
      const tutor = await world.as('tutor');
      const members = (await tutor.get(`/api/projects/${project.id}/members`).expect(200)).body as {
        id: string;
        user: { id: string };
      }[];
      const memberId = members.find((m) => m.user.id === world.ids.student)!.id;

      await tutor.delete(`/api/projects/${project.id}/members/${memberId}`).expect(204);
      await (await world.as('student')).get(`/api/projects/${project.id}`).expect(404);

      const all = (await tutor.get(`/api/projects/${project.id}/members?includeInactive=true`).expect(200)).body as {
        id: string;
        status: string;
        leftAt: string | null;
      }[];
      expect(all.find((m) => m.id === memberId)).toMatchObject({ status: 'INACTIVE', leftAt: expect.any(String) });

      // Puede volver a unirse (nuevo registro; se conserva el historial).
      await tutor.post(`/api/projects/${project.id}/members`).send({ userId: world.ids.student, projectRole: 'STUDENT' }).expect(201);
    });

    it('el tutor no puede retirar a otro tutor', async () => {
      const project = await buildProject(world);
      await (await world.as('dean')).post(`/api/projects/${project.id}/members`).send({ userId: world.ids.tutor2, projectRole: 'TUTOR' }).expect(201);
      const tutor = await world.as('tutor');
      const members = (await tutor.get(`/api/projects/${project.id}/members`).expect(200)).body as {
        id: string;
        user: { id: string };
      }[];
      const tutor2 = members.find((m) => m.user.id === world.ids.tutor2)!.id;
      await tutor.delete(`/api/projects/${project.id}/members/${tutor2}`).expect(403);
    });
  });

  describe('GET /api/projects/tutored', () => {
    it('responde 401 sin sesión', async () => {
      await request(app.getHttpServer()).get('/api/projects/tutored').expect(401);
    });

    it('el tutor ve sus proyectos activos ordenados por título, sin los eliminados ni sus membresías inactivas', async () => {
      const principal = await buildProject(world);
      const dean = await world.as('dean');
      const alfa = (await dean.post('/api/projects').send(body({ title: 'Alfa' })).expect(201)).body as { id: string };
      await dean.post(`/api/projects/${alfa.id}/members`).send({ userId: world.ids.tutor, projectRole: 'TUTOR' }).expect(201);

      const eliminado = (await dean.post('/api/projects').send(body({ title: 'Eliminado' })).expect(201)).body as { id: string };
      await dean.post(`/api/projects/${eliminado.id}/members`).send({ userId: world.ids.tutor, projectRole: 'TUTOR' }).expect(201);
      await dean.delete(`/api/projects/${eliminado.id}`).expect(204);

      const inactivo = (await dean.post('/api/projects').send(body({ title: 'Inactivo' })).expect(201)).body as { id: string };
      const membresia = (
        await dean.post(`/api/projects/${inactivo.id}/members`).send({ userId: world.ids.tutor, projectRole: 'TUTOR' }).expect(201)
      ).body as { id: string };
      await dean.delete(`/api/projects/${inactivo.id}/members/${membresia.id}`).expect(204);

      const res = await (await world.as('tutor')).get('/api/projects/tutored').expect(200);
      expect(res.body).toEqual([
        { id: alfa.id, title: 'Alfa', status: 'ACTIVE', isPrimaryTutor: false },
        { id: principal.id, title: 'Proyecto de prueba', status: 'ACTIVE', isPrimaryTutor: true },
      ]);
    });

    it('un estudiante recibe una lista vacía', async () => {
      await buildProject(world);
      const res = await (await world.as('student')).get('/api/projects/tutored').expect(200);
      expect(res.body).toEqual([]);
    });

    it('GET /api/projects/:id sigue resolviendo un UUID y no captura "tutored"', async () => {
      const project = await buildProject(world);
      await (await world.as('tutor')).get(`/api/projects/${project.id}`).expect(200);
      await (await world.as('tutor')).get('/api/projects/no-es-uuid').expect(400);
    });
  });
});
