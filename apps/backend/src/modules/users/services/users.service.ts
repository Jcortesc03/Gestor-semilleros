import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { normalizeForSearch } from '../../../common/utils/text';
import { PasswordService } from '../../auth';
import type { CreateUserDto } from '../dtos/create-user.dto';
import type { UserDirectoryItemDto } from '../dtos/user-directory-item.dto';
import type { UserDirectoryQuery } from '../dtos/user-directory-query.dto';
import type { UserResponseDto } from '../dtos/user-response.dto';

export class EmailAlreadyRegisteredError extends ConflictException {
  constructor() {
    super('Ya existe un usuario con ese correo.');
  }
}

/** Gestión de usuarios. Solo el Administrador crea usuarios (RN-10). */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async create(input: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: input.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) throw new EmailAlreadyRegisteredError();

    const passwordHash = input.password ? await this.passwords.hash(input.password) : null;

    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          passwordHash,
          roles: { create: input.roles.map((role) => ({ role })) },
        },
        include: { roles: { select: { role: true } } },
      });
      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        status: user.status,
        roles: user.roles.map((r) => r.role),
        hasPassword: user.passwordHash !== null,
        createdAt: user.createdAt.toISOString(),
      };
    } catch (error) {
      // Carrera entre dos altas simultáneas con el mismo correo.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }
  }

  /**
   * Directorio para seleccionar personas: solo usuarios activos, ordenados por nombre.
   * La búsqueda se filtra en la aplicación (sin tildes; ver `parseUserDirectoryQuery`), por lo que
   * con `search` se leen todos los usuarios activos que cumplen el rol. Se asume un directorio
   * institucional de tamaño moderado.
   */
  async listDirectory(query: UserDirectoryQuery): Promise<UserDirectoryItemDto[]> {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', ...(query.role ? { roles: { some: { role: query.role } } } : {}) },
      select: { id: true, fullName: true, email: true, roles: { select: { role: true } } },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      ...(query.search === null ? { take: query.limit } : {}),
    });

    const needle = query.search === null ? null : normalizeForSearch(query.search);
    const matches =
      needle === null
        ? users
        : users.filter(
            (u) => normalizeForSearch(u.fullName).includes(needle) || normalizeForSearch(u.email).includes(needle),
          );

    return matches.slice(0, query.limit).map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      roles: u.roles.map((r) => r.role),
    }));
  }
}
