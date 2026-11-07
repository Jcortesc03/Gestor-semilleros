import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PasswordService } from '../../auth';
import type { CreateUserDto } from '../dtos/create-user.dto';
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
}
