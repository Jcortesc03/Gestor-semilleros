import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { Role } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import { normalizeForSearch } from '../../../common/utils/text';
import { PasswordService, passwordPolicyErrors } from '../../auth';
import type { CreateUserDto } from '../dtos/create-user.dto';
import type { UpdateUserDto } from '../dtos/update-user.dto';
import type { UserDetailDto } from '../dtos/user-detail.dto';
import type { UserDirectoryItemDto } from '../dtos/user-directory-item.dto';
import type { UserDirectoryQuery } from '../dtos/user-directory-query.dto';
import type { UserResponseDto } from '../dtos/user-response.dto';

const MAX_LISTED_NAMES = 5;
const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  AREA_MANAGER: 'Encargado de área',
  DEAN: 'Decano',
  TUTOR: 'Tutor',
  STUDENT: 'Estudiante',
};

const detailSelect = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  passwordHash: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
  roles: { select: { role: true } },
} satisfies Prisma.UserSelect;

type DetailRecord = Prisma.UserGetPayload<{ select: typeof detailSelect }>;

function toDetail(user: DetailRecord): UserDetailDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    roles: user.roles.map((r) => r.role),
    hasPassword: user.passwordHash !== null,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/** «A», «B» y N más: máximo 5 nombres distintos para que el mensaje siga siendo legible. */
function listNames(names: string[]): string {
  const unique = [...new Set(names)];
  const shown = unique.slice(0, MAX_LISTED_NAMES).map((n) => `«${n}»`).join(', ');
  const rest = unique.length - MAX_LISTED_NAMES;
  return rest > 0 ? `${shown} y ${rest} más` : shown;
}

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
      where: {
        ...(query.status === 'ALL' ? {} : { status: query.status ?? 'ACTIVE' }),
        ...(query.role ? { roles: { some: { role: query.role } } } : {}),
      },
      select: { id: true, fullName: true, email: true, status: true, roles: { select: { role: true } } },
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
      ...(query.status === null ? {} : { status: u.status }),
    }));
  }

  /** Detalle de un usuario (administrador). 404 si no existe. */
  async getDetail(id: string): Promise<UserDetailDto> {
    return toDetail(await this.findOrFail(id));
  }

  /**
   * Edita nombre y/o roles (ADR 0011). Quitar un rol global que el usuario ejerce se bloquea con 409
   * indicando dónde; el administrador no puede quitarse `ADMIN` y siempre queda un administrador activo.
   */
  async update(actorId: string, id: string, input: UpdateUserDto): Promise<UserDetailDto> {
    const user = await this.findOrFail(id);
    const current = user.roles.map((r) => r.role);
    const removed = input.roles ? current.filter((r) => !input.roles?.includes(r)) : [];
    const added = input.roles ? input.roles.filter((r) => !current.includes(r)) : [];

    if (removed.includes('ADMIN')) {
      if (actorId === id) throw new ConflictException('No puedes quitarte el rol de Administrador a ti mismo.');
      if (user.status === 'ACTIVE') await this.assertAnotherActiveAdmin(id);
    }
    await this.assertRolesNotInUse(id, removed);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
        ...(input.roles === undefined
          ? {}
          : {
              roles: {
                deleteMany: removed.length > 0 ? { role: { in: removed } } : undefined,
                create: added.map((role) => ({ role })),
              },
            }),
      },
      select: detailSelect,
    });
    return toDetail(updated);
  }

  /** Desactiva: pierde el acceso al instante y conserva historial y participaciones. */
  async deactivate(actorId: string, id: string): Promise<UserDetailDto> {
    const user = await this.findOrFail(id);
    if (actorId === id) throw new ConflictException('No puedes desactivarte a ti mismo.');
    if (user.status === 'INACTIVE') throw new ConflictException('El usuario ya está inactivo.');
    if (user.roles.some((r) => r.role === 'ADMIN')) await this.assertAnotherActiveAdmin(id);
    return toDetail(await this.prisma.user.update({ where: { id }, data: { status: 'INACTIVE' }, select: detailSelect }));
  }

  async activate(id: string): Promise<UserDetailDto> {
    const user = await this.findOrFail(id);
    if (user.status === 'ACTIVE') throw new ConflictException('El usuario ya está activo.');
    return toDetail(await this.prisma.user.update({ where: { id }, data: { status: 'ACTIVE' }, select: detailSelect }));
  }

  /** Fija una contraseña temporal: el usuario deberá cambiarla en su próximo acceso. */
  async setTemporaryPassword(id: string, password: string): Promise<void> {
    const user = await this.findOrFail(id);
    const errors = passwordPolicyErrors(password, user.email);
    if (errors.length > 0) throw new BadRequestException({ message: 'Datos inválidos.', errors });
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await this.passwords.hash(password), mustChangePassword: true },
    });
  }

  private async findOrFail(id: string): Promise<DetailRecord> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: detailSelect });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return user;
  }

  /** Exige que, sin `excludedId`, quede al menos un administrador activo. */
  private async assertAnotherActiveAdmin(excludedId: string): Promise<void> {
    const others = await this.prisma.user.count({
      where: { id: { not: excludedId }, status: 'ACTIVE', roles: { some: { role: 'ADMIN' } } },
    });
    if (others === 0) throw new ConflictException('Debe quedar al menos un administrador activo.');
  }

  /** 409 si el usuario ejerce alguno de los roles que se le quitan, indicando dónde. */
  private async assertRolesNotInUse(userId: string, removed: Role[]): Promise<void> {
    const uses: string[] = [];
    const projects = async (roles: ('TUTOR' | 'STUDENT' | 'STUDENT_LEADER')[]) =>
      (
        await this.prisma.projectMember.findMany({
          where: { userId, status: 'ACTIVE', projectRole: { in: roles }, project: { deletedAt: null } },
          select: { project: { select: { title: true } } },
          orderBy: { project: { title: 'asc' } },
        })
      ).map((m) => m.project.title);

    if (removed.includes('TUTOR')) {
      const names = await projects(['TUTOR']);
      if (names.length > 0) uses.push(`tutor activo en los proyectos ${listNames(names)}`);
    }
    if (removed.includes('STUDENT')) {
      const names = await projects(['STUDENT', 'STUDENT_LEADER']);
      if (names.length > 0) uses.push(`estudiante activo en los proyectos ${listNames(names)}`);
    }
    if (removed.includes('DEAN')) {
      const rows = await this.prisma.facultyDean.findMany({
        where: { userId, endsAt: null },
        select: { faculty: { select: { name: true } } },
        orderBy: { faculty: { name: 'asc' } },
      });
      if (rows.length > 0) uses.push(`decano vigente de las facultades ${listNames(rows.map((r) => r.faculty.name))}`);
    }
    if (removed.includes('AREA_MANAGER')) {
      const rows = await this.prisma.areaManager.findMany({
        where: { userId },
        select: { area: { select: { name: true } } },
        orderBy: { area: { name: 'asc' } },
      });
      if (rows.length > 0) uses.push(`encargado de las áreas ${listNames(rows.map((r) => r.area.name))}`);
    }

    if (uses.length > 0) {
      throw new ConflictException(
        `No se pueden quitar los roles porque el usuario los ejerce: ${uses.join('; ')}. Retíralo primero de esos cargos.`,
      );
    }
  }
}
