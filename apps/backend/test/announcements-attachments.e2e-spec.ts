import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/database/prisma.service';
import { DOCUMENT_STORAGE } from '../src/modules/documents';
import { CHANNEL_SENDERS, DeliveryDispatcher, type ChannelSender, type OutboundMessage } from '../src/modules/integrations';
import type { NotificationChannel } from '../src/generated/prisma/enums';
import { buildProject, buildWorld, type Person, type World } from './fixtures';
import { createTestApp, resetDatabase } from './helpers';
import { MemoryStorage } from './memory-storage';

class FakeSender implements ChannelSender {
  sent: { address: string; message: OutboundMessage }[] = [];
  constructor(readonly channel: NotificationChannel) {}
  async send(address: string, message: OutboundMessage): Promise<void> {
    this.sent.push({ address, message });
  }
}

const pad = (head: Buffer, size = 64) => Buffer.concat([head, Buffer.alloc(size, 7)]);
const PDF = pad(Buffer.from('%PDF-1.7\n'));
const PNG = pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const ATTACH_PHRASE = 'Incluye 2 archivo(s) adjunto(s): consúltalos en la plataforma.';

describe('Noticias con archivos adjuntos (e2e)', () => {
  const email = new FakeSender('EMAIL');
  const whatsapp = new FakeSender('WHATSAPP');
  let app: INestApplication;
  let storage: MemoryStorage;
  let world: World;
  let projectId: string;

  beforeAll(async () => {
    storage = new MemoryStorage();
    app = await createTestApp([
      { token: DOCUMENT_STORAGE, value: storage },
      { token: CHANNEL_SENDERS, value: [email, whatsapp] },
    ]);
  });

  beforeEach(async () => {
    storage.objects.clear();
    storage.failPut = false;
    email.sent = [];
    whatsapp.sent = [];
    await resetDatabase(app);
    world = await buildWorld(app);
    projectId = (await buildProject(world)).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const data = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({ kind: 'NEWS', title: 'Convocatoria', content: 'Detalles', audiences: [{ type: 'PROJECT', projectId }], ...extra });

  async function publishWithFiles(by: Person, files: { name: string; content: Buffer }[], extra: Record<string, unknown> = {}) {
    let req = (await world.as(by)).post('/api/announcements').field('data', data(extra));
    for (const f of files) req = req.attach('files', f.content, { filename: f.name });
    return req;
  }
  const count = () => app.get(PrismaService).announcement.count();

  it('publica una noticia con 2 archivos y los descarga con los bytes exactos', async () => {
    const res = await publishWithFiles('tutor', [
      { name: 'convocatoria.pdf', content: PDF },
      { name: 'cartel.png', content: PNG },
    ]).then((r) => r);
    expect(res.status).toBe(201);
    expect(res.body.attachments).toEqual([
      { id: expect.any(String), fileName: 'convocatoria.pdf', format: 'PDF', mimeType: 'application/pdf', sizeBytes: PDF.length },
      { id: expect.any(String), fileName: 'cartel.png', format: 'IMAGE', mimeType: 'image/png', sizeBytes: PNG.length },
    ]);
    expect(JSON.stringify(res.body)).not.toContain('storageKey');
    expect([...storage.objects.keys()].every((k) => k.startsWith(`announcements/${res.body.id}/`))).toBe(true);
    expect(storage.objects.size).toBe(2);

    const student = await world.as('student');
    const feed = (await student.get('/api/announcements').expect(200)).body;
    expect(feed[0].attachments).toHaveLength(2);
    expect((await student.get(`/api/announcements/${res.body.id}`).expect(200)).body.attachments).toHaveLength(2);

    const [pdf, png] = res.body.attachments as { id: string }[];
    const download = await student
      .get(`/api/announcements/${res.body.id}/attachments/${pdf.id}/download`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(download.body).toEqual(PDF);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.headers['content-length']).toBe(String(PDF.length));
    expect(download.headers['content-disposition']).toBe("attachment; filename*=UTF-8''convocatoria.pdf");
    expect(download.headers['cache-control']).toBe('private, no-store');
    const inline = await student.get(`/api/announcements/${res.body.id}/attachments/${png.id}/download?inline=true`).expect(200);
    expect(inline.headers['content-disposition']).toMatch(/^inline;/);
  });

  it('un tipo distinto de NEWS con archivo responde 400 y no crea nada', async () => {
    const res = await publishWithFiles('tutor', [{ name: 'a.pdf', content: PDF }], { kind: 'COMMUNICATION' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(['Solo las noticias (NEWS) admiten archivos adjuntos.']);
    expect(await count()).toBe(0);
    expect(storage.objects.size).toBe(0);
  });

  it('más de 5 archivos responde 400 y no crea nada', async () => {
    const files = Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.pdf`, content: PDF }));
    expect((await publishWithFiles('tutor', files)).status).toBe(400);
    expect(await count()).toBe(0);
    expect(storage.objects.size).toBe(0);
  });

  it('una firma que no corresponde responde 400 y no crea la novedad ni sube objetos', async () => {
    const res = await publishWithFiles('tutor', [
      { name: 'bueno.pdf', content: PDF },
      { name: 'falso.pdf', content: Buffer.from('no soy un pdf') },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(['El contenido del archivo no corresponde a su tipo.']);
    expect(await count()).toBe(0);
    expect(storage.objects.size).toBe(0);
  });

  it('un formato no admitido responde 400', async () => {
    const res = await publishWithFiles('tutor', [{ name: 'script.exe', content: PDF }]);
    expect(res.status).toBe(400);
    expect(await count()).toBe(0);
  });

  it('un cuerpo en data inválido responde 400', async () => {
    const res = await (await world.as('tutor')).post('/api/announcements').field('data', '{no es json').attach('files', PDF, { filename: 'a.pdf' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(['data es obligatorio y debe ser un JSON válido.']);
    expect(await count()).toBe(0);
  });

  it('sin permisos responde 403 antes de subir nada', async () => {
    const res = await publishWithFiles('student', [{ name: 'a.pdf', content: PDF }]);
    expect(res.status).toBe(403);
    expect(storage.objects.size).toBe(0);
  });

  it('si falla la subida a S3 responde 503 y no crea la novedad', async () => {
    storage.failPut = true;
    const res = await publishWithFiles('tutor', [{ name: 'a.pdf', content: PDF }]);
    expect(res.status).toBe(503);
    expect(res.body.message).toBe('El almacenamiento de documentos no está disponible.');
    expect(await count()).toBe(0);
  });

  it('un usuario fuera de la audiencia recibe 404 al descargar', async () => {
    const created = (await publishWithFiles('tutor', [{ name: 'a.pdf', content: PDF }])).body;
    const attachmentId = created.attachments[0].id as string;
    await (await world.as('outsider')).get(`/api/announcements/${created.id}/attachments/${attachmentId}/download`).expect(404);
  });

  it('un adjunto que no pertenece a la novedad indicada responde 404', async () => {
    const a = (await publishWithFiles('tutor', [{ name: 'a.pdf', content: PDF }])).body;
    const b = (await publishWithFiles('tutor', [{ name: 'b.pdf', content: PDF }])).body;
    await (await world.as('student'))
      .get(`/api/announcements/${a.id}/attachments/${b.attachments[0].id}/download`)
      .expect(404);
  });

  it('una novedad eliminada deja de servir sus adjuntos', async () => {
    const created = (await publishWithFiles('tutor', [{ name: 'a.pdf', content: PDF }])).body;
    const url = `/api/announcements/${created.id}/attachments/${created.attachments[0].id}/download`;
    await (await world.as('student')).get(url).expect(200);
    await (await world.as('tutor')).delete(`/api/announcements/${created.id}`).expect(204);
    await (await world.as('student')).get(url).expect(404);
    expect(storage.objects.size).toBe(1);
  });

  it('las copias encoladas incluyen la frase de adjuntos', async () => {
    const created = (
      await publishWithFiles('tutor', [
        { name: 'a.pdf', content: PDF },
        { name: 'b.png', content: PNG },
      ])
    ).body;
    expect(created.queuedDeliveries).toBeGreaterThan(0);
    await app.get(DeliveryDispatcher).runOnce();
    expect(email.sent.length).toBeGreaterThan(0);
    for (const s of email.sent) expect(s.message.body).toContain(ATTACH_PHRASE);
  });

  it('el JSON sin archivos sigue funcionando y devuelve attachments vacío sin frase', async () => {
    const res = await (await world.as('tutor'))
      .post('/api/announcements')
      .send(JSON.parse(data()))
      .expect(201);
    expect(res.body.attachments).toEqual([]);
    await app.get(DeliveryDispatcher).runOnce();
    for (const s of email.sent) expect(s.message.body).not.toContain('adjunto');
  });

  it('multipart sin archivos también publica', async () => {
    const res = await (await world.as('tutor')).post('/api/announcements').field('data', data()).expect(201);
    expect(res.body.attachments).toEqual([]);
  });
});
