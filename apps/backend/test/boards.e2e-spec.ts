import type { INestApplication } from '@nestjs/common';
import { buildProject, buildWorld, type World } from './fixtures';
import { createTestApp, resetDatabase } from './helpers';

describe('Tableros y actividades (e2e)', () => {
  let app: INestApplication;
  let world: World;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    world = await buildWorld(app);
    projectId = (await buildProject(world)).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const boardBody = (over: Record<string, unknown> = {}) => ({
    title: 'Revisión bibliográfica',
    dueDate: '2026-12-15',
    responsibleTutorId: world.ids.tutor,
    responsibleStudentId: world.ids.leader,
    ...over,
  });

  async function createBoard(): Promise<string> {
    return (await (await world.as('tutor')).post(`/api/projects/${projectId}/boards`).send(boardBody()).expect(201)).body.id;
  }

  async function createActivity(boardId: string, by: 'tutor' | 'leader' = 'leader'): Promise<string> {
    return (
      await (await world.as(by)).post(`/api/boards/${boardId}/activities`).send({ title: 'Leer artículo' }).expect(201)
    ).body.id;
  }

  async function assign(activityId: string, person: 'student' | 'leader' = 'student') {
    await (await world.as('leader')).post(`/api/activities/${activityId}/assignees`).send({ userId: world.ids[person] }).expect(201);
  }

  describe('tableros', () => {
    it('el tutor crea tableros con sus responsables', async () => {
      const res = await (await world.as('tutor')).post(`/api/projects/${projectId}/boards`).send(boardBody()).expect(201);
      expect(res.body).toMatchObject({
        projectId,
        title: 'Revisión bibliográfica',
        dueDate: '2026-12-15',
        progressStatus: 'PENDING',
        result: null,
        responsibleTutor: { id: world.ids.tutor },
        responsibleStudent: { id: world.ids.leader },
        activityCount: 0,
      });
    });

    it('el líder y los estudiantes no crean tableros (P-09)', async () => {
      await (await world.as('leader')).post(`/api/projects/${projectId}/boards`).send(boardBody()).expect(403);
      await (await world.as('student')).post(`/api/projects/${projectId}/boards`).send(boardBody()).expect(403);
    });

    it('los responsables deben ser participantes con el rol adecuado', async () => {
      const tutor = await world.as('tutor');
      const notMember = await tutor
        .post(`/api/projects/${projectId}/boards`)
        .send(boardBody({ responsibleStudentId: world.ids.outsider }))
        .expect(400);
      expect(notMember.body.errors[0]).toMatch(/responsibleStudentId/);
      await tutor
        .post(`/api/projects/${projectId}/boards`)
        .send(boardBody({ responsibleTutorId: world.ids.student }))
        .expect(400);
    });

    it('el tutor responsable debe ser tutor activo y el estudiante, STUDENT o STUDENT_LEADER activo', async () => {
      const tutor = await world.as('tutor');
      const post = (over: Record<string, unknown>) => tutor.post(`/api/projects/${projectId}/boards`).send(boardBody(over));

      // Tutor global que no participa en el proyecto.
      const notTutor = await post({ responsibleTutorId: world.ids.tutor2 }).expect(400);
      expect(notTutor.body.errors[0]).toMatch(/responsibleTutorId/);
      // El estudiante encargado no tiene que ser el líder.
      await post({ responsibleStudentId: world.ids.student }).expect(201);
      // Un tutor no puede ser estudiante responsable.
      await post({ responsibleStudentId: world.ids.tutor }).expect(400);

      // Participante retirado (inactivo) deja de ser válido.
      const members = (await tutor.get(`/api/projects/${projectId}/members`).expect(200)).body as { id: string; user: { id: string } }[];
      await tutor.delete(`/api/projects/${projectId}/members/${members.find((m) => m.user.id === world.ids.student2)!.id}`).expect(204);
      await post({ responsibleStudentId: world.ids.student2 }).expect(400);
    });

    it('al editar un tablero también se validan los responsables', async () => {
      const boardId = await createBoard();
      await (await world.as('tutor')).patch(`/api/boards/${boardId}`).send({ responsibleTutorId: world.ids.tutor2 }).expect(400);
    });

    it('los participantes ven los tableros; los ajenos reciben 404', async () => {
      const boardId = await createBoard();
      const list = await (await world.as('student')).get(`/api/projects/${projectId}/boards`).expect(200);
      expect(list.body.map((b: { id: string }) => b.id)).toEqual([boardId]);
      await (await world.as('outsider')).get(`/api/boards/${boardId}`).expect(404);
      await (await world.as('outsider')).get(`/api/projects/${projectId}/boards`).expect(404);
    });

    it('el tutor actualiza progreso y resultado del tablero', async () => {
      const boardId = await createBoard();
      const res = await (await world.as('tutor'))
        .patch(`/api/boards/${boardId}`)
        .send({ progressStatus: 'DONE', result: 'SUCCESS' })
        .expect(200);
      expect(res.body).toMatchObject({ progressStatus: 'DONE', result: 'SUCCESS' });
      await (await world.as('leader')).patch(`/api/boards/${boardId}`).send({ title: 'X' }).expect(403);
    });

    it('eliminar un tablero oculta también sus actividades', async () => {
      const boardId = await createBoard();
      const activityId = await createActivity(boardId);
      await (await world.as('tutor')).delete(`/api/boards/${boardId}`).expect(204);
      await (await world.as('tutor')).get(`/api/boards/${boardId}`).expect(404);
      await (await world.as('tutor')).get(`/api/activities/${activityId}`).expect(404);
    });

    it('eliminar el proyecto oculta sus tableros', async () => {
      const boardId = await createBoard();
      await (await world.as('dean')).delete(`/api/projects/${projectId}`).expect(204);
      await (await world.as('tutor')).get(`/api/boards/${boardId}`).expect(404);
    });
  });

  describe('actividades', () => {
    it('el líder crea actividades y queda como autor', async () => {
      const boardId = await createBoard();
      const res = await (await world.as('leader'))
        .post(`/api/boards/${boardId}/activities`)
        .send({ title: 'Leer artículo', description: 'Capítulo 2' })
        .expect(201);
      expect(res.body).toMatchObject({
        boardId,
        title: 'Leer artículo',
        description: 'Capítulo 2',
        progressStatus: 'PENDING',
        approvalStatus: 'PENDING',
        author: { id: world.ids.leader },
        assignees: [],
        attachments: [],
      });
    });

    it('un estudiante sin rol de líder no crea actividades', async () => {
      const boardId = await createBoard();
      await (await world.as('student')).post(`/api/boards/${boardId}/activities`).send({ title: 'X' }).expect(403);
    });

    it('el líder asigna encargados que sean estudiantes del proyecto', async () => {
      const activityId = await createActivity(await createBoard());
      const leader = await world.as('leader');
      const res = await leader.post(`/api/activities/${activityId}/assignees`).send({ userId: world.ids.student }).expect(201);
      expect(res.body.assignees).toEqual([{ id: world.ids.student, fullName: 'Usuario de Prueba' }]);

      await leader.post(`/api/activities/${activityId}/assignees`).send({ userId: world.ids.student }).expect(409);
      await leader.post(`/api/activities/${activityId}/assignees`).send({ userId: world.ids.outsider }).expect(400);
      await leader.post(`/api/activities/${activityId}/assignees`).send({ userId: world.ids.tutor }).expect(400);
      await (await world.as('student')).post(`/api/activities/${activityId}/assignees`).send({ userId: world.ids.student2 }).expect(403);
    });

    it('el encargado cambia el progreso, pero no puede cancelar ni editar ni fijar el resultado (P-13)', async () => {
      const activityId = await createActivity(await createBoard());
      await assign(activityId);
      const student = await world.as('student');

      const res = await student.patch(`/api/activities/${activityId}`).send({ progressStatus: 'IN_PROGRESS' }).expect(200);
      expect(res.body.progressStatus).toBe('IN_PROGRESS');
      await student.patch(`/api/activities/${activityId}`).send({ progressStatus: 'DONE' }).expect(200);

      await student.patch(`/api/activities/${activityId}`).send({ progressStatus: 'CANCELLED' }).expect(403);
      await student.patch(`/api/activities/${activityId}`).send({ title: 'Otro' }).expect(403);
      await student.patch(`/api/activities/${activityId}`).send({ result: 'SUCCESS' }).expect(403);
    });

    it('un estudiante que no es encargado no puede modificar la actividad', async () => {
      const activityId = await createActivity(await createBoard());
      await assign(activityId);
      await (await world.as('student2')).patch(`/api/activities/${activityId}`).send({ progressStatus: 'DONE' }).expect(403);
    });

    it('al quitar al encargado pierde el permiso', async () => {
      const activityId = await createActivity(await createBoard());
      await assign(activityId);
      await (await world.as('leader')).delete(`/api/activities/${activityId}/assignees/${world.ids.student}`).expect(200);
      await (await world.as('student')).patch(`/api/activities/${activityId}`).send({ progressStatus: 'DONE' }).expect(403);
      await (await world.as('leader')).delete(`/api/activities/${activityId}/assignees/${world.ids.student}`).expect(404);
    });

    it('el encargado añade y quita enlaces adjuntos', async () => {
      const activityId = await createActivity(await createBoard());
      await assign(activityId);
      const student = await world.as('student');

      const added = await student
        .post(`/api/activities/${activityId}/attachments`)
        .send({ url: 'https://example.test/articulo.pdf' })
        .expect(201);
      expect(added.body.attachments).toEqual([
        expect.objectContaining({ kind: 'LINK', url: 'https://example.test/articulo.pdf', createdBy: { id: world.ids.student, fullName: 'Usuario de Prueba' } }),
      ]);

      await student.post(`/api/activities/${activityId}/attachments`).send({ url: 'javascript:alert(1)' }).expect(400);
      await (await world.as('student2'))
        .post(`/api/activities/${activityId}/attachments`)
        .send({ url: 'https://example.test/x' })
        .expect(403);

      const attachmentId = added.body.attachments[0].id;
      const removed = await student.delete(`/api/activities/${activityId}/attachments/${attachmentId}`).expect(200);
      expect(removed.body.attachments).toEqual([]);
    });

    it('el tutor aprueba o rechaza; PENDING reinicia la aprobación (P-12)', async () => {
      const activityId = await createActivity(await createBoard());
      const tutor = await world.as('tutor');
      await tutor.patch(`/api/activities/${activityId}`).send({ progressStatus: 'DONE' }).expect(200);

      await (await world.as('leader')).post(`/api/activities/${activityId}/approval`).send({ status: 'APPROVED' }).expect(403);

      const approved = await tutor.post(`/api/activities/${activityId}/approval`).send({ status: 'APPROVED' }).expect(200);
      expect(approved.body).toMatchObject({
        approvalStatus: 'APPROVED',
        approvedBy: { id: world.ids.tutor },
        approvedAt: expect.any(String),
      });

      const rejected = await tutor.post(`/api/activities/${activityId}/approval`).send({ status: 'REJECTED' }).expect(200);
      expect(rejected.body.approvalStatus).toBe('REJECTED');

      const reset = await tutor.post(`/api/activities/${activityId}/approval`).send({ status: 'PENDING' }).expect(200);
      expect(reset.body).toMatchObject({ approvalStatus: 'PENDING', approvedBy: null, approvedAt: null });
    });

    it('el tutor fija el resultado, independiente del progreso (RN-04)', async () => {
      const activityId = await createActivity(await createBoard());
      const res = await (await world.as('tutor'))
        .patch(`/api/activities/${activityId}`)
        .send({ progressStatus: 'DONE', result: 'FAILURE' })
        .expect(200);
      expect(res.body).toMatchObject({ progressStatus: 'DONE', result: 'FAILURE' });
    });

    it('el líder elimina actividades (lógicamente) y dejan de listarse', async () => {
      const boardId = await createBoard();
      const activityId = await createActivity(boardId);
      await (await world.as('student')).delete(`/api/activities/${activityId}`).expect(403);
      await (await world.as('leader')).delete(`/api/activities/${activityId}`).expect(204);
      expect((await (await world.as('tutor')).get(`/api/boards/${boardId}/activities`).expect(200)).body).toEqual([]);
      const board = await (await world.as('tutor')).get(`/api/boards/${boardId}`).expect(200);
      expect(board.body.activityCount).toBe(0);
    });

    it('rechaza aprobar o rechazar una actividad que no está en DONE (409)', async () => {
      const activityId = await createActivity(await createBoard());
      const tutor = await world.as('tutor');
      for (const status of ['APPROVED', 'REJECTED']) {
        const res = await tutor.post(`/api/activities/${activityId}/approval`).send({ status }).expect(409);
        expect(res.body.message).toBe('Solo se puede aprobar o rechazar una actividad con progreso Terminada (DONE).');
      }
      await (await world.as('admin')).post(`/api/activities/${activityId}/approval`).send({ status: 'APPROVED' }).expect(409);
      await tutor.patch(`/api/activities/${activityId}`).send({ progressStatus: 'IN_PROGRESS' }).expect(200);
      await tutor.post(`/api/activities/${activityId}/approval`).send({ status: 'APPROVED' }).expect(409);
      // Reiniciar a PENDING siempre es posible.
      await tutor.post(`/api/activities/${activityId}/approval`).send({ status: 'PENDING' }).expect(200);
    });

    it('cualquier tutor activo del proyecto aprueba; uno ajeno no', async () => {
      const activityId = await createActivity(await createBoard());
      await (await world.as('tutor')).patch(`/api/activities/${activityId}`).send({ progressStatus: 'DONE' }).expect(200);
      await (await world.as('dean')).post(`/api/projects/${projectId}/members`).send({ userId: world.ids.tutor2, projectRole: 'TUTOR' }).expect(201);
      const res = await (await world.as('tutor2')).post(`/api/activities/${activityId}/approval`).send({ status: 'APPROVED' }).expect(200);
      expect(res.body.approvedBy).toMatchObject({ id: world.ids.tutor2 });
    });

    it.each(['IN_PROGRESS', 'PENDING', 'CANCELLED'] as const)(
      'al salir de DONE (%s) la aprobación vuelve a PENDING y se limpia el aprobador',
      async (progressStatus) => {
        const activityId = await createActivity(await createBoard());
        const tutor = await world.as('tutor');
        await tutor.patch(`/api/activities/${activityId}`).send({ progressStatus: 'DONE' }).expect(200);
        await tutor.post(`/api/activities/${activityId}/approval`).send({ status: 'REJECTED' }).expect(200);

        const res = await tutor.patch(`/api/activities/${activityId}`).send({ progressStatus }).expect(200);
        expect(res.body).toMatchObject({ progressStatus, approvalStatus: 'PENDING', approvedBy: null, approvedAt: null });
      },
    );

    it('mantener DONE conserva la aprobación', async () => {
      const activityId = await createActivity(await createBoard());
      const tutor = await world.as('tutor');
      await tutor.patch(`/api/activities/${activityId}`).send({ progressStatus: 'DONE' }).expect(200);
      await tutor.post(`/api/activities/${activityId}/approval`).send({ status: 'APPROVED' }).expect(200);
      const res = await tutor.patch(`/api/activities/${activityId}`).send({ progressStatus: 'DONE', result: 'SUCCESS' }).expect(200);
      expect(res.body).toMatchObject({ approvalStatus: 'APPROVED', approvedBy: { id: world.ids.tutor } });
    });

    it('el líder gestiona encargados en cualquier actividad del proyecto', async () => {
      const activityId = await createActivity(await createBoard(), 'tutor');
      await (await world.as('leader')).post(`/api/activities/${activityId}/assignees`).send({ userId: world.ids.student2 }).expect(201);
    });

    it('el decano ve el proyecto pero no gestiona actividades', async () => {
      const boardId = await createBoard();
      await (await world.as('dean')).get(`/api/boards/${boardId}/activities`).expect(200);
      await (await world.as('dean')).post(`/api/boards/${boardId}/activities`).send({ title: 'X' }).expect(403);
    });

    it('el administrador tiene acceso total', async () => {
      const boardId = await createBoard();
      const activityId = await createActivity(boardId, 'tutor');
      await (await world.as('tutor')).patch(`/api/activities/${activityId}`).send({ progressStatus: 'DONE' }).expect(200);
      await (await world.as('admin')).post(`/api/activities/${activityId}/approval`).send({ status: 'APPROVED' }).expect(200);
    });
  });
});
