import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../database/prisma.service';
import type { Role } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../auth';
import { FORBIDDEN_MESSAGE, PROJECT_NOT_FOUND, ProjectAccessService } from './project-access.service';

type ProyectoSimulado = {
  id: string;
  faculties: Array<{ facultyId: string }>;
  areaId?: string;
  members: Array<{ projectRole: 'TUTOR' | 'STUDENT' | 'STUDENT_LEADER' }>;
};

const PROYECTO_ID = 'proyecto-1';

const usuario = (roles: Role[], id = 'usuario-1'): AuthUser => ({
  id,
  email: `${id}@example.test`,
  fullName: 'Usuario de Prueba',
  roles,
});

function setup({ proyecto = null as ProyectoSimulado | null, decanoCount = 0, encargadoCount = 0 } = {}) {
  const findFirst = jest.fn(async () => proyecto);
  const count = jest.fn(async () => decanoCount);
  const areaCount = jest.fn(async () => encargadoCount);
  const prisma = { project: { findFirst }, facultyDean: { count }, areaManager: { count: areaCount } };
  const service = new ProjectAccessService(prisma as unknown as PrismaService);
  return { service, findFirst, count, areaCount };
}

const proyectoDe = (overrides: Partial<ProyectoSimulado> = {}): ProyectoSimulado => ({
  id: PROYECTO_ID,
  faculties: [{ facultyId: 'facultad-1' }],
  areaId: 'area-1',
  members: [],
  ...overrides,
});

describe('ProjectAccessService.resolve', () => {
  it('responde no encontrado si el proyecto no existe o está eliminado', async () => {
    const { service, findFirst } = setup({ proyecto: null });

    await expect(service.resolve(usuario(['ADMIN']), PROYECTO_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolve(usuario(['ADMIN']), PROYECTO_ID)).rejects.toThrow(PROJECT_NOT_FOUND);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: PROYECTO_ID, deletedAt: null } }),
    );
  });

  it('oculta el proyecto a un usuario sin relación con él', async () => {
    const { service } = setup({ proyecto: proyectoDe() });

    await expect(service.resolve(usuario(['STUDENT']), PROYECTO_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolve(usuario(['STUDENT']), PROYECTO_ID)).rejects.toThrow(PROJECT_NOT_FOUND);
  });

  it('otorga acceso total al administrador sin rol de proyecto', async () => {
    const { service } = setup({ proyecto: proyectoDe() });

    await expect(service.resolve(usuario(['ADMIN']), PROYECTO_ID)).resolves.toEqual({
      projectId: PROYECTO_ID,
      userId: 'usuario-1',
      isAdmin: true,
      isDean: false,
      isAreaManager: false,
      role: null,
    });
  });

  it('marca isDean si el decano tiene una facultad vigente del proyecto', async () => {
    const { service, count } = setup({ proyecto: proyectoDe(), decanoCount: 1 });

    await expect(service.resolve(usuario(['DEAN']), PROYECTO_ID)).resolves.toEqual({
      projectId: PROYECTO_ID,
      userId: 'usuario-1',
      isAdmin: false,
      isDean: true,
      isAreaManager: false,
      role: null,
    });
    expect(count).toHaveBeenCalledWith({
      where: { userId: 'usuario-1', endsAt: null, facultyId: { in: ['facultad-1'] } },
    });
  });

  it('responde no encontrado si el decano no tiene facultad vigente del proyecto', async () => {
    const { service, count } = setup({ proyecto: proyectoDe(), decanoCount: 0 });

    await expect(service.resolve(usuario(['DEAN']), PROYECTO_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolve(usuario(['DEAN']), PROYECTO_ID)).rejects.toThrow(PROJECT_NOT_FOUND);
    expect(count).toHaveBeenCalled();
  });

  it('deja isDean en false si el rol DEAN global no tiene decanato vigente y es miembro', async () => {
    const { service } = setup({
      proyecto: proyectoDe({ members: [{ projectRole: 'TUTOR' }] }),
      decanoCount: 0,
    });

    await expect(service.resolve(usuario(['DEAN']), PROYECTO_ID)).resolves.toEqual({
      projectId: PROYECTO_ID,
      userId: 'usuario-1',
      isAdmin: false,
      isDean: false,
      isAreaManager: false,
      role: 'TUTOR',
    });
  });

  it('devuelve el rol de un miembro activo del proyecto', async () => {
    const { service } = setup({ proyecto: proyectoDe({ members: [{ projectRole: 'STUDENT_LEADER' }] }) });

    await expect(service.resolve(usuario(['STUDENT']), PROYECTO_ID)).resolves.toEqual({
      projectId: PROYECTO_ID,
      userId: 'usuario-1',
      isAdmin: false,
      isDean: false,
      isAreaManager: false,
      role: 'STUDENT_LEADER',
    });
  });

  it('no consulta facultyDean.count si el usuario no tiene el rol DEAN', async () => {
    const { service, count } = setup({ proyecto: proyectoDe({ members: [{ projectRole: 'TUTOR' }] }) });

    await service.resolve(usuario(['TUTOR']), PROYECTO_ID);

    expect(count).not.toHaveBeenCalled();
  });
});

describe('ProjectAccessService.resolve (encargado de área)', () => {
  it('marca isAreaManager si el área del proyecto está asignada al usuario', async () => {
    const { service, areaCount } = setup({ proyecto: proyectoDe(), encargadoCount: 1 });

    await expect(service.resolve(usuario(['AREA_MANAGER']), PROYECTO_ID)).resolves.toEqual({
      projectId: PROYECTO_ID,
      userId: 'usuario-1',
      isAdmin: false,
      isDean: false,
      isAreaManager: true,
      role: null,
    });
    expect(areaCount).toHaveBeenCalledWith({ where: { userId: 'usuario-1', areaId: 'area-1' } });
  });

  it('responde no encontrado si el área no es del encargado', async () => {
    const { service } = setup({ proyecto: proyectoDe(), encargadoCount: 0 });

    await expect(service.resolve(usuario(['AREA_MANAGER']), PROYECTO_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('suma permisos: decano y encargado del mismo proyecto', async () => {
    const { service } = setup({ proyecto: proyectoDe(), decanoCount: 1, encargadoCount: 1 });

    const acceso = await service.resolve(usuario(['DEAN', 'AREA_MANAGER']), PROYECTO_ID);
    expect(acceso).toMatchObject({ isDean: true, isAreaManager: true });
  });

  it('no consulta areaManager.count si el usuario no tiene el rol AREA_MANAGER', async () => {
    const { service, areaCount } = setup({ proyecto: proyectoDe({ members: [{ projectRole: 'TUTOR' }] }) });

    await service.resolve(usuario(['TUTOR']), PROYECTO_ID);

    expect(areaCount).not.toHaveBeenCalled();
  });
});

describe('ProjectAccessService.assert', () => {
  it('lanza ForbiddenException cuando la regla no se cumple', () => {
    const { service } = setup();

    expect(() => service.assert(false)).toThrow(ForbiddenException);
    expect(() => service.assert(false)).toThrow(FORBIDDEN_MESSAGE);
  });

  it('no lanza si la regla se cumple', () => {
    const { service } = setup();

    expect(() => service.assert(true)).not.toThrow();
  });
});
