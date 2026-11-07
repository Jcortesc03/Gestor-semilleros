import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import { can } from '../models/project-access';
import type { CreateProjectDto, UpdateProjectDto } from '../dtos/project.dto';
import { toDateOnly, type ProjectResponseDto } from '../dtos/project-response.dto';
import { ProjectAccessService } from './project-access.service';

const projectInclude = {
  area: { select: { id: true, name: true } },
  faculties: { select: { faculty: { select: { id: true, name: true } } } },
} as const;

type ProjectRecord = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

function toResponse(p: ProjectRecord): ProjectResponseDto {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status,
    area: p.area,
    faculties: p.faculties.map((f) => f.faculty).sort((a, b) => a.name.localeCompare(b.name)),
    startsOn: toDateOnly(p.startsOn),
    endsOn: toDateOnly(p.endsOn),
    createdAt: p.createdAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  /** Crea un proyecto. Decano (en al menos una de sus facultades) o Administrador. */
  async create(user: AuthUser, dto: CreateProjectDto): Promise<ProjectResponseDto> {
    await this.assertCanUseFaculties(user, dto.facultyIds);
    await this.assertAreaExists(dto.areaId);

    const project = await this.prisma.project.create({
      data: {
        title: dto.title,
        description: dto.description,
        areaId: dto.areaId,
        startsOn: dto.startsOn,
        endsOn: dto.endsOn,
        createdById: user.id,
        faculties: { create: dto.facultyIds.map((facultyId) => ({ facultyId })) },
      },
      include: projectInclude,
    });
    return toResponse(project);
  }

  /** Proyectos visibles: todos (admin), los de sus facultades (decano) y aquellos donde participa. */
  async list(user: AuthUser): Promise<ProjectResponseDto[]> {
    const visibility: Prisma.ProjectWhereInput[] = [{ members: { some: { userId: user.id, status: 'ACTIVE' } } }];
    if (user.roles.includes('DEAN')) {
      const facultyIds = await this.access.currentDeanFacultyIds(user.id);
      if (facultyIds.length > 0) visibility.push({ faculties: { some: { facultyId: { in: facultyIds } } } });
    }
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null, ...(user.roles.includes('ADMIN') ? {} : { OR: visibility }) },
      include: projectInclude,
      orderBy: { createdAt: 'desc' },
    });
    return projects.map(toResponse);
  }

  async get(user: AuthUser, projectId: string): Promise<ProjectResponseDto> {
    await this.access.resolve(user, projectId);
    return toResponse(await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: projectInclude }));
  }

  async update(user: AuthUser, projectId: string, dto: UpdateProjectDto): Promise<ProjectResponseDto> {
    const access = await this.access.resolve(user, projectId);
    this.access.assert(can.manageProject(access));

    const current = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const startsOn = dto.startsOn !== undefined ? dto.startsOn : current.startsOn;
    const endsOn = dto.endsOn !== undefined ? dto.endsOn : current.endsOn;
    if (startsOn && endsOn && endsOn < startsOn) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: ['endsOn no puede ser anterior a startsOn.'] });
    }
    if (dto.areaId) await this.assertAreaExists(dto.areaId);
    if (dto.facultyIds) await this.assertCanUseFaculties(user, dto.facultyIds);

    const { facultyIds, ...fields } = dto;
    const project = await this.prisma.$transaction(async (tx) => {
      if (facultyIds) {
        await tx.projectFaculty.deleteMany({ where: { projectId } });
        await tx.projectFaculty.createMany({ data: facultyIds.map((facultyId) => ({ projectId, facultyId })) });
      }
      return tx.project.update({ where: { id: projectId }, data: fields, include: projectInclude });
    });
    return toResponse(project);
  }

  /** Eliminación lógica (P-20): el proyecto y sus tableros dejan de ser accesibles. */
  async remove(user: AuthUser, projectId: string): Promise<void> {
    const access = await this.access.resolve(user, projectId);
    this.access.assert(can.manageProject(access));
    await this.prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } });
  }

  private async assertAreaExists(areaId: string): Promise<void> {
    if ((await this.prisma.area.count({ where: { id: areaId } })) === 0) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: ['El área indicada no existe.'] });
    }
  }

  /** Las facultades deben existir y un decano debe dirigir al menos una de ellas. */
  private async assertCanUseFaculties(user: AuthUser, facultyIds: string[]): Promise<void> {
    const found = await this.prisma.faculty.count({ where: { id: { in: facultyIds } } });
    if (found !== facultyIds.length) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: ['Alguna de las facultades indicadas no existe.'] });
    }
    if (user.roles.includes('ADMIN')) return;
    const own = user.roles.includes('DEAN') ? await this.access.currentDeanFacultyIds(user.id) : [];
    this.access.assert(facultyIds.some((id) => own.includes(id)));
  }
}
