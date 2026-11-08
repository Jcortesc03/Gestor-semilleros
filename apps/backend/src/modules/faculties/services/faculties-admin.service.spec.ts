import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../database/prisma.service';
import { FacultiesAdminService } from './faculties-admin.service';

const row = (over: Partial<{ id: string; endsAt: Date | null; startsAt: Date }> = {}) => ({
  id: 'd1',
  startsAt: new Date('2026-01-01T00:00:00Z'),
  endsAt: null,
  user: { id: 'u1', fullName: 'Decano', email: 'decano@example.test' },
  ...over,
});

function setup(opts: { faculty?: boolean; user?: unknown; current?: { id: string; userId: string; startsAt: Date } | null; deans?: unknown[] } = {}) {
  const tx = {
    facultyDean: {
      findFirst: jest.fn(async () => opts.current ?? null),
      update: jest.fn(async () => ({})),
      create: jest.fn(async () => row({ id: 'nuevo' })),
    },
  };
  const prisma = {
    faculty: { findUnique: jest.fn(async () => (opts.faculty === false ? null : { id: 'f1' })) },
    user: { findUnique: jest.fn(async () => opts.user ?? null) },
    facultyDean: { findMany: jest.fn(async () => opts.deans ?? []) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { service: new FacultiesAdminService(prisma as unknown as PrismaService), tx, prisma };
}

const activeDean = { status: 'ACTIVE', roles: [{ role: 'DEAN' }] };

describe('FacultiesAdminService.assignDean', () => {
  it('cierra el decanato vigente y crea uno nuevo', async () => {
    const { service, tx } = setup({ user: activeDean, current: { id: "viejo", userId: "otro", startsAt: new Date("2026-01-01T00:00:00Z") } });
    const dean = await service.assignDean('f1', 'u1');
    expect(tx.facultyDean.update).toHaveBeenCalledWith({ where: { id: 'viejo' }, data: { endsAt: expect.any(Date) } });
    expect(tx.facultyDean.create).toHaveBeenCalled();
    expect(dean).toMatchObject({ id: 'nuevo', userId: 'u1', endsAt: null });
  });

  it('crea el decanato sin cerrar nada si no había vigente', async () => {
    const { service, tx } = setup({ user: activeDean });
    await service.assignDean('f1', 'u1');
    expect(tx.facultyDean.update).not.toHaveBeenCalled();
  });

  it('responde 409 si el usuario ya es el vigente', async () => {
    const { service, tx } = setup({ user: activeDean, current: { id: "v", userId: "u1", startsAt: new Date("2026-01-01T00:00:00Z") } });
    await expect(service.assignDean('f1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.facultyDean.create).not.toHaveBeenCalled();
  });

  it('valida facultad, usuario, estado y rol', async () => {
    await expect(setup({ faculty: false }).service.assignDean('f1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup().service.assignDean('f1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ user: { status: 'INACTIVE', roles: [{ role: 'DEAN' }] } }).service.assignDean('f1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ user: { status: 'ACTIVE', roles: [{ role: 'TUTOR' }] } }).service.assignDean('f1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('FacultiesAdminService.listDeans', () => {
  it('pone primero el vigente', async () => {
    const closed = row({ id: 'cerrado', endsAt: new Date('2026-06-01T00:00:00Z'), startsAt: new Date('2026-03-01T00:00:00Z') });
    const current = row({ id: 'vigente', startsAt: new Date('2026-06-01T00:00:00Z') });
    const { service } = setup({ deans: [closed, current] });
    expect((await service.listDeans('f1')).map((d) => d.id)).toEqual(['vigente', 'cerrado']);
  });
});
