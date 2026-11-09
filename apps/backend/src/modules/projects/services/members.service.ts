import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { Role } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import { can, type ProjectAccess } from '../models/project-access';
import type { AddMemberDto, UpdateMemberDto } from '../dtos/member.dto';
import type { MemberResponseDto } from '../dtos/project-response.dto';
import { ProjectAccessService } from './project-access.service';

const memberInclude = { user: { select: { id: true, fullName: true, email: true } } } as const;
type MemberRecord = Prisma.ProjectMemberGetPayload<{ include: typeof memberInclude }>;

const toResponse = (m: MemberRecord): MemberResponseDto => ({
  id: m.id,
  user: m.user,
  projectRole: m.projectRole,
  isPrimary: m.isPrimary,
  status: m.status,
  joinedAt: m.joinedAt.toISOString(),
  leftAt: m.leftAt?.toISOString() ?? null,
});

const MEMBER_NOT_FOUND = 'Participante no encontrado.';

/** Participantes de un proyecto (P-03, P-05, P-25). La salida es una inactivación, no un borrado. */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  async list(user: AuthUser, projectId: string, includeInactive: boolean): Promise<MemberResponseDto[]> {
    await this.access.resolve(user, projectId);
    const members = await this.prisma.projectMember.findMany({
      where: { projectId, ...(includeInactive ? {} : { status: 'ACTIVE' }) },
      include: memberInclude,
      orderBy: [{ status: 'asc' }, { projectRole: 'asc' }, { joinedAt: 'asc' }],
    });
    return members.map(toResponse);
  }

  async add(user: AuthUser, projectId: string, dto: AddMemberDto): Promise<MemberResponseDto> {
    const access = await this.access.resolve(user, projectId);
    this.assertCanManageRole(access, dto.projectRole, dto.isPrimary);

    const requiredRole: Role = dto.projectRole === 'TUTOR' ? 'TUTOR' : 'STUDENT';
    const candidate = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { status: true, roles: { select: { role: true } } },
    });
    if (!candidate || candidate.status !== 'ACTIVE') {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: ['El usuario no existe o está inactivo.'] });
    }
    if (!candidate.roles.some((r) => r.role === requiredRole)) {
      throw new BadRequestException({
        message: 'Datos inválidos.',
        errors: [`El usuario debe tener el rol global ${requiredRole} para participar como ${dto.projectRole}.`],
      });
    }

    const active = await this.prisma.projectMember.findFirst({ where: { projectId, userId: dto.userId, status: 'ACTIVE' } });
    if (active) throw new ConflictException('El usuario ya participa en este proyecto.');
    if (requiredRole === 'STUDENT') {
      const elsewhere = await this.prisma.projectMember.count({
        where: { userId: dto.userId, status: 'ACTIVE', projectRole: { in: ['STUDENT', 'STUDENT_LEADER'] } },
      });
      if (elsewhere > 0) throw new ConflictException('El estudiante ya participa en otro proyecto activo.');
    }
    await this.assertUniqueSlots(projectId, dto.projectRole, dto.isPrimary);

    const member = await this.withConstraintErrors(() =>
      this.prisma.projectMember.create({
        data: { projectId, userId: dto.userId, projectRole: dto.projectRole, isPrimary: dto.isPrimary },
        include: memberInclude,
      }),
    );
    return toResponse(member);
  }

  async update(user: AuthUser, projectId: string, memberId: string, dto: UpdateMemberDto): Promise<MemberResponseDto> {
    const access = await this.access.resolve(user, projectId);
    const member = await this.findActive(projectId, memberId);

    if (dto.projectRole !== undefined) {
      if (member.projectRole === 'TUTOR') {
        // Los tutores no pueden tocar a otros tutores (ADR 0010, sec. 6): 403 antes que 400.
        this.access.assert(can.manageTutors(access));
        throw new BadRequestException({ message: 'Datos inválidos.', errors: ['El rol de un tutor no puede cambiarse.'] });
      }
      this.access.assert(can.manageStudents(access));
    }
    if (dto.isPrimary !== undefined) {
      if (member.projectRole !== 'TUTOR') {
        throw new BadRequestException({ message: 'Datos inválidos.', errors: ['Solo un tutor puede ser principal.'] });
      }
      this.access.assert(can.manageTutors(access));
    }
    if (dto.projectRole === 'STUDENT_LEADER' && member.projectRole !== 'STUDENT_LEADER') {
      await this.assertUniqueSlots(projectId, 'STUDENT_LEADER', false);
    }
    if (dto.isPrimary === true && !member.isPrimary) await this.assertUniqueSlots(projectId, 'TUTOR', true);

    const updated = await this.withConstraintErrors(() =>
      this.prisma.projectMember.update({ where: { id: memberId }, data: dto, include: memberInclude }),
    );
    return toResponse(updated);
  }

  /** Retira al participante: queda INACTIVE con fecha de salida (historial, P-25). */
  async remove(user: AuthUser, projectId: string, memberId: string): Promise<void> {
    const access = await this.access.resolve(user, projectId);
    const member = await this.findActive(projectId, memberId);
    this.access.assert(member.projectRole === 'TUTOR' ? can.manageTutors(access) : can.manageStudents(access));
    await this.prisma.projectMember.update({
      where: { id: memberId },
      data: { status: 'INACTIVE', leftAt: new Date(), isPrimary: false },
    });
  }

  private assertCanManageRole(access: ProjectAccess, role: AddMemberDto['projectRole'], isPrimary: boolean): void {
    this.access.assert(role === 'TUTOR' || isPrimary ? can.manageTutors(access) : can.manageStudents(access));
  }

  private async findActive(projectId: string, memberId: string) {
    const member = await this.prisma.projectMember.findFirst({ where: { id: memberId, projectId, status: 'ACTIVE' } });
    if (!member) throw new NotFoundException(MEMBER_NOT_FOUND);
    return member;
  }

  /** Un líder (P-03) y un tutor principal (P-05) activos por proyecto. */
  private async assertUniqueSlots(projectId: string, role: AddMemberDto['projectRole'], isPrimary: boolean): Promise<void> {
    if (role === 'STUDENT_LEADER') {
      const leaders = await this.prisma.projectMember.count({
        where: { projectId, status: 'ACTIVE', projectRole: 'STUDENT_LEADER' },
      });
      if (leaders > 0) throw new ConflictException('El proyecto ya tiene un estudiante líder.');
    }
    if (role === 'TUTOR' && isPrimary) {
      const primaries = await this.prisma.projectMember.count({ where: { projectId, status: 'ACTIVE', isPrimary: true } });
      if (primaries > 0) throw new ConflictException('El proyecto ya tiene un tutor principal.');
    }
  }

  /** Si dos peticiones simultáneas chocan con un índice único parcial, responde 409. */
  private async withConstraintErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('La operación entra en conflicto con otro participante del proyecto.');
      }
      throw error;
    }
  }
}
