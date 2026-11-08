import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { FacultyNameDto } from '../dtos/catalog-admin.dto';
import type { FacultyDeanDto, FacultyDto } from '../dtos/catalog-item.dto';

const FACULTY_SELECT = { id: true, name: true } as const;
const DEAN_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  user: { select: { id: true, fullName: true, email: true } },
} as const;
const DUPLICATE = 'Ya existe una facultad con ese nombre.';

type DeanRow = Prisma.FacultyDeanGetPayload<{ select: typeof DEAN_SELECT }>;

function isKnownError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function toDean(row: DeanRow): FacultyDeanDto {
  return {
    id: row.id,
    userId: row.user.id,
    fullName: row.user.fullName,
    email: row.user.email,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

/** El CHECK de la base exige `ends_at > starts_at`: evita empates en el mismo milisegundo. */
function closingDate(startsAt: Date, now: Date): Date {
  return now.getTime() > startsAt.getTime() ? now : new Date(startsAt.getTime() + 1);
}

/** Administración de facultades y de sus decanos (ADR 0010, sección 1). */
@Injectable()
export class FacultiesAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: FacultyNameDto): Promise<FacultyDto> {
    await this.assertNameFree(dto.name);
    try {
      return await this.prisma.faculty.create({ data: dto, select: FACULTY_SELECT });
    } catch (error) {
      if (isKnownError(error, 'P2002')) throw new ConflictException(DUPLICATE);
      throw error;
    }
  }

  async update(id: string, dto: FacultyNameDto): Promise<FacultyDto> {
    await this.getFacultyOrThrow(id);
    await this.assertNameFree(dto.name, id);
    try {
      return await this.prisma.faculty.update({ where: { id }, data: dto, select: FACULTY_SELECT });
    } catch (error) {
      if (isKnownError(error, 'P2002')) throw new ConflictException(DUPLICATE);
      throw error;
    }
  }

  /** Elimina la facultad y su historial de decanatos si no tiene proyectos ni novedades. */
  async remove(id: string): Promise<void> {
    await this.getFacultyOrThrow(id);
    const [projects, audiences] = await Promise.all([
      this.prisma.projectFaculty.count({ where: { facultyId: id } }),
      this.prisma.announcementAudience.count({ where: { facultyId: id } }),
    ]);
    if (projects > 0) throw new ConflictException('No se puede eliminar la facultad: tiene proyectos asociados.');
    if (audiences > 0) {
      throw new ConflictException('No se puede eliminar la facultad: tiene novedades dirigidas a ella.');
    }
    try {
      await this.prisma.$transaction([
        this.prisma.facultyDean.deleteMany({ where: { facultyId: id } }),
        this.prisma.faculty.delete({ where: { id } }),
      ]);
    } catch (error) {
      if (isKnownError(error, 'P2003')) {
        throw new ConflictException('No se puede eliminar la facultad: tiene proyectos o novedades asociados.');
      }
      throw error;
    }
  }

  async listDeans(facultyId: string): Promise<FacultyDeanDto[]> {
    await this.getFacultyOrThrow(facultyId);
    const rows = await this.prisma.facultyDean.findMany({
      where: { facultyId },
      select: DEAN_SELECT,
      orderBy: { startsAt: 'desc' },
    });
    // El vigente (endsAt nulo) va primero; el resto conserva el orden más reciente primero.
    return [...rows.filter((r) => r.endsAt === null), ...rows.filter((r) => r.endsAt !== null)].map(toDean);
  }

  async assignDean(facultyId: string, userId: string): Promise<FacultyDeanDto> {
    await this.getFacultyOrThrow(facultyId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, roles: { select: { role: true } } },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (user.status !== 'ACTIVE') throw new BadRequestException('El usuario debe estar activo.');
    if (!user.roles.some((r) => r.role === 'DEAN')) throw new BadRequestException('El usuario debe tener el rol de decano.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.facultyDean.findFirst({ where: { facultyId, endsAt: null }, select: { id: true, userId: true, startsAt: true } });
        if (current?.userId === userId) {
          throw new ConflictException('El usuario ya es el decano vigente de esta facultad.');
        }
        const now = new Date();
        if (current) await tx.facultyDean.update({ where: { id: current.id }, data: { endsAt: closingDate(current.startsAt, now) } });
        const created = await tx.facultyDean.create({
          data: { facultyId, userId, startsAt: now },
          select: DEAN_SELECT,
        });
        return toDean(created);
      });
    } catch (error) {
      // Índice parcial: otra asignación concurrente ocupó el puesto vigente.
      if (isKnownError(error, 'P2002')) {
        throw new ConflictException('El usuario ya es el decano vigente de esta facultad o hubo una asignación simultánea.');
      }
      throw error;
    }
  }

  async removeDean(facultyId: string): Promise<void> {
    const current = await this.prisma.facultyDean.findFirst({
      where: { facultyId, endsAt: null },
      select: { id: true, startsAt: true },
    });
    if (!current) throw new NotFoundException('La facultad no tiene un decano vigente.');
    await this.prisma.facultyDean.update({
      where: { id: current.id },
      data: { endsAt: closingDate(current.startsAt, new Date()) },
    });
  }

  private async getFacultyOrThrow(id: string): Promise<void> {
    const faculty = await this.prisma.faculty.findUnique({ where: { id }, select: { id: true } });
    if (!faculty) throw new NotFoundException('Facultad no encontrada.');
  }

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const clash = await this.prisma.faculty.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException(DUPLICATE);
  }
}
