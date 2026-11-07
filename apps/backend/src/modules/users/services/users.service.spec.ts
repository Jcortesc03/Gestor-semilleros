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
