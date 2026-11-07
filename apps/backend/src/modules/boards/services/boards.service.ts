import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import { can } from '../../projects';
import type { CreateBoardDto, UpdateBoardDto } from '../dtos/board.dto';
import type { BoardResponseDto } from '../dtos/board-response.dto';
import { WorkAccessService } from './work-access.service';

const userRef = { select: { id: true, fullName: true } } as const;
const boardInclude = {
  responsibleTutor: userRef,
  responsibleStudent: userRef,
  _count: { select: { activities: { where: { deletedAt: null } } } },
} as const;
type BoardRecord = Prisma.BoardGetPayload<{ include: typeof boardInclude }>;

const toResponse = (b: BoardRecord): BoardResponseDto => ({
  id: b.id,
  projectId: b.projectId,
  title: b.title,
  dueDate: b.dueDate.toISOString().slice(0, 10),
  progressStatus: b.progressStatus,
  result: b.result,
  responsibleTutor: b.responsibleTutor,
  responsibleStudent: b.responsibleStudent,
  activityCount: b._count.activities,
  createdAt: b.createdAt.toISOString(),
});

/** Tableros de un proyecto. Los gestionan los tutores del proyecto (P-09) y el administrador. */
@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly work: WorkAccessService,
  ) {}

  async create(user: AuthUser, projectId: string, dto: CreateBoardDto): Promise<BoardResponseDto> {
    const access = await this.work.projects.resolve(user, projectId);
    this.work.projects.assert(can.manageBoards(access));
    await this.assertResponsibles(projectId, dto.responsibleTutorId, dto.responsibleStudentId);

    const board = await this.prisma.board.create({ data: { ...dto, projectId }, include: boardInclude });
    return toResponse(board);
  }

  async list(user: AuthUser, projectId: string): Promise<BoardResponseDto[]> {
    await this.work.projects.resolve(user, projectId);
    const boards = await this.prisma.board.findMany({
      where: { projectId, deletedAt: null },
      include: boardInclude,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    return boards.map(toResponse);
  }

  async get(user: AuthUser, boardId: string): Promise<BoardResponseDto> {
    await this.work.board(user, boardId);
    return toResponse(await this.prisma.board.findUniqueOrThrow({ where: { id: boardId }, include: boardInclude }));
  }

  async update(user: AuthUser, boardId: string, dto: UpdateBoardDto): Promise<BoardResponseDto> {
    const { access, projectId } = await this.work.board(user, boardId);
    this.work.projects.assert(can.manageBoards(access));
    await this.assertResponsibles(projectId, dto.responsibleTutorId, dto.responsibleStudentId);

    const board = await this.prisma.board.update({ where: { id: boardId }, data: dto, include: boardInclude });
    return toResponse(board);
  }

  /** Eliminación lógica (P-20); sus actividades dejan de ser accesibles. */
  async remove(user: AuthUser, boardId: string): Promise<void> {
    const { access } = await this.work.board(user, boardId);
    this.work.projects.assert(can.manageBoards(access));
    await this.prisma.board.update({ where: { id: boardId }, data: { deletedAt: new Date() } });
  }

  private async assertResponsibles(projectId: string, tutorId?: string, studentId?: string): Promise<void> {
    if (tutorId) await this.work.assertMember(projectId, tutorId, ['TUTOR'], 'responsibleTutorId');
    if (studentId) {
      await this.work.assertMember(projectId, studentId, ['STUDENT', 'STUDENT_LEADER'], 'responsibleStudentId');
    }
  }
}
