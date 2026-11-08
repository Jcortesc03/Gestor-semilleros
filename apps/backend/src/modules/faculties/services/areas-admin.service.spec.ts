import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import { AreasAdminService } from './areas-admin.service';

const user = (roles: AuthUser['roles']): AuthUser => ({ id: 'u1', email: 'a@example.test', fullName: 'A', roles }) as AuthUser;

function setup(opts: { area?: boolean; assigned?: boolean; clash?: boolean; projects?: number; audiences?: number } = {}) {
  const prisma = {
    area: {
      findUnique: jest.fn(async () => (opts.area === false ? null : { id: 'a1' })),
      findFirst: jest.fn(async () => (opts.clash ? { id: 'otra' } : null)),
      update: jest.fn(async () => ({ id: 'a1', name: 'N', description: null })),
      delete: jest.fn(async () => ({})),
    },
    areaManager: { findUnique: jest.fn(async () => (opts.assigned ? { userId: 'u1' } : null)) },
    project: { count: jest.fn(async () => opts.projects ?? 0) },
    announcementAudience: { count: jest.fn(async () => opts.audiences ?? 0) },
  };
  return { service: new AreasAdminService(prisma as unknown as PrismaService), prisma };
}

describe('AreasAdminService.update', () => {
  it('permite al administrador sin comprobar asignación', async () => {
    const { service, prisma } = setup();
    await service.update(user(['ADMIN']), 'a1', { name: 'N' });
    expect(prisma.areaManager.findUnique).not.toHaveBeenCalled();
    expect(prisma.area.update).toHaveBeenCalled();
  });

  it('permite al encargado asignado y rechaza al no asignado', async () => {
    await expect(setup({ assigned: true }).service.update(user(['AREA_MANAGER']), 'a1', { name: 'N' })).resolves.toBeDefined();
    await expect(setup().service.update(user(['AREA_MANAGER']), 'a1', { name: 'N' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(setup().service.update(user(['TUTOR']), 'a1', { name: 'N' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('responde 404 y 409', async () => {
    await expect(setup({ area: false }).service.update(user(['ADMIN']), 'a1', { name: 'N' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ clash: true }).service.update(user(['ADMIN']), 'a1', { name: 'N' })).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AreasAdminService.remove', () => {
  it('elimina un área sin dependencias', async () => {
    const { service, prisma } = setup();
    await service.remove('a1');
    expect(prisma.area.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('responde 409 con proyectos o audiencias y no borra', async () => {
    for (const opts of [{ projects: 1 }, { audiences: 2 }]) {
      const { service, prisma } = setup(opts);
      await expect(service.remove('a1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.area.delete).not.toHaveBeenCalled();
    }
  });
});
