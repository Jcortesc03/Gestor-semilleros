import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AcademicWorkspace } from '../../../src/features/academic';
import type { CurrentUser } from '../../../src/types/auth.ts';
import { fakeRequest, makeActivity, makeBoard, makeMember, makeProject, pageOf, uuid } from './fixtures';

/** Usuarios ficticios: no representan personas reales. */
const areaManager: CurrentUser = { id: uuid(40), email: 'encargado@example.test', fullName: 'Encargado de Ejemplo', roles: ['AREA_MANAGER'], mustChangePassword: false };
const tutor: CurrentUser = { id: uuid(30), email: 'tutor@example.test', fullName: 'Tutor de Ejemplo', roles: ['TUTOR'], mustChangePassword: false };
const admin: CurrentUser = { id: uuid(900), email: 'admin@example.test', fullName: 'Admin', roles: ['ADMIN'], mustChangePassword: false };
const dean: CurrentUser = { id: uuid(41), email: 'decano@example.test', fullName: 'Diego Decano', roles: ['DEAN'], mustChangePassword: false };

const p1 = makeProject(10, 'Semillero de robótica');
const b1 = makeBoard(40, p1.id, 'Entrega del protocolo');
const pendingActivity = makeActivity(50, b1.id, 'Redactar la introducción');
const doneActivity = { ...makeActivity(51, b1.id, 'Revisar bibliografía'), progressStatus: 'DONE' };
const members = [makeMember(30, 'Tutor de Ejemplo', 'TUTOR'), makeMember(31, 'Estudiante de Ejemplo', 'STUDENT')];
const studentMemberId = uuid(531);

function routes(activities: unknown[]) {
  return {
    'GET /api/projects': () => pageOf([p1]),
    [`GET /api/projects/${p1.id}/boards`]: () => [b1],
    [`GET /api/projects/${p1.id}/members`]: () => members,
    [`GET /api/projects/${p1.id}/documents`]: () => pageOf([]),
    [`GET /api/projects/${p1.id}/documents?pageSize=100`]: () => pageOf([], 1, 100),
    [`GET /api/boards/${b1.id}/activities`]: () => activities,
    'GET /api/areas': () => [{ id: uuid(1), name: 'Área de prueba', description: null }],
    'GET /api/areas?scope=managed': () => [{ id: uuid(1), name: 'Área de prueba', description: null }],
    'GET /api/faculties': () => [{ id: uuid(2), name: 'Ingeniería' }],
    'GET /api/faculties?scope=dean': () => [{ id: uuid(2), name: 'Ingeniería' }],
  };
}

const callsTo = (request: ReturnType<typeof fakeRequest>, path: string) =>
  request.mock.calls.filter(([called]) => called === path).length;

