import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { normalizeEmail, parseCredentials } from '../dtos/credentials.dto';
import type { AuthUser, GoogleProfile } from '../models/auth-user';
import { passwordPolicyErrors } from '../models/password-policy';
import type { ChangePasswordDto } from '../dtos/change-password.dto';
import { PasswordService } from './password.service';

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  passwordHash: true,
  mustChangePassword: true,
  roles: { select: { role: true } },
} as const;

type UserRecord = {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'INACTIVE';
  passwordHash: string | null;
  mustChangePassword: boolean;
  roles: { role: AuthUser['roles'][number] }[];
};

function toAuthUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles.map((r) => r.role),
    mustChangePassword: user.mustChangePassword,
  };
}

/**
 * Reglas de autenticación. Solo pueden entrar usuarios ya creados por un
 * administrador (RN-10) y activos.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  /** Proveedor de credenciales: correo + contraseña. */
  async authenticateWithPassword(input: unknown): Promise<AuthUser | null> {
    const credentials = parseCredentials(input);
    if (!credentials) return null;

    const user = await this.findByEmail(credentials.email);
    if (!user || !user.passwordHash) {
      await this.passwords.verifyAgainstDummy(credentials.password);
      return null;
    }

    const valid = await this.passwords.verify(user.passwordHash, credentials.password);
    if (!valid || user.status !== 'ACTIVE') return null;
    return toAuthUser(user);
  }

  /** Proveedor de Google: el correo debe estar verificado y registrado. */
  async resolveGoogleUser(profile: GoogleProfile | null | undefined): Promise<AuthUser | null> {
    if (!profile?.email || profile.email_verified !== true) return null;
    const user = await this.findByEmail(normalizeEmail(profile.email));
    if (!user || user.status !== 'ACTIVE') return null;
    return toAuthUser(user);
  }

  /** Recarga el usuario de una sesión; `null` si ya no existe o está inactivo. */
  async findActiveUser(id: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect }).catch(() => null);
    if (!user || user.status !== 'ACTIVE') return null;
    return toAuthUser(user);
  }

  /**
   * Cambio de contraseña propio (ADR 0011). Si el usuario ya tiene contraseña exige la actual
   * (403 si no coincide) y que la nueva sea distinta. Al terminar `mustChangePassword` queda en falso.
   */
  async changeOwnPassword(userId: string, input: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, passwordHash: true },
    });

    const errors = passwordPolicyErrors(input.newPassword, user.email);
    if (user.passwordHash && input.currentPassword === null) errors.push('currentPassword es obligatorio.');
    if (errors.length > 0) throw new BadRequestException({ message: 'Datos inválidos.', errors });

    if (user.passwordHash && input.currentPassword !== null) {
      if (!(await this.passwords.verify(user.passwordHash, input.currentPassword))) {
        throw new ForbiddenException('La contraseña actual no es correcta.');
      }
      if (input.currentPassword === input.newPassword) {
        throw new BadRequestException({
          message: 'Datos inválidos.',
          errors: ['La nueva contraseña debe ser distinta de la actual.'],
        });
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(input.newPassword), mustChangePassword: false },
    });
  }

  private findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: userSelect,
    });
  }
}
