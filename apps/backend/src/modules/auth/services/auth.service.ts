import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { normalizeEmail, parseCredentials } from '../dtos/credentials.dto';
import type { AuthUser, GoogleProfile } from '../models/auth-user';
import { PasswordService } from './password.service';

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  passwordHash: true,
  roles: { select: { role: true } },
} as const;

type UserRecord = {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'INACTIVE';
  passwordHash: string | null;
  roles: { role: AuthUser['roles'][number] }[];
};

function toAuthUser(user: UserRecord): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles.map((r) => r.role),
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

  private findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: userSelect,
    });
  }
}
