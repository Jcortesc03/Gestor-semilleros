import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../database/prisma.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

type FakeUser = {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'INACTIVE';
  passwordHash: string | null;
  mustChangePassword: boolean;
  roles: { role: 'ADMIN' | 'TUTOR' | 'STUDENT' }[];
};

function setup(users: FakeUser[]) {
  const prisma = {
    user: {
      findFirst: jest.fn(async ({ where }: { where: { email: { equals: string } } }) =>
        users.find((u) => u.email.toLowerCase() === where.email.equals.toLowerCase()) ?? null,
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id) ?? null),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id)),
      update: jest.fn(async () => ({})),
    },
  };
  const passwords = new PasswordService();
  const dummySpy = jest.spyOn(passwords, 'verifyAgainstDummy');
  const service = new AuthService(prisma as unknown as PrismaService, passwords);
  return { service, prisma, passwords, dummySpy };
}

describe('AuthService', () => {
  let hash: string;
  beforeAll(async () => {
    hash = await new PasswordService().hash('Clave-123');
  });

  const user = (over: Partial<FakeUser> = {}): FakeUser => ({
    id: 'u1',
    email: 'ana@example.test',
    fullName: 'Ana Prueba',
    status: 'ACTIVE',
    passwordHash: hash,
    mustChangePassword: false,
    roles: [{ role: 'TUTOR' }],
    ...over,
  });

  describe('authenticateWithPassword', () => {
    it('devuelve el usuario con sus roles si las credenciales son correctas', async () => {
      const { service } = setup([user({ roles: [{ role: 'TUTOR' }, { role: 'ADMIN' }] })]);
      await expect(service.authenticateWithPassword({ email: 'ANA@example.test', password: 'Clave-123' })).resolves.toEqual({
        id: 'u1',
        email: 'ana@example.test',
        fullName: 'Ana Prueba',
        roles: ['TUTOR', 'ADMIN'],
        mustChangePassword: false,
      });
    });

    it('rechaza una contraseña incorrecta', async () => {
      const { service } = setup([user()]);
      await expect(service.authenticateWithPassword({ email: 'ana@example.test', password: 'otra' })).resolves.toBeNull();
    });

    it('rechaza a un usuario inactivo aunque la contraseña sea correcta', async () => {
      const { service } = setup([user({ status: 'INACTIVE' })]);
      await expect(service.authenticateWithPassword({ email: 'ana@example.test', password: 'Clave-123' })).resolves.toBeNull();
    });

    it('ejecuta una verificación ficticia si el correo no existe (no revela su existencia)', async () => {
      const { service, dummySpy } = setup([]);
      await expect(service.authenticateWithPassword({ email: 'nadie@example.test', password: 'x' })).resolves.toBeNull();
      expect(dummySpy).toHaveBeenCalledTimes(1);
    });

    it('rechaza a un usuario sin contraseña (solo Google)', async () => {
      const { service, dummySpy } = setup([user({ passwordHash: null })]);
      await expect(service.authenticateWithPassword({ email: 'ana@example.test', password: 'x' })).resolves.toBeNull();
      expect(dummySpy).toHaveBeenCalledTimes(1);
    });

    it('no consulta la base de datos si la entrada es inválida', async () => {
      const { service, prisma } = setup([user()]);
      await expect(service.authenticateWithPassword({ email: 'mal', password: '' })).resolves.toBeNull();
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('resolveGoogleUser', () => {
    it('acepta un correo verificado de un usuario activo registrado', async () => {
      const { service } = setup([user({ passwordHash: null })]);
      await expect(service.resolveGoogleUser({ email: 'Ana@Example.test', email_verified: true })).resolves.toMatchObject({
        id: 'u1',
      });
    });

    it.each([
      ['correo no verificado', { email: 'ana@example.test', email_verified: false }],
      ['sin correo', { email_verified: true }],
      ['perfil nulo', null],
      ['correo no registrado', { email: 'otro@example.test', email_verified: true }],
    ])('rechaza: %s', async (_caso, profile) => {
      const { service } = setup([user()]);
      await expect(service.resolveGoogleUser(profile)).resolves.toBeNull();
    });

    it('rechaza a un usuario inactivo', async () => {
      const { service } = setup([user({ status: 'INACTIVE' })]);
      await expect(service.resolveGoogleUser({ email: 'ana@example.test', email_verified: true })).resolves.toBeNull();
    });
  });

  describe('findActiveUser', () => {
    it('devuelve el usuario activo y null si está inactivo o no existe', async () => {
      const { service } = setup([user(), user({ id: 'u2', status: 'INACTIVE' })]);
      await expect(service.findActiveUser('u1')).resolves.toMatchObject({ id: 'u1' });
      await expect(service.findActiveUser('u2')).resolves.toBeNull();
      await expect(service.findActiveUser('u3')).resolves.toBeNull();
    });
  });

  describe('changeOwnPassword', () => {
    const errorsOf = async (promise: Promise<unknown>) => {
      const error = (await promise.catch((e: unknown) => e)) as BadRequestException;
      expect(error).toBeInstanceOf(BadRequestException);
      return (error.getResponse() as { errors: string[] }).errors;
    };

    it('guarda el nuevo hash y apaga mustChangePassword', async () => {
      const { service, prisma, passwords } = setup([user({ mustChangePassword: true })]);
      await service.changeOwnPassword('u1', { currentPassword: 'Clave-123', newPassword: 'Nueva-Clave-456' });

      const [{ data }] = prisma.user.update.mock.calls[0] as unknown as [{ data: { passwordHash: string; mustChangePassword: boolean } }];
      expect(data.mustChangePassword).toBe(false);
      await expect(passwords.verify(data.passwordHash, 'Nueva-Clave-456')).resolves.toBe(true);
    });

    it('exige la contraseña actual si ya existe una', async () => {
      const { service, prisma } = setup([user()]);
      expect(await errorsOf(service.changeOwnPassword('u1', { currentPassword: null, newPassword: 'Nueva-Clave-456' }))).toEqual([
        'currentPassword es obligatorio.',
      ]);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('responde 403 si la contraseña actual no coincide', async () => {
      const { service, prisma } = setup([user()]);
      await expect(
        service.changeOwnPassword('u1', { currentPassword: 'incorrecta', newPassword: 'Nueva-Clave-456' }),
      ).rejects.toMatchObject({ message: 'La contraseña actual no es correcta.' });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('aplica la política (incluida la igualdad con el correo)', async () => {
      const { service } = setup([user()]);
      expect(await errorsOf(service.changeOwnPassword('u1', { currentPassword: 'Clave-123', newPassword: 'corta' }))).toHaveLength(2);
      expect(
        await errorsOf(service.changeOwnPassword('u1', { currentPassword: 'Clave-123', newPassword: 'ANA@example.test' })),
      ).toEqual(expect.arrayContaining([expect.stringContaining('igual al correo')]));
    });

    it('exige que la nueva sea distinta de la actual', async () => {
      const same = await new PasswordService().hash('Misma-Clave-1');
      const { service } = setup([user({ passwordHash: same })]);
      expect(await errorsOf(service.changeOwnPassword('u1', { currentPassword: 'Misma-Clave-1', newPassword: 'Misma-Clave-1' }))).toEqual([
        'La nueva contraseña debe ser distinta de la actual.',
      ]);
    });

    it('no exige la actual a quien no tiene contraseña (solo Google)', async () => {
      const { service, prisma } = setup([user({ passwordHash: null })]);
      await service.changeOwnPassword('u1', { currentPassword: null, newPassword: 'Nueva-Clave-456' });
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });
  });
});