describe('Permisos por rol en proyectos (ADR 0010)', () => {
  it('el encargado de área ve los mismos controles de gestión que el decano', async () => {
    const request = fakeRequest(routes([pendingActivity]));
    render(<AcademicWorkspace user={areaManager} request={request} />);

    expect(await screen.findByRole('button', { name: 'Crear proyecto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar proyecto' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Añadir participante' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Retirar a Estudiante de Ejemplo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar principal' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('Rol en el proyecto')).getByRole('option', { name: 'Tutor' })).toBeInTheDocument();
    // Los tableros y las actividades siguen reservados a administrador, tutor o líder (docs/api/boards.md).
    expect(screen.queryByRole('button', { name: 'Crear tablero' })).not.toBeInTheDocument();
  });

  it('el encargado de área solo pide sus áreas y todas las facultades', async () => {
    const request = fakeRequest(routes([pendingActivity]));
    render(<AcademicWorkspace user={areaManager} request={request} />);

    await screen.findByRole('button', { name: 'Crear proyecto' });
    await waitFor(() => expect(callsTo(request, '/api/areas?scope=managed')).toBeGreaterThan(0));
    expect(request).toHaveBeenCalledWith('/api/faculties');
    expect(callsTo(request, '/api/areas')).toBe(0);
    expect(callsTo(request, '/api/faculties?scope=dean')).toBe(0);
  });

  it('el encargado de área usa el mismo alcance al editar el proyecto', async () => {
    const request = fakeRequest(routes([pendingActivity]));
    render(<AcademicWorkspace user={areaManager} request={request} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Editar proyecto' }));
    expect(await screen.findByLabelText('Área del proyecto')).toBeInTheDocument();
    await waitFor(() => expect(callsTo(request, '/api/areas?scope=managed')).toBe(2));
    expect(callsTo(request, '/api/areas')).toBe(0);
  });

  it('el decano pide solo sus facultades y todas las áreas', async () => {
    const request = fakeRequest(routes([pendingActivity]));
    render(<AcademicWorkspace user={dean} request={request} />);

    await screen.findByRole('button', { name: 'Crear proyecto' });
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/faculties?scope=dean'));
    expect(request).toHaveBeenCalledWith('/api/areas');
    expect(callsTo(request, '/api/faculties')).toBe(0);
    expect(callsTo(request, '/api/areas?scope=managed')).toBe(0);
  });

  it('el administrador pide los catálogos completos sin filtro', async () => {
    const request = fakeRequest(routes([pendingActivity]));
    render(<AcademicWorkspace user={admin} request={request} />);

    await screen.findByRole('button', { name: 'Crear proyecto' });
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/areas'));
    expect(request).toHaveBeenCalledWith('/api/faculties');
    expect(callsTo(request, '/api/areas?scope=managed')).toBe(0);
    expect(callsTo(request, '/api/faculties?scope=dean')).toBe(0);
  });

  it('el tutor no ve la gestión de tutores pero sí añade y retira estudiantes', async () => {
    const request = fakeRequest(routes([pendingActivity]));
    render(<AcademicWorkspace user={tutor} request={request} />);

    expect(await screen.findByRole('button', { name: 'Añadir participante' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear proyecto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar proyecto' })).not.toBeInTheDocument();

    const roleSelect = screen.getByLabelText('Rol en el proyecto');
    expect(within(roleSelect).queryByRole('option', { name: 'Tutor' })).not.toBeInTheDocument();
    expect(within(roleSelect).getByRole('option', { name: 'Estudiante' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Retirar a Estudiante de Ejemplo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar principal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar principal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirar a Tutor de Ejemplo' })).not.toBeInTheDocument();
  });

  it('el tutor cambia a un estudiante entre Estudiante y Líder', async () => {
    const request = fakeRequest({
      ...routes([pendingActivity]),
      [`PATCH /api/projects/${p1.id}/members/${studentMemberId}`]: () => makeMember(31, 'Estudiante de Ejemplo', 'STUDENT_LEADER'),
    });
    render(<AcademicWorkspace user={tutor} request={request} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Hacer líder' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/projects/${p1.id}/members/${studentMemberId}`, {
      method: 'PATCH', body: { projectRole: 'STUDENT_LEADER' },
    }));
  });

  it('aprobar o rechazar se deshabilita y explica que la actividad no está Hecha', async () => {
    const request = fakeRequest(routes([pendingActivity]));
    render(<AcademicWorkspace user={admin} request={request} />);

    const approval = await screen.findByRole('combobox', { name: 'Aprobación de Redactar la introducción' });
    expect(within(approval).getByRole('option', { name: 'Sin revisar' })).toBeEnabled();
    expect(within(approval).getByRole('option', { name: 'Aprobada' })).toBeDisabled();
    expect(within(approval).getByRole('option', { name: 'Rechazada' })).toBeDisabled();
    expect(screen.getByText('Solo se puede aprobar o rechazar una actividad terminada (progreso Terminada).')).toBeInTheDocument();
  });

  it('el tutor aprueba una actividad con progreso Hecha', async () => {
    const approved = { ...doneActivity, approvalStatus: 'APPROVED' };
    const request = fakeRequest({
      ...routes([doneActivity]),
      [`POST /api/activities/${doneActivity.id}/approval`]: () => approved,
    });
    render(<AcademicWorkspace user={tutor} request={request} />);

    const approval = await screen.findByRole('combobox', { name: 'Aprobación de Revisar bibliografía' });
    expect(within(approval).getByRole('option', { name: 'Aprobada' })).toBeEnabled();
    expect(within(approval).getByRole('option', { name: 'Rechazada' })).toBeEnabled();
    expect(screen.queryByText(/Solo se puede aprobar o rechazar/)).not.toBeInTheDocument();

    await userEvent.selectOptions(approval, 'APPROVED');
    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/activities/${doneActivity.id}/approval`, {
      method: 'POST', body: { status: 'APPROVED' },
    }));
  });
});
