import type { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import type { ProjectAccessService } from './project-access.service';
import { ProjectsService } from './projects.service';

const usuario: AuthUser = {
  mustChangePassword: false,
  id: 'usuario-1',
  email: 'usuario-1@example.test',
  fullName: 'Usuario de Prueba',
  roles: ['STUDENT'],
};

function setup(membresias: unknown[] = []) {
  const findMany = jest.fn(async () => membresias);
  const prisma = { projectMember: { findMany } };
  const service = new ProjectsService(prisma as unknown as PrismaService, {} as ProjectAccessService);
  return { service, findMany };
}

describe('ProjectsService.tutored', () => {
  it('consulta solo membresías activas de tutor en proyectos no eliminados, ordenadas por título', async () => {
    const { service, findMany } = setup();

    await service.tutored(usuario);

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'usuario-1', status: 'ACTIVE', projectRole: 'TUTOR', project: { deletedAt: null } },
      select: { isPrimary: true, project: { select: { id: true, title: true, status: true } } },
      orderBy: { project: { title: 'asc' } },
    });
  });

  it('mapea cada membresía a { id, title, status, isPrimaryTutor }', async () => {
    const { service } = setup([
      { isPrimary: true, project: { id: 'p-1', title: 'Alfa', status: 'ACTIVE' } },
      { isPrimary: false, project: { id: 'p-2', title: 'Beta', status: 'ACTIVE' } },
    ]);

    await expect(service.tutored(usuario)).resolves.toEqual([
      { id: 'p-1', title: 'Alfa', status: 'ACTIVE', isPrimaryTutor: true },
      { id: 'p-2', title: 'Beta', status: 'ACTIVE', isPrimaryTutor: false },
    ]);
  });

  it('devuelve una lista vacía sin tutorías', async () => {
    const { service } = setup([]);

    await expect(service.tutored(usuario)).resolves.toEqual([]);
  });
});
