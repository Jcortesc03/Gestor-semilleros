import type { PrismaService } from '../../../database/prisma.service';
import type { Role } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../auth';
import { DashboardService } from './dashboard.service';

const usuario = (roles: Role[]): AuthUser => ({ id: 'u1', email: 'u1@example.test', fullName: 'Usuario de Prueba', roles });
const NOW = new Date('2026-11-07T15:00:00.000Z');

function setup() {
  const prisma = {
    area: { findMany: jest.fn(async () => [{ id: 'a1', name: 'Área 1' }]) },
    faculty: { findMany: jest.fn(async () => [{ id: 'f1', name: 'Facultad 1' }]) },
    project: {
      findMany: jest.fn(async () => [
        { id: 'p1', title: 'P1', status: 'ACTIVE', members: [{ projectRole: 'TUTOR' }] },
      ]),
    },
    board: { findMany: jest.fn(async () => [{ projectId: 'p1', progressStatus: 'PENDING', dueDate: new Date('2026-11-01') }]) },
    activity: {
      findMany: jest.fn(async () => [
        { progressStatus: 'DONE', approvalStatus: 'PENDING', board: { projectId: 'p1' } },
      ]),
    },
  };
  return { prisma, service: new DashboardService(prisma as unknown as PrismaService) };
}

describe('DashboardService', () => {
  it('sin roles devuelve sections vacío sin consultar', async () => {
    const { service, prisma } = setup();
    const res = await service.get(usuario([]), NOW);
    expect(res).toEqual({ generatedAt: NOW.toISOString(), sections: [] });
    expect(prisma.project.findMany).not.toHaveBeenCalled();
  });

  it('crea una sección por rol en el orden del contrato', async () => {
    const { service } = setup();
    const res = await service.get(usuario(['TUTOR', 'DEAN']), NOW);
    expect(res.sections.map((s) => s.role)).toEqual(['DEAN', 'TUTOR']);
    expect(res.sections[0]?.scope.faculties).toEqual([{ id: 'f1', name: 'Facultad 1' }]);
    expect(res.sections[1]?.activities.pendingApproval).toBe(1);
    expect(res.sections[1]?.boards.overdue).toBe(1);
  });

  it('el decano solo considera decanatos vigentes', async () => {
    const { service, prisma } = setup();
    await service.get(usuario(['DEAN']), NOW);
    expect(prisma.faculty.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deans: { some: { userId: 'u1', OR: [{ endsAt: null }, { endsAt: { gt: NOW } }] } } },
      }),
    );
  });

  it('el estudiante solo cuenta actividades asignadas a él', async () => {
    const { service, prisma } = setup();
    const res = await service.get(usuario(['STUDENT']), NOW);
    expect(prisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ assignees: { some: { userId: 'u1' } }, deletedAt: null }) }),
    );
    expect(res.sections[0]?.activities.pendingApproval).toBe(0);
  });

  it('excluye archivados en proyectos, tableros y actividades', async () => {
    const { service, prisma } = setup();
    await service.get(usuario(['ADMIN']), NOW);
    expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null } }));
    expect(prisma.board.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, project: { deletedAt: null } } }),
    );
  });
});
