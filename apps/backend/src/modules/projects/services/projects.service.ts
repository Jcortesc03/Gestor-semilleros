import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import { pageArgs, toPage, type PageDto } from '../../../common/utils/pagination';
import { can } from '../models/project-access';
import type { CreateProjectDto, UpdateProjectDto } from '../dtos/project.dto';
import type { ProjectListQuery } from '../dtos/project-list-query.dto';
import { toDateOnly, type ProjectResponseDto, type TutoredProjectDto } from '../dtos/project-response.dto';
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

  /**
   * Crea un proyecto. Administrador; decano (en al menos una de sus facultades) o
   * encargado de área (con `areaId` de un área asignada). Los permisos se suman (ADR 0010).
   */
  async create(user: AuthUser, dto: CreateProjectDto): Promise<ProjectResponseDto> {
    await this.assertFacultiesExist(dto.facultyIds);
    await this.assertAreaExists(dto.areaId);
    await this.assertCanPlace(user, dto.facultyIds, dto.areaId);

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

  /**
   * Proyectos visibles: todos (admin), los de sus facultades (decano), los de sus áreas (encargado de área) y
   * aquellos donde participa. Devuelve una página (ADR 0017) y admite búsqueda por título sin distinguir mayúsculas.
   */
  async list(user: AuthUser, query: ProjectListQuery): Promise<PageDto<ProjectResponseDto>> {
    const visibility: Prisma.ProjectWhereInput[] = [{ members: { some: { userId: user.id, status: 'ACTIVE' } } }];
    if (user.roles.includes('DEAN')) {
      const facultyIds = await this.access.currentDeanFacultyIds(user.id);
      if (facultyIds.length > 0) visibility.push({ faculties: { some: { facultyId: { in: facultyIds } } } });
    }
    if (user.roles.includes('AREA_MANAGER')) {
      const areaIds = await this.access.managedAreaIds(user.id);
      if (areaIds.length > 0) visibility.push({ areaId: { in: areaIds } });
    }
    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
      ...(user.roles.includes('ADMIN') ? {} : { OR: visibility }),
      ...(query.search === null ? {} : { title: { contains: query.search, mode: 'insensitive' } }),
    };
    const [projects, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: projectInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.project.count({ where }),
    ]);
    return toPage(projects.map(toResponse), total, query);
  }

  /** Proyectos no eliminados donde el usuario es tutor activo (contrato en docs/api/projects.md). */
  async tutored(user: AuthUser): Promise<TutoredProjectDto[]> {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId: user.id, status: 'ACTIVE', projectRole: 'TUTOR', project: { deletedAt: null } },
      select: { isPrimary: true, project: { select: { id: true, title: true, status: true } } },
      orderBy: { project: { title: 'asc' } },
    });
    return memberships.map((m) => ({
      id: m.project.id,
      title: m.project.title,
      status: m.project.status,
      isPrimaryTutor: m.isPrimary,
    }));
  }

  async get(user: AuthUser, projectId: string): Promise<ProjectResponseDto> {
    await this.access.resolve(user, projectId);
    return toResponse(await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: projectInclude }));
  }

  async update(user: AuthUser, projectId: string, dto: UpdateProjectDto): Promise<ProjectResponseDto> {
    const access = await this.access.resolve(user, projectId);
    this.access.assert(can.manageProject(access));

    const current = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { faculties: { select: { facultyId: true } } },
    });
    const startsOn = dto.startsOn !== undefined ? dto.startsOn : current.startsOn;
    const endsOn = dto.endsOn !== undefined ? dto.endsOn : current.endsOn;
    if (startsOn && endsOn && endsOn < startsOn) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: ['endsOn no puede ser anterior a startsOn.'] });
    }
    if (dto.areaId) await this.assertAreaExists(dto.areaId);
    if (dto.facultyIds) await this.assertFacultiesExist(dto.facultyIds);
    if (dto.facultyIds || dto.areaId) {
      await this.assertCanPlace(
        user,
        dto.facultyIds ?? current.faculties.map((f) => f.facultyId),
        dto.areaId ?? current.areaId,
      );
    }

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

  private async assertFacultiesExist(facultyIds: string[]): Promise<void> {
    const found = await this.prisma.faculty.count({ where: { id: { in: facultyIds } } });
    if (found !== facultyIds.length) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: ['Alguna de las facultades indicadas no existe.'] });
    }
  }

  /**
   * El proyecto resultante debe quedar bajo la autoridad del usuario: administrador, decano de al menos
   * una de las facultades o encargado del área (ADR 0010, sec. 2). Si no, 403.
   */
  private async assertCanPlace(user: AuthUser, facultyIds: string[], areaId: string): Promise<void> {
    if (user.roles.includes('ADMIN')) return;
    const ownFaculties = user.roles.includes('DEAN') ? await this.access.currentDeanFacultyIds(user.id) : [];
    const ownAreas = user.roles.includes('AREA_MANAGER') ? await this.access.managedAreaIds(user.id) : [];
    this.access.assert(facultyIds.some((id) => ownFaculties.includes(id)) || ownAreas.includes(areaId));
  }
}
