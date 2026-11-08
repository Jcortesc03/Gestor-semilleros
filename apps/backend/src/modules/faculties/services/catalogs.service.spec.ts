import type { PrismaService } from '../../../database/prisma.service';
import { CatalogsService } from './catalogs.service';

function setup() {
  const prisma = {
    area: { findMany: jest.fn(async (_args: unknown) => []) },
    faculty: { findMany: jest.fn(async (_args: unknown) => []) },
  };
  return { service: new CatalogsService(prisma as unknown as PrismaService), prisma };
}

describe('CatalogsService.listAreas', () => {
  it('sin scope no filtra por encargado', async () => {
    const { service, prisma } = setup();
    await service.listAreas(null, 'u1');
    expect(prisma.area.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });

  it('con scope managed filtra por las asignaciones del usuario', async () => {
    const { service, prisma } = setup();
    await service.listAreas('managed', 'u1');
    expect(prisma.area.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { managers: { some: { userId: 'u1' } } } }),
    );
  });
});

describe('CatalogsService.listFaculties', () => {
  it('sin scope no filtra por decano', async () => {
    const { service, prisma } = setup();
    await service.listFaculties(null, 'u1');
    expect(prisma.faculty.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });

  it('con scope dean filtra por decanato vigente (endsAt nulo o futuro)', async () => {
    const { service, prisma } = setup();
    const before = Date.now();
    await service.listFaculties('dean', 'u1');

    const args = prisma.faculty.findMany.mock.calls[0]?.[0] as {
      where: { deans: { some: { userId: string; OR: [{ endsAt: null }, { endsAt: { gt: Date } }] } } };
      orderBy: unknown;
    };
    const some = args.where.deans.some;
    expect(some.userId).toBe('u1');
    expect(some.OR[0]).toEqual({ endsAt: null });
    expect(some.OR[1].endsAt.gt).toBeInstanceOf(Date);
    expect(some.OR[1].endsAt.gt.getTime()).toBeGreaterThanOrEqual(before);
    expect(args.orderBy).toEqual({ name: 'asc' });
  });
});
