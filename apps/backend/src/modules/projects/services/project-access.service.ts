import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import type { ProjectAccess } from '../models/project-access';

export const PROJECT_NOT_FOUND = 'Proyecto no encontrado.';
export const FORBIDDEN_MESSAGE = 'No tienes permisos para realizar esta acción.';

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resuelve el acceso del usuario a un proyecto no eliminado.
   * Responde 404 si el proyecto no existe o el usuario no puede verlo, para no revelar su existencia.
   */
  async resolve(user: AuthUser, projectId: string): Promise<ProjectAccess> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: {
        id: true,
        areaId: true,
        faculties: { select: { facultyId: true } },
        members: { where: { userId: user.id, status: 'ACTIVE' }, select: { projectRole: true } },
      },
    });
    if (!project) throw new NotFoundException(PROJECT_NOT_FOUND);

    const isAdmin = user.roles.includes('ADMIN');
    const isDean =
      user.roles.includes('DEAN') &&
      (await this.prisma.facultyDean.count({
        where: { userId: user.id, endsAt: null, facultyId: { in: project.faculties.map((f) => f.facultyId) } },
      })) > 0;
    const isAreaManager =
      user.roles.includes('AREA_MANAGER') &&
      (await this.prisma.areaManager.count({ where: { userId: user.id, areaId: project.areaId } })) > 0;
    const role = project.members[0]?.projectRole ?? null;

    if (!isAdmin && !isDean && !isAreaManager && !role) throw new NotFoundException(PROJECT_NOT_FOUND);
    return { projectId: project.id, userId: user.id, isAdmin, isDean, isAreaManager, role };
  }

  /** Lanza 403 si la regla no se cumple. */
  assert(allowed: boolean): void {
    if (!allowed) throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }

  /** Ids de las áreas asignadas al usuario como encargado. */
  async managedAreaIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.areaManager.findMany({ where: { userId }, select: { areaId: true } });
    return rows.map((r) => r.areaId);
  }

  /** Ids de las facultades donde el usuario es decano vigente. */
  async currentDeanFacultyIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.facultyDean.findMany({ where: { userId, endsAt: null }, select: { facultyId: true } });
    return rows.map((r) => r.facultyId);
  }
}
