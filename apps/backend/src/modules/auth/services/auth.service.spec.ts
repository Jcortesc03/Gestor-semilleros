import type { PrismaService } from '../../../database/prisma.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

type FakeUser = {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'INACTIVE';
  passwordHash: string | null;
  roles: { role: 'ADMIN' | 'TUTOR' | 'STUDENT' }[];
};

function setup(users: FakeUser[]) {
  const prisma = {
    user: {
      findFirst: jest.fn(async ({ where }: { where: { email: { equals: string } } }) =>
        users.find((u) => u.email.toLowerCase() === where.email.equals.toLowerCase()) ?? null,
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id) ?? null),
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
});
