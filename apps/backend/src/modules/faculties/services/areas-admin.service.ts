import { ConflictException, ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import type { CreateAreaDto, UpdateAreaDto } from '../dtos/catalog-admin.dto';
import type { AreaDto, AreaManagerDto } from '../dtos/catalog-item.dto';

const AREA_SELECT = { id: true, name: true, description: true } as const;
const FORBIDDEN = 'No tienes permisos para realizar esta acción.';
const DUPLICATE = 'Ya existe un área con ese nombre.';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Administración de áreas y de sus encargados (ADR 0010, sección 1). */
@Injectable()
export class AreasAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAreaDto): Promise<AreaDto> {
    await this.assertNameFree(dto.name);
    try {
      return await this.prisma.area.create({ data: dto, select: AREA_SELECT });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(DUPLICATE);
      throw error;
    }
  }

  /** Administrador, o encargado de esa área. */
  async update(user: AuthUser, id: string, dto: UpdateAreaDto): Promise<AreaDto> {
    const isAdmin = user.roles.includes('ADMIN');
    if (!isAdmin && !user.roles.includes('AREA_MANAGER')) throw new ForbiddenException(FORBIDDEN);
    await this.getAreaOrThrow(id);
    if (!isAdmin) {
      const assignment = await this.prisma.areaManager.findUnique({
        where: { areaId_userId: { areaId: id, userId: user.id } },
        select: { userId: true },
      });
      if (!assignment) throw new ForbiddenException(FORBIDDEN);
    }
    if (dto.name !== undefined) await this.assertNameFree(dto.name, id);
    try {
      return await this.prisma.area.update({ where: { id }, data: dto, select: AREA_SELECT });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(DUPLICATE);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await this.getAreaOrThrow(id);
    const [projects, audiences] = await Promise.all([
      this.prisma.project.count({ where: { areaId: id } }),
      this.prisma.announcementAudience.count({ where: { areaId: id } }),
    ]);
    if (projects > 0) throw new ConflictException('No se puede eliminar el área: tiene proyectos asociados.');
    if (audiences > 0) throw new ConflictException('No se puede eliminar el área: tiene novedades dirigidas a ella.');
    try {
      await this.prisma.area.delete({ where: { id } });
    } catch (error) {
      // Un proyecto o novedad creados entre la verificación y el borrado (FK Restrict).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('No se puede eliminar el área: tiene proyectos o novedades asociados.');
      }
      throw error;
    }
  }

  async listManagers(areaId: string): Promise<AreaManagerDto[]> {
    await this.getAreaOrThrow(areaId);
    const rows = await this.prisma.areaManager.findMany({
      where: { areaId },
      select: { assignedAt: true, user: { select: { id: true, fullName: true, email: true } } },
      orderBy: [{ assignedAt: 'asc' }, { user: { fullName: 'asc' } }],
    });
    return rows.map((r) => this.toManager(r.user, r.assignedAt));
  }

  /** Idempotente: si el usuario ya es encargado, devuelve su asignación actual. */
  async assignManager(areaId: string, userId: string): Promise<AreaManagerDto> {
    await this.getAreaOrThrow(areaId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true, status: true, roles: { select: { role: true } } },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (user.status !== 'ACTIVE') throw new BadRequestException('El usuario debe estar activo.');
    if (!user.roles.some((r) => r.role === 'AREA_MANAGER')) {
      throw new BadRequestException('El usuario debe tener el rol de encargado de área.');
    }
    const assignment = await this.prisma.areaManager.upsert({
      where: { areaId_userId: { areaId, userId } },
      create: { areaId, userId },
      update: {},
      select: { assignedAt: true },
    });
    return this.toManager(user, assignment.assignedAt);
  }

  async removeManager(areaId: string, userId: string): Promise<void> {
    const result = await this.prisma.areaManager.deleteMany({ where: { areaId, userId } });
    if (result.count === 0) throw new NotFoundException('El usuario no es encargado de esta área.');
  }

  private toManager(user: { id: string; fullName: string; email: string }, assignedAt: Date): AreaManagerDto {
    return { userId: user.id, fullName: user.fullName, email: user.email, assignedAt };
  }

  private async getAreaOrThrow(id: string): Promise<void> {
    const area = await this.prisma.area.findUnique({ where: { id }, select: { id: true } });
    if (!area) throw new NotFoundException('Área no encontrada.');
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const clash = await this.prisma.area.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException(DUPLICATE);
  }
}
