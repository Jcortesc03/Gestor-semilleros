import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../database/prisma.service';
import { PasswordService } from '../../auth';
import { EmailAlreadyRegisteredError, UsersService } from './users.service';

const input = { email: 'nuevo@example.test', fullName: 'Usuario Nuevo', roles: ['TUTOR' as const], password: 'Clave-Segura-1' };

function setup({ existing = null as { id: string } | null, createError = null as unknown } = {}) {
  const create = jest.fn(async ({ data }: { data: { email: string; fullName: string; passwordHash: string | null } }) => {
    if (createError) throw createError;
    return {
      id: 'nuevo-id',
      email: data.email,
      fullName: data.fullName,
      status: 'ACTIVE' as const,
      passwordHash: data.passwordHash,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      roles: [{ role: 'TUTOR' as const }],
    };
  });
  const prisma = { user: { findFirst: jest.fn(async () => existing), create } };
  const passwords = new PasswordService();
  return { service: new UsersService(prisma as unknown as PrismaService, passwords), prisma, passwords, create };
}

describe('UsersService.create', () => {
  it('guarda un hash Argon2 (nunca la contraseña en claro) y no lo devuelve', async () => {
    const { service, create, passwords } = setup();
    const user = await service.create(input);

    const stored = create.mock.calls[0][0].data.passwordHash as string;
    expect(stored).not.toBe(input.password);
    await expect(passwords.verify(stored, input.password)).resolves.toBe(true);
    expect(user).toEqual({
      id: 'nuevo-id',
      email: 'nuevo@example.test',
      fullName: 'Usuario Nuevo',
      status: 'ACTIVE',
      roles: ['TUTOR'],
      hasPassword: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('crea usuarios sin contraseña (solo Google)', async () => {
    const { service, create } = setup();
    const user = await service.create({ ...input, password: null });
    expect(create.mock.calls[0][0].data.passwordHash).toBeNull();
    expect(user.hasPassword).toBe(false);
  });

  it('busca duplicados sin distinguir mayúsculas y responde conflicto', async () => {
    const { service, prisma, create } = setup({ existing: { id: 'otro' } });
    await expect(service.create(input)).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { equals: input.email, mode: 'insensitive' } } }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('traduce la violación de unicidad (alta simultánea) a conflicto', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service } = setup({ createError: error });
    await expect(service.create(input)).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('propaga otros errores de base de datos', async () => {
    const { service } = setup({ createError: new Error('conexión perdida') });
    await expect(service.create(input)).rejects.toThrow('conexión perdida');
  });
});

describe('UsersService: gestión (ADR 0011)', () => {
  const ADMIN_ID = 'admin-1';
  const baseUser = {
    id: 'u1',
    email: 'ana@example.test',
    fullName: 'Ana',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    passwordHash: null as string | null,
    mustChangePassword: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    roles: [{ role: 'TUTOR' as string }],
  };

  function setupManage(over: Partial<typeof baseUser> = {}, ctx: { members?: string[]; deans?: string[]; areas?: string[]; admins?: number } = {}) {
    const user = { ...baseUser, ...over };
    const prisma = {
      user: {
        findUnique: jest.fn(async () => user),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...user, ...data, roles: user.roles })),
        count: jest.fn(async () => ctx.admins ?? 1),
      },
      projectMember: { findMany: jest.fn(async () => (ctx.members ?? []).map((title) => ({ project: { title } }))) },
      facultyDean: { findMany: jest.fn(async () => (ctx.deans ?? []).map((name) => ({ faculty: { name } }))) },
      areaManager: { findMany: jest.fn(async () => (ctx.areas ?? []).map((name) => ({ area: { name } }))) },
    };
    return { service: new UsersService(prisma as unknown as PrismaService, new PasswordService()), prisma };
  }

  it('getDetail devuelve el detalle sin hash y 404 si no existe', async () => {
    const { service, prisma } = setupManage({ passwordHash: 'x' });
    await expect(service.getDetail('u1')).resolves.toEqual({
      id: 'u1',
      email: 'ana@example.test',
      fullName: 'Ana',
      status: 'ACTIVE',
      roles: ['TUTOR'],
      hasPassword: true,
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    prisma.user.findUnique.mockResolvedValueOnce(null as never);
    await expect(service.getDetail('u2')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('update', () => {
    it('bloquea con 409 quitar TUTOR si ejerce en proyectos, nombrándolos (máximo 5)', async () => {
      const titles = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
      const { service, prisma } = setupManage({}, { members: titles });
      const error = await service.update(ADMIN_ID, 'u1', { roles: ['STUDENT'] }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      const message = (error as ConflictException).message;
      expect(message).toContain('tutor activo en los proyectos «P1», «P2», «P3», «P4», «P5» y 2 más');
      expect(message).not.toContain('P6');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('bloquea quitar DEAN y AREA_MANAGER indicando facultades y áreas', async () => {
      const { service } = setupManage({ roles: [{ role: 'DEAN' }, { role: 'AREA_MANAGER' }] }, { deans: ['Facultad A'], areas: ['Área X'] });
      await expect(service.update(ADMIN_ID, 'u1', { roles: ['STUDENT'] })).rejects.toThrow(/«Facultad A».*«Área X»/);
    });

    it('solo consulta los roles que se quitan', async () => {
      const { service, prisma } = setupManage({}, { members: ['P1'] });
      await service.update(ADMIN_ID, 'u1', { roles: ['TUTOR', 'DEAN'] });
      expect(prisma.projectMember.findMany).not.toHaveBeenCalled();
    });

    it('aplica la diferencia de roles y el nombre', async () => {
      const { service, prisma } = setupManage();
      await service.update(ADMIN_ID, 'u1', { fullName: 'Ana María', roles: ['DEAN'] });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { fullName: 'Ana María', roles: { deleteMany: { role: { in: ['TUTOR'] } }, create: [{ role: 'DEAN' }] } },
        }),
      );
    });

    it('un administrador no puede quitarse ADMIN a sí mismo', async () => {
      const { service } = setupManage({ id: ADMIN_ID, roles: [{ role: 'ADMIN' }] });
      await expect(service.update(ADMIN_ID, ADMIN_ID, { roles: ['TUTOR'] })).rejects.toThrow('No puedes quitarte el rol de Administrador a ti mismo.');
    });

    it('no deja el sistema sin administradores activos', async () => {
      const { service } = setupManage({ roles: [{ role: 'ADMIN' }] }, { admins: 0 });
      await expect(service.update(ADMIN_ID, 'u1', { roles: ['TUTOR'] })).rejects.toThrow('Debe quedar al menos un administrador activo.');
    });
  });

  describe('deactivate / activate', () => {
    it('desactiva a otro usuario', async () => {
      const { service, prisma } = setupManage();
      await service.deactivate(ADMIN_ID, 'u1');
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'INACTIVE' } }));
    });

    it('rechaza auto-desactivarse, repetir y desactivar al último administrador activo', async () => {
      await expect(setupManage().service.deactivate('u1', 'u1')).rejects.toThrow('No puedes desactivarte a ti mismo.');
      await expect(setupManage({ status: 'INACTIVE' }).service.deactivate(ADMIN_ID, 'u1')).rejects.toThrow('ya está inactivo');
      await expect(
        setupManage({ roles: [{ role: 'ADMIN' }] }, { admins: 0 }).service.deactivate(ADMIN_ID, 'u1'),
      ).rejects.toThrow('al menos un administrador activo');
    });

    it('activa y rechaza activar a quien ya está activo', async () => {
      const { service, prisma } = setupManage({ status: 'INACTIVE' });
      await service.activate('u1');
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ACTIVE' } }));
      await expect(setupManage().service.activate('u1')).rejects.toThrow('ya está activo');
    });
  });

  describe('setTemporaryPassword', () => {
    it('guarda un hash Argon2 y marca el cambio obligatorio', async () => {
      const { service, prisma } = setupManage();
      await service.setTemporaryPassword('u1', 'Temporal-1234');
      const [{ data }] = prisma.user.update.mock.calls[0] as unknown as [{ data: { passwordHash: string; mustChangePassword: boolean } }];
      expect(data.passwordHash).toMatch(/^\$argon2id\$/);
      expect(data.mustChangePassword).toBe(true);
    });

    it('rechaza contraseñas que incumplen la política', async () => {
      const { service, prisma } = setupManage();
      await expect(service.setTemporaryPassword('u1', 'ana@example.test')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
