import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import type { AuthUser } from '../../auth';
import type { DashboardResponseDto } from '../dtos/dashboard-response.dto';
import { buildSection, orderedDashboardRoles, startOfUtcDay, type DashboardRole, type DashboardSectionData } from '../models/dashboard-aggregation';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthUser, now: Date = new Date()): Promise<DashboardResponseDto> {
    const sections: DashboardSectionData[] = [];
    for (const role of orderedDashboardRoles(user.roles)) sections.push(await this.section(user, role, now));
    return { generatedAt: now.toISOString(), sections };
  }

  private async section(user: AuthUser, role: DashboardRole, now: Date): Promise<DashboardSectionData> {
    let areas: Array<{ id: string; name: string }> = [];
    let faculties: Array<{ id: string; name: string }> = [];
    let projectWhere: Prisma.ProjectWhereInput;

    switch (role) {
      case 'ADMIN':
        projectWhere = {};
        break;
      case 'AREA_MANAGER':
        areas = await this.prisma.area.findMany({
          where: { managers: { some: { userId: user.id } } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        projectWhere = { areaId: { in: areas.map((a) => a.id) } };
        break;
      case 'DEAN':
        faculties = await this.prisma.faculty.findMany({
          where: { deans: { some: { userId: user.id, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        projectWhere = { faculties: { some: { facultyId: { in: faculties.map((f) => f.id) } } } };
        break;
      case 'TUTOR':
        projectWhere = { members: { some: { userId: user.id, status: 'ACTIVE', projectRole: 'TUTOR' } } };
        break;
      case 'STUDENT':
        projectWhere = {
          members: { some: { userId: user.id, status: 'ACTIVE', projectRole: { in: ['STUDENT', 'STUDENT_LEADER'] } } },
        };
        break;
    }

    const where: Prisma.ProjectWhereInput = { ...projectWhere, deletedAt: null };
    const activityWhere: Prisma.ActivityWhereInput = {
      deletedAt: null,
      board: { deletedAt: null, project: where },
      ...(role === 'STUDENT' ? { assignees: { some: { userId: user.id } } } : {}),
    };

    const [projects, boards, activities] = await Promise.all([
      this.prisma.project.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          members: { where: { userId: user.id, status: 'ACTIVE' }, select: { projectRole: true }, take: 1 },
        },
      }),
      this.prisma.board.findMany({
        where: { deletedAt: null, project: where },
        select: { projectId: true, progressStatus: true, dueDate: true },
      }),
      this.prisma.activity.findMany({
        where: activityWhere,
        select: { progressStatus: true, approvalStatus: true, board: { select: { projectId: true } } },
      }),
    ]);

    return buildSection({
      role,
      areas,
      faculties,
      projects: projects.map((p) => ({ id: p.id, title: p.title, status: p.status, projectRole: p.members[0]?.projectRole ?? null })),
      boards,
      activities: activities.map((a) => ({ projectId: a.board.projectId, progressStatus: a.progressStatus, approvalStatus: a.approvalStatus })),
      today: startOfUtcDay(now),
    });
  }
}
