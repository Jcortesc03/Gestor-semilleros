import type { INestApplication } from '@nestjs/common';
import { DOCUMENT_STORAGE } from '../src/modules/documents';
import { buildProject, buildWorld, type World } from './fixtures';
import { createTestApp, newAgent, resetDatabase } from './helpers';
import { MemoryStorage } from './memory-storage';

const pad = (head: Buffer, size = 64) => Buffer.concat([head, Buffer.alloc(size, 1)]);
const SAMPLES: Record<string, { content: Buffer; format: string; mimeType: string }> = {
  'informe.pdf': { content: pad(Buffer.from('%PDF-1.7\n')), format: 'PDF', mimeType: 'application/pdf' },
  'antiguo.doc': { content: pad(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])), format: 'WORD', mimeType: 'application/msword' },
  'tesis.docx': {
    content: pad(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
    format: 'WORD',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  'antiguo.xls': { content: pad(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])), format: 'EXCEL', mimeType: 'application/vnd.ms-excel' },
  'datos.xlsx': {
    content: pad(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
    format: 'EXCEL',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  'foto.png': { content: pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), format: 'IMAGE', mimeType: 'image/png' },
  'foto.jpg': { content: pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), format: 'IMAGE', mimeType: 'image/jpeg' },
  'foto.jpeg': { content: pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), format: 'IMAGE', mimeType: 'image/jpeg' },
  'foto.webp': {
    content: pad(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])),
    format: 'IMAGE',
    mimeType: 'image/webp',
  },
};
const PDF = SAMPLES['informe.pdf'].content;

