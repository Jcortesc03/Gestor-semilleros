import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import { ProjectAccessService, type ProjectAccess } from '../../projects';

export const BOARD_NOT_FOUND = 'Tablero no encontrado.';
export const ACTIVITY_NOT_FOUND = 'Actividad no encontrada.';

/** Resuelve tableros y actividades (no eliminados) junto con el acceso al proyecto al que pertenecen. */
@Injectable()
export class WorkAccessService {
  constructor(
    private readonly prisma: PrismaService,
    readonly projects: ProjectAccessService,
  ) {}

  async board(user: AuthUser, boardId: string): Promise<{ access: ProjectAccess; projectId: string }> {
    const board = await this.prisma.board.findFirst({ where: { id: boardId, deletedAt: null }, select: { projectId: true } });
    if (!board) throw new NotFoundException(BOARD_NOT_FOUND);
    const access = await this.projects.resolve(user, board.projectId).catch(() => {
      throw new NotFoundException(BOARD_NOT_FOUND);
    });
    return { access, projectId: board.projectId };
  }

  async activity(user: AuthUser, activityId: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, deletedAt: null, board: { deletedAt: null } },
      select: { boardId: true, board: { select: { projectId: true } }, assignees: { select: { userId: true } } },
    });
    if (!activity) throw new NotFoundException(ACTIVITY_NOT_FOUND);
    const access = await this.projects.resolve(user, activity.board.projectId).catch(() => {
      throw new NotFoundException(ACTIVITY_NOT_FOUND);
    });
    const isAssignee = activity.assignees.some((a) => a.userId === user.id);
    return { access, projectId: activity.board.projectId, boardId: activity.boardId, isAssignee };
  }

  /** El usuario debe ser participante activo del proyecto con uno de los roles indicados (RN-42, RN-43, RN-46). */
  async assertMember(projectId: string, userId: string, roles: ('TUTOR' | 'STUDENT' | 'STUDENT_LEADER')[], field: string) {
    const found = await this.prisma.projectMember.count({
      where: { projectId, userId, status: 'ACTIVE', projectRole: { in: roles } },
    });
    if (found === 0) {
      throw new BadRequestException({
        message: 'Datos inválidos.',
        errors: [`${field} debe ser un participante activo del proyecto con rol ${roles.join(' o ')}.`],
      });
    }
  }
}
