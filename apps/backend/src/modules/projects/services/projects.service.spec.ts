import type { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import type { ProjectAccessService } from './project-access.service';
import { ProjectsService } from './projects.service';

const usuario: AuthUser = {
  mustChangePassword: false,
  id: 'usuario-1',
  email: 'usuario-1@example.test',
  fullName: 'Usuario de Prueba',
  roles: ['STUDENT'],
};

function setup(membresias: unknown[] = []) {
  const findMany = jest.fn(async () => membresias);
  const prisma = { projectMember: { findMany } };
  const service = new ProjectsService(prisma as unknown as PrismaService, {} as ProjectAccessService);
  return { service, findMany };
}

describe('ProjectsService.tutored', () => {
  it('consulta solo membresías activas de tutor en proyectos no eliminados, ordenadas por título', async () => {
    const { service, findMany } = setup();

    await service.tutored(usuario);

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'usuario-1', status: 'ACTIVE', projectRole: 'TUTOR', project: { deletedAt: null } },
      select: { isPrimary: true, project: { select: { id: true, title: true, status: true } } },
      orderBy: { project: { title: 'asc' } },
    });
  });

  it('mapea cada membresía a { id, title, status, isPrimaryTutor }', async () => {
    const { service } = setup([
      { isPrimary: true, project: { id: 'p-1', title: 'Alfa', status: 'ACTIVE' } },
      { isPrimary: false, project: { id: 'p-2', title: 'Beta', status: 'ACTIVE' } },
    ]);

    await expect(service.tutored(usuario)).resolves.toEqual([
      { id: 'p-1', title: 'Alfa', status: 'ACTIVE', isPrimaryTutor: true },
      { id: 'p-2', title: 'Beta', status: 'ACTIVE', isPrimaryTutor: false },
    ]);
  });

  it('devuelve una lista vacía sin tutorías', async () => {
    const { service } = setup([]);

    await expect(service.tutored(usuario)).resolves.toEqual([]);
  });
});

const projectRecord = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  title: 'Proyecto de prueba',
  description: null,
  status: 'ACTIVE',
  area: { id: 'a1', name: 'Área' },
  faculties: [],
  startsOn: null,
  endsOn: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

function setupList(projects: unknown[], total: number) {
  const findMany = jest.fn(async () => projects);
  const count = jest.fn(async () => total);
  const transaction = jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations));
  const prisma = { project: { findMany, count }, $transaction: transaction };
  const access = {
    currentDeanFacultyIds: jest.fn(async (): Promise<string[]> => []),
    managedAreaIds: jest.fn(async (): Promise<string[]> => []),
  };
  const service = new ProjectsService(prisma as unknown as PrismaService, access as unknown as ProjectAccessService);
  return { service, findMany, count, transaction, access };
}

describe('ProjectsService.list', () => {
  it('pide la página con orden estable y cuenta con el mismo filtro', async () => {
    const { service, findMany, count, transaction } = setupList([projectRecord()], 41);

    const result = await service.list(usuario, { search: null, page: 3, pageSize: 20 });

    const where = { deletedAt: null, OR: [{ members: { some: { userId: 'usuario-1', status: 'ACTIVE' } } }] };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 40, take: 20 }));
    expect(count).toHaveBeenCalledWith({ where });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      items: [
        {
          id: 'p1',
          title: 'Proyecto de prueba',
          description: null,
          status: 'ACTIVE',
          area: { id: 'a1', name: 'Área' },
          faculties: [],
          startsOn: null,
          endsOn: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 41,
      page: 3,
      pageSize: 20,
    });
  });

  it('añade la búsqueda por título sin distinguir mayúsculas, combinada con la visibilidad', async () => {
    const { service, findMany, count } = setupList([], 0);

    await service.list(usuario, { search: 'Robótica', page: 1, pageSize: 20 });

    const where = {
      deletedAt: null,
      OR: [{ members: { some: { userId: 'usuario-1', status: 'ACTIVE' } } }],
      title: { contains: 'Robótica', mode: 'insensitive' },
    };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 0, take: 20 }));
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('el administrador ve todos los proyectos sin el filtro de visibilidad', async () => {
    const { service, findMany } = setupList([], 0);

    await service.list({ ...usuario, roles: ['ADMIN'] }, { search: null, page: 1, pageSize: 20 });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null } }));
  });

  it('suma las facultades del decano y las áreas del encargado a la visibilidad (ADR 0010)', async () => {
    const { service, findMany, access } = setupList([], 0);
    access.currentDeanFacultyIds.mockResolvedValueOnce(['f1']);
    access.managedAreaIds.mockResolvedValueOnce(['a1']);

    await service.list({ ...usuario, roles: ['DEAN', 'AREA_MANAGER'] }, { search: null, page: 1, pageSize: 20 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { members: { some: { userId: 'usuario-1', status: 'ACTIVE' } } },
            { faculties: { some: { facultyId: { in: ['f1'] } } } },
            { areaId: { in: ['a1'] } },
          ],
        },
      }),
    );
  });
});