describe('Documentos (e2e)', () => {
  let app: INestApplication;
  let storage: MemoryStorage;
  let world: World;
  let projectId: string;

  beforeAll(async () => {
    storage = new MemoryStorage();
    app = await createTestApp([{ token: DOCUMENT_STORAGE, value: storage }]);
  });

  beforeEach(async () => {
    storage.objects.clear();
    storage.failPut = false;
    await resetDatabase(app);
    world = await buildWorld(app);
    projectId = (await buildProject(world)).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const url = (id = projectId) => `/api/projects/${id}/documents`;

  async function upload(person: Parameters<World['as']>[0], name = 'informe.pdf', content: Buffer = PDF, id = projectId) {
    return (await world.as(person)).post(url(id)).attach('file', content, { filename: name });
  }

  async function uploaded(person: Parameters<World['as']>[0] = 'student', name = 'informe.pdf') {
    const res = await upload(person, name, SAMPLES[name]?.content ?? PDF);
    expect(res.status).toBe(201);
    return res.body as { id: string };
  }

  describe('subida', () => {
    it.each(Object.entries(SAMPLES))('acepta %s', async (name, sample) => {
      const res = await upload('student', name, sample.content);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        projectId,
        fileName: name,
        format: sample.format,
        mimeType: sample.mimeType,
        sizeBytes: sample.content.length,
        uploadedBy: { id: world.ids.student },
      });
      expect(res.body).not.toHaveProperty('storageKey');
      const row = await world.prisma.document.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.storageKey).toMatch(new RegExp(`^projects/${projectId}/[0-9a-f-]{36}$`));
      expect(storage.objects.get(row.storageKey)?.body.equals(sample.content)).toBe(true);
      expect(storage.objects.get(row.storageKey)?.contentType).toBe(sample.mimeType);
    });

    it('conserva nombres con tildes y quita rutas', async () => {
      const res = await upload('student', '../../Informe de avance ñandú.pdf');
      expect(res.status).toBe(201);
      expect(res.body.fileName).toBe('Informe de avance ñandú.pdf');
    });

    it('rechaza archivos de más de 25 MB con 413', async () => {
      const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(25 * 1024 * 1024)]);
      const res = await upload('student', 'grande.pdf', big);
      expect(res.status).toBe(413);
      expect(res.body).toEqual({ message: 'El archivo supera el tamaño máximo de 25 MB.' });
      expect(storage.objects.size).toBe(0);
    });

    it('rechaza una firma que no corresponde a la extensión', async () => {
      const res = await upload('student', 'falso.pdf', SAMPLES['foto.png'].content);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ message: 'Datos inválidos.', errors: ['El contenido del archivo no corresponde a su tipo.'] });
      expect(storage.objects.size).toBe(0);
    });

    it('rechaza extensiones no admitidas', async () => {
      const res = await upload('student', 'script.exe');
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Datos inválidos.');
      expect(res.body.errors[0]).toMatch(/^Formato no admitido\./);
    });

    it('rechaza peticiones sin archivo, con campo equivocado o con varios archivos', async () => {
      const agent = await world.as('student');
      await agent.post(url()).send({}).expect(400);
      await agent.post(url()).attach('otro', PDF, { filename: 'a.pdf' }).expect(400);
      const many = await agent.post(url()).attach('file', PDF, { filename: 'a.pdf' }).attach('file', PDF, { filename: 'b.pdf' });
      expect(many.status).toBe(400);
      expect(many.body.errors).toEqual(['Debe enviar un único archivo en el campo "file".']);
    });

    it('no crea la fila si falla la escritura en el almacenamiento', async () => {
      storage.failPut = true;
      const res = await upload('student');
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ message: 'El almacenamiento de documentos no está disponible.' });
      expect(await world.prisma.document.count()).toBe(0);
    });

    it('exige sesión y UUID válido', async () => {
      const anonymous = await newAgent(app).post(url()).attach('file', PDF, { filename: 'a.pdf' });
      expect(anonymous.status).toBe(401);
      await (await world.as('student')).post('/api/projects/no-es-uuid/documents').expect(400);
    });
  });

  describe('permisos', () => {
    it.each(['tutor', 'leader', 'student', 'admin', 'dean', 'areaManager'] as const)('%s sube, lista y descarga', async (person) => {
      const doc = await uploaded(person);
      const agent = await world.as(person);
      const list = (await agent.get(url()).expect(200)).body;
      expect(list).toMatchObject({ total: 1, page: 1, pageSize: 20 });
      expect(list.items).toHaveLength(1);
      await agent.get(`/api/documents/${doc.id}/download`).expect(200);
    });

    it.each(['outsider', 'otherDean'] as const)('%s no ve el proyecto (404)', async (person) => {
      const doc = await uploaded('student');
      const agent = await world.as(person);
      expect((await upload(person)).status).toBe(404);
      await agent.get(url()).expect(404);
      await agent.get(`/api/documents/${doc.id}/download`).expect(404);
      await agent.delete(`/api/documents/${doc.id}`).expect(404);
    });

    it('un participante retirado deja de ver los documentos', async () => {
      const doc = await uploaded('student');
      await world.prisma.projectMember.updateMany({ where: { projectId, userId: world.ids.student }, data: { status: 'INACTIVE', leftAt: new Date() } });
      await (await world.as('student')).get(`/api/documents/${doc.id}/download`).expect(404);
    });

    it('el estudiante no elimina lo de otro, pero sí lo suyo', async () => {
      const byLeader = await uploaded('leader');
      const student = await world.as('student');
      expect((await student.delete(`/api/documents/${byLeader.id}`).expect(403)).body.message).toBe(
        'No tienes permisos para realizar esta acción.',
      );
      const own = await uploaded('student');
      await student.delete(`/api/documents/${own.id}`).expect(204);
    });

    it.each(['tutor', 'admin', 'dean', 'areaManager'] as const)('%s elimina documentos ajenos', async (person) => {
      const doc = await uploaded('student');
      await (await world.as(person)).delete(`/api/documents/${doc.id}`).expect(204);
    });

    it('un tutor que no es del proyecto no ve ni elimina', async () => {
      const doc = await uploaded('student');
      await (await world.as('tutor2')).delete(`/api/documents/${doc.id}`).expect(404);
    });
  });

  describe('listado, descarga y borrado', () => {
    it('lista del más reciente al más antiguo, sin los eliminados', async () => {
      const first = await uploaded('student', 'informe.pdf');
      await uploaded('leader', 'datos.xlsx');
      const third = await uploaded('tutor', 'foto.png');
      await (await world.as('tutor')).delete(`/api/documents/${first.id}`).expect(204);
      const list = (await (await world.as('student')).get(url()).expect(200)).body as {
        items: { id: string; fileName: string }[];
        total: number;
      };
      expect(list.total).toBe(2);
      expect(list.items.map((d) => d.fileName)).toEqual(['foto.png', 'datos.xlsx']);
      expect(list.items[0].id).toBe(third.id);
    });

    it('pagina el listado en el servidor conservando el orden y el total', async () => {
      const first = await uploaded('student', 'informe.pdf');
      const second = await uploaded('leader', 'datos.xlsx');
      const third = await uploaded('tutor', 'foto.png');
      const student = await world.as('student');

      const page1 = (await student.get(`${url()}?page=1&pageSize=2`).expect(200)).body as {
        items: { id: string }[];
        total: number;
        page: number;
        pageSize: number;
      };
      expect(page1).toMatchObject({ total: 3, page: 1, pageSize: 2 });
      expect(page1.items.map((d) => d.id)).toEqual([third.id, second.id]);

      const page2 = (await student.get(`${url()}?page=2&pageSize=2`).expect(200)).body as { items: { id: string }[] };
      expect(page2.items.map((d) => d.id)).toEqual([first.id]);
    });

    it('una página posterior al final devuelve la lista vacía con el total real', async () => {
      await uploaded('student', 'informe.pdf');
      const res = await (await world.as('student')).get(`${url()}?page=7&pageSize=2`).expect(200);
      expect(res.body).toMatchObject({ items: [], total: 1, page: 7, pageSize: 2 });
    });

    it('responde 400 con parámetros de paginación inválidos o desconocidos', async () => {
      const student = await world.as('student');
      const page = await student.get(`${url()}?page=0`).expect(400);
      expect(page.body.message).toBe('Datos inválidos.');
      expect(page.body.errors).toContain('page debe ser un entero mayor o igual que 1.');

      const size = await student.get(`${url()}?pageSize=101`).expect(400);
      expect(size.body.errors).toContain('pageSize debe ser un entero entre 1 y 100.');

      const unknown = await student.get(`${url()}?search=x`).expect(400);
      expect(unknown.body.errors).toContain('Campos no permitidos: search.');
    });

    it('descarga los bytes exactos con las cabeceras del contrato', async () => {
      const res = await upload('student', 'Informe (final) ñ.pdf');
      const download = await (await world.as('leader'))
        .get(`/api/documents/${res.body.id}/download`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect((download.body as Buffer).equals(PDF)).toBe(true);
      expect(download.headers['content-type']).toBe('application/pdf');
      expect(download.headers['content-length']).toBe(String(PDF.length));
      expect(download.headers['content-disposition']).toBe(
        "attachment; filename*=UTF-8''Informe%20%28final%29%20%C3%B1.pdf",
      );
      expect(download.headers['cache-control']).toBe('private, no-store');
    });

    it('con ?inline=true usa inline', async () => {
      const doc = await uploaded('student');
      const res = await (await world.as('student')).get(`/api/documents/${doc.id}/download?inline=true`).expect(200);
      expect(res.headers['content-disposition']).toMatch(/^inline; filename\*=UTF-8''/);
    });

    it('responde 404 al descargar un documento eliminado o inexistente', async () => {
      const doc = await uploaded('student');
      const agent = await world.as('student');
      await agent.delete(`/api/documents/${doc.id}`).expect(204);
      expect((await agent.get(`/api/documents/${doc.id}/download`).expect(404)).body.message).toBe('Documento no encontrado.');
      await agent.get('/api/documents/00000000-0000-4000-8000-000000000000/download').expect(404);
      await agent.delete(`/api/documents/${doc.id}`).expect(404);
    });

    it('el borrado es lógico y conserva el objeto', async () => {
      const doc = await uploaded('student');
      await (await world.as('student')).delete(`/api/documents/${doc.id}`).expect(204);
      const row = await world.prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(row.deletedAt).not.toBeNull();
      expect(storage.objects.has(row.storageKey)).toBe(true);
    });

    it('responde 503 si el objeto no se puede leer', async () => {
      const doc = await uploaded('student');
      storage.objects.clear();
      const res = await (await world.as('student')).get(`/api/documents/${doc.id}/download`).expect(503);
      expect(res.body.message).toBe('El almacenamiento de documentos no está disponible.');
    });
  });

  describe('adjuntos de actividades', () => {
    async function activity(): Promise<string> {
      const tutor = await world.as('tutor');
      const board = (
        await tutor
          .post(`/api/projects/${projectId}/boards`)
          .send({ title: 'Tablero', dueDate: '2026-12-15', responsibleTutorId: world.ids.tutor, responsibleStudentId: world.ids.leader })
          .expect(201)
      ).body.id as string;
      return (await tutor.post(`/api/boards/${board}/activities`).send({ title: 'Actividad' }).expect(201)).body.id as string;
    }

    it('adjunta un documento del mismo proyecto y lo devuelve con su resumen', async () => {
      const doc = await uploaded('student');
      const activityId = await activity();
      const res = await (await world.as('leader'))
        .post(`/api/activities/${activityId}/attachments`)
        .send({ kind: 'DOCUMENT', documentId: doc.id })
        .expect(201);
      expect(res.body.attachments).toHaveLength(1);
      expect(res.body.attachments[0]).toMatchObject({
        kind: 'DOCUMENT',
        url: null,
        documentId: doc.id,
        document: { id: doc.id, fileName: 'informe.pdf', format: 'PDF', sizeBytes: PDF.length },
      });
    });

    it('sigue aceptando enlaces, con document null', async () => {
      const activityId = await activity();
      const res = await (await world.as('leader'))
        .post(`/api/activities/${activityId}/attachments`)
        .send({ kind: 'LINK', url: 'https://example.test/a' })
        .expect(201);
      expect(res.body.attachments[0]).toMatchObject({ kind: 'LINK', url: 'https://example.test/a', document: null });
    });

    it('rechaza (400) documentos de otro proyecto, eliminados o inexistentes', async () => {
      const activityId = await activity();
      const dean = await world.as('dean');
      const other = (
        await dean.post('/api/projects').send({ title: 'Otro', areaId: world.area.id, facultyIds: [world.facultyA.id] }).expect(201)
      ).body.id as string;
      const foreign = (await upload('admin', 'informe.pdf', PDF, other)).body.id as string;
      const deleted = await uploaded('student');
      await (await world.as('student')).delete(`/api/documents/${deleted.id}`).expect(204);

      const tutor = await world.as('tutor');
      for (const documentId of [foreign, deleted.id, '00000000-0000-4000-8000-000000000000']) {
        const res = await tutor.post(`/api/activities/${activityId}/attachments`).send({ kind: 'DOCUMENT', documentId }).expect(400);
        expect(res.body.errors).toEqual(['documentId debe ser un documento del mismo proyecto que no esté eliminado.']);
      }
      await tutor.post(`/api/activities/${activityId}/attachments`).send({ kind: 'DOCUMENT' }).expect(400);
    });

    it('no permite eliminar un documento adjunto (409) hasta quitar el adjunto', async () => {
      const doc = await uploaded('student');
      const activityId = await activity();
      const tutor = await world.as('tutor');
      const attached = await tutor.post(`/api/activities/${activityId}/attachments`).send({ kind: 'DOCUMENT', documentId: doc.id }).expect(201);
      const res = await tutor.delete(`/api/documents/${doc.id}`).expect(409);
      expect(res.body.message).toBe('El documento está adjunto a actividades; quítalo de ellas primero.');
      await tutor.delete(`/api/activities/${activityId}/attachments/${attached.body.attachments[0].id}`).expect(200);
      await tutor.delete(`/api/documents/${doc.id}`).expect(204);
    });

    it('un adjunto en una actividad eliminada no bloquea el borrado', async () => {
      const doc = await uploaded('student');
      const activityId = await activity();
      const tutor = await world.as('tutor');
      await tutor.post(`/api/activities/${activityId}/attachments`).send({ kind: 'DOCUMENT', documentId: doc.id }).expect(201);
      await tutor.delete(`/api/activities/${activityId}`).expect(204);
      await tutor.delete(`/api/documents/${doc.id}`).expect(204);
    });
  });

  describe('sin almacenamiento configurado', () => {
    let bare: INestApplication;

    beforeAll(async () => {
      bare = await createTestApp([{ token: DOCUMENT_STORAGE, value: new MemoryStorage(false) }]);
    });

    afterAll(async () => {
      await bare.close();
    });

    it('subida y descarga responden 503; el resto sigue funcionando', async () => {
      await resetDatabase(bare);
      const bareWorld = await buildWorld(bare);
      const project = await buildProject(bareWorld);
      const tutor = await bareWorld.as('tutor');
      const res = await tutor.post(`/api/projects/${project.id}/documents`).attach('file', PDF, { filename: 'a.pdf' });
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ message: 'El almacenamiento de documentos no está disponible.' });
      const doc = await bareWorld.prisma.document.create({
        data: { projectId: project.id, uploadedById: bareWorld.ids.tutor, fileName: 'a.pdf', format: 'PDF', mimeType: 'application/pdf', sizeBytes: 1, storageKey: 'k' },
      });
      await tutor.get(`/api/documents/${doc.id}/download`).expect(503);
      await tutor.get(`/api/projects/${project.id}/documents`).expect(200);
      await tutor.delete(`/api/documents/${doc.id}`).expect(204);
    });
  });
});
