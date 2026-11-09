import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import type { ProjectAccess, ProjectAccessService } from '../../projects';
import type { DocumentStorage } from '../models/document-storage';
import { DOCUMENT_ATTACHED, DocumentsService } from './documents.service';

const user: AuthUser = { id: 'u1', email: 'u1@example.test', fullName: 'Usuaria', roles: ['STUDENT'], mustChangePassword: false };
const access = (over: Partial<ProjectAccess> = {}): ProjectAccess => ({
  projectId: 'p1',
  userId: 'u1',
  isAdmin: false,
  isDean: false,
  isAreaManager: false,
  role: 'STUDENT',
  ...over,
});
const PDF = Buffer.from('%PDF-1.4 contenido');
const record = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  projectId: 'p1',
  uploadedById: 'u2',
  fileName: 'a.pdf',
  format: 'PDF',
  mimeType: 'application/pdf',
  sizeBytes: BigInt(PDF.length),
  storageKey: 'projects/p1/k',
  createdAt: new Date('2026-11-07T00:00:00Z'),
  deletedAt: null,
  uploadedBy: { id: 'u2', fullName: 'Otra' },
  ...over,
});

function setup(opts: { configured?: boolean; access?: ProjectAccess; doc?: ReturnType<typeof record> | null; attached?: number; putFails?: boolean; createFails?: boolean; documents?: ReturnType<typeof record>[]; total?: number } = {}) {
  const storage: jest.Mocked<DocumentStorage> = {
    isConfigured: jest.fn(() => opts.configured ?? true),
    put: jest.fn(async (_key: string, _body: Buffer, _type: string) => {
      if (opts.putFails) throw new Error('s3 caído');
    }),
    get: jest.fn(async (_key: string) => Readable.from([PDF])),
    remove: jest.fn(async (_key: string) => undefined),
    head: jest.fn(async (_key: string): Promise<{ sizeBytes: number } | null> => null),
  };
  const prisma = {
    document: {
      create: jest.fn(async () => {
        if (opts.createFails) throw new Error('db caída');
        return record({ uploadedById: 'u1' });
      }),
      findFirst: jest.fn(async () => (opts.doc === undefined ? record() : opts.doc)),
      findMany: jest.fn(async () => opts.documents ?? []),
      count: jest.fn(async () => opts.total ?? opts.documents?.length ?? 0),
      update: jest.fn(async () => undefined),
    },
    activityAttachment: { count: jest.fn(async () => opts.attached ?? 0) },
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  const projects = {
    resolve: jest.fn(async () => opts.access ?? access()),
    assert: (allowed: boolean) => {
      if (!allowed) throw new ForbiddenException();
    },
  };
  const service = new DocumentsService(prisma as unknown as PrismaService, projects as unknown as ProjectAccessService, storage);
  return { service, storage, prisma, projects };
}

const file = (name = 'a.pdf', buffer = PDF) => ({ originalname: name, buffer, size: buffer.length });

describe('DocumentsService.upload', () => {
  it('guarda el objeto con clave projects/<id>/<uuid> y crea la fila', async () => {
    const { service, storage, prisma } = setup();
    const result = await service.upload(user, 'p1', file());
    expect(storage.put).toHaveBeenCalledWith(expect.stringMatching(/^projects\/p1\/[0-9a-f-]{36}$/), PDF, 'application/pdf');
    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fileName: 'a.pdf', format: 'PDF', sizeBytes: PDF.length, uploadedById: 'u1' }) }),
    );
    expect(result).toMatchObject({ id: 'd1', sizeBytes: PDF.length });
    expect(result).not.toHaveProperty('storageKey');
  });

  it('responde 503 sin almacenamiento configurado y no sube nada', async () => {
    const { service, storage } = setup({ configured: false });
    await expect(service.upload(user, 'p1', file())).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('rechaza extensión o firma inválidas sin tocar S3', async () => {
    const { service, storage } = setup();
    await expect(service.upload(user, 'p1', file('a.exe'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload(user, 'p1', file('a.pdf', Buffer.from('MZ....')))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload(user, 'p1', file('../'))).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('si falla el put a S3 no crea la fila', async () => {
    const { service, prisma } = setup({ putFails: true });
    await expect(service.upload(user, 'p1', file())).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('si falla la fila tras subir, borra el objeto', async () => {
    const { service, storage } = setup({ createFails: true });
    await expect(service.upload(user, 'p1', file())).rejects.toThrow('db caída');
    expect(storage.remove).toHaveBeenCalledWith(storage.put.mock.calls[0]?.[0]);
  });
});

describe('DocumentsService.remove', () => {
  it('el estudiante no elimina lo de otro, pero sí lo suyo', async () => {
    await expect(setup().service.remove(user, 'd1')).rejects.toBeInstanceOf(ForbiddenException);
    const own = setup({ doc: record({ uploadedById: 'u1' }) });
    await own.service.remove(user, 'd1');
    expect(own.prisma.document.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { deletedAt: expect.any(Date) } });
  });

  it.each([
    ['tutor', { role: 'TUTOR' as const }],
    ['administrador', { isAdmin: true, role: null }],
    ['decano', { isDean: true, role: null }],
    ['encargado de área', { isAreaManager: true, role: null }],
  ])('permite eliminar al %s', async (_name, over) => {
    await expect(setup({ access: access(over) }).service.remove(user, 'd1')).resolves.toBeUndefined();
  });

  it('el líder no elimina lo ajeno', async () => {
    await expect(setup({ access: access({ role: 'STUDENT_LEADER' }) }).service.remove(user, 'd1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('responde 409 si está adjunto', async () => {
    const { service } = setup({ access: access({ role: 'TUTOR' }), attached: 1 });
    await expect(service.remove(user, 'd1')).rejects.toThrow(new ConflictException(DOCUMENT_ATTACHED).message);
  });

  it('responde 404 si no existe o el proyecto no es visible', async () => {
    await expect(setup({ doc: null }).service.remove(user, 'd1')).rejects.toBeInstanceOf(NotFoundException);
    const hidden = setup();
    hidden.projects.resolve.mockRejectedValueOnce(new NotFoundException());
    await expect(hidden.service.remove(user, 'd1')).rejects.toThrow('Documento no encontrado.');
  });
});

describe('DocumentsService.download', () => {
  it('devuelve el flujo y los metadatos', async () => {
    const result = await setup().service.download(user, 'd1');
    expect(result).toMatchObject({ fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length });
  });

  it('responde 503 si S3 falla o no está configurado', async () => {
    const failing = setup();
    failing.storage.get.mockRejectedValueOnce(new Error('NoSuchKey'));
    await expect(failing.service.download(user, 'd1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(setup({ configured: false }).service.download(user, 'd1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('DocumentsService.list', () => {
  it('devuelve una página ordenada y cuenta con el mismo filtro', async () => {
    const { service, prisma } = setup({ documents: [record(), record({ id: 'd2' })], total: 41 });

    const result = await service.list(user, 'p1', { page: 3, pageSize: 20 });

    const where = { projectId: 'p1', deletedAt: null };
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 40, take: 20 }),
    );
    expect(prisma.document.count).toHaveBeenCalledWith({ where });
    expect(result).toMatchObject({ total: 41, page: 3, pageSize: 20 });
    expect(result.items.map((item) => item.id)).toEqual(['d1', 'd2']);
  });

  it('no consulta si el proyecto no es visible', async () => {
    const { service, prisma, projects } = setup();
    projects.resolve.mockRejectedValueOnce(new NotFoundException());

    await expect(service.list(user, 'p1', { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });
});
