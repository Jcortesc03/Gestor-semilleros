import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AcademicWorkspace } from '../../../src/features/academic';
import { ApiError } from '../../../src/lib/api';
import { admin, deferred, fakeRequest, makeActivity, makeBoard, makeMember, makeProject, student, uuid } from './fixtures';

const p1 = makeProject(10, 'Semillero de robótica');
const p2 = makeProject(11, 'Semillero de datos');
const b1 = makeBoard(40, p1.id, 'Entrega del protocolo');
const a1 = makeActivity(50, b1.id, 'Redactar la introducción');
const members = [makeMember(30, 'Tutor de Ejemplo', 'TUTOR'), makeMember(31, 'Estudiante de Ejemplo', 'STUDENT')];

const projectRoutes = (id: string, boards: unknown[], activities: Record<string, unknown[]> = {}) => ({
  [`GET /api/projects/${id}/boards`]: () => boards,
  [`GET /api/projects/${id}/members`]: () => members,
  [`GET /api/projects/${id}/documents`]: () => [],
  ...Object.fromEntries(Object.entries(activities).map(([boardId, list]) => [`GET /api/boards/${boardId}/activities`, () => list])),
});

describe('AcademicWorkspace', () => {
  it('termina la carga inicial y muestra la lista bajo StrictMode', async () => {
    const request = fakeRequest({ 'GET /api/projects': () => [p1, p2], ...projectRoutes(p1.id, [b1], { [b1.id]: [a1] }), ...projectRoutes(p2.id, []) });
    render(<StrictMode><AcademicWorkspace user={admin} request={request} /></StrictMode>);

    expect(screen.getByText('Cargando proyectos académicos…')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Semillero de datos/ })).toBeInTheDocument();
    expect(screen.queryByText('Cargando proyectos académicos…')).not.toBeInTheDocument();
    expect(await screen.findByText('Redactar la introducción')).toBeInTheDocument();
  });

  it('muestra el estado vacío cuando no hay proyectos', async () => {
    const request = fakeRequest({ 'GET /api/projects': () => [] });
    render(<AcademicWorkspace user={student} request={request} />);
    expect(await screen.findByText('No hay proyectos visibles')).toBeInTheDocument();
  });

  it('muestra el error y permite reintentar', async () => {
    let fail = true;
    const request = fakeRequest({ 'GET /api/projects': () => { if (fail) throw new ApiError(500); return []; } });
    render(<AcademicWorkspace user={student} request={request} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible');

    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No hay proyectos visibles')).toBeInTheDocument();
  });

  it('al seleccionar un proyecto muestra sus tableros, participantes y actividades', async () => {
    const b2 = makeBoard(41, p2.id, 'Tablero de datos');
    const a2 = makeActivity(51, b2.id, 'Limpiar el conjunto de datos');
    const request = fakeRequest({ 'GET /api/projects': () => [p1, p2], ...projectRoutes(p1.id, [b1], { [b1.id]: [a1] }), ...projectRoutes(p2.id, [b2], { [b2.id]: [a2] }) });
    render(<AcademicWorkspace user={admin} request={request} />);

    expect(await screen.findByText('Redactar la introducción')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Semillero de datos/ }));

    expect(await screen.findByText('Limpiar el conjunto de datos')).toBeInTheDocument();
    expect(screen.queryByText('Redactar la introducción')).not.toBeInTheDocument();
    expect(screen.getByText('Tablero de datos')).toBeInTheDocument();
    expect(screen.getByText('u30@example.test · Tutor · tutor principal')).toBeInTheDocument();
  });

  it('crea un proyecto con el cuerpo documentado y lo selecciona', async () => {
    const created = makeProject(12, 'Semillero nuevo');
    let list: unknown[] = [p1];
    const request = fakeRequest({
      'GET /api/projects': () => list,
      'GET /api/areas': () => [{ id: uuid(1), name: 'Área de prueba', description: null }],
      'GET /api/faculties': () => [{ id: uuid(2), name: 'Ingeniería' }, { id: uuid(3), name: 'Ciencias' }],
      'POST /api/projects': () => { list = [created, p1]; return created; },
      ...projectRoutes(p1.id, []),
      ...projectRoutes(created.id, []),
    });
    render(<AcademicWorkspace user={admin} request={request} />);
    await screen.findByRole('button', { name: /Semillero de robótica/ });

    await userEvent.type(screen.getByLabelText('Título del nuevo proyecto'), '  Semillero nuevo ');
    expect(screen.getByRole('button', { name: 'Crear proyecto' })).toBeDisabled();
    await screen.findByRole('option', { name: 'Área de prueba' });
    await userEvent.selectOptions(screen.getByLabelText('Área del nuevo proyecto'), uuid(1));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Ingeniería' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ciencias' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/projects', {
      method: 'POST', body: { title: 'Semillero nuevo', areaId: uuid(1), facultyIds: [uuid(2), uuid(3)] },
    }));
    const button = await screen.findByRole('button', { name: /Semillero nuevo/ });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Título del nuevo proyecto')).toHaveValue('');
  });

  it('añade un participante buscándolo en el directorio, sin escribir UUID', async () => {
    const found = { id: uuid(60), fullName: 'Ana Estudiante', email: 'ana@example.test', roles: ['STUDENT'] };
    const request = fakeRequest({
      'GET /api/projects': () => [p1],
      ...projectRoutes(p1.id, []),
      'GET /api/users?search=ana&role=STUDENT': () => [found],
      [`POST /api/projects/${p1.id}/members`]: () => makeMember(60, 'Ana Estudiante', 'STUDENT'),
    });
    render(<AcademicWorkspace user={admin} request={request} />);
    await screen.findByText('Participantes');

    expect(screen.queryByLabelText(/UUID/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir participante' })).toBeDisabled();
    await userEvent.type(screen.getByRole('combobox', { name: 'Persona a añadir' }), 'ana');
    await userEvent.click(await screen.findByRole('option', { name: /Ana Estudiante/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Añadir participante' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/projects/${p1.id}/members`, {
      method: 'POST', body: { userId: uuid(60), projectRole: 'STUDENT' },
    }));
  });

  it('filtra por rol TUTOR al añadir un tutor', async () => {
    const request = fakeRequest({
      'GET /api/projects': () => [p1],
      ...projectRoutes(p1.id, []),
      'GET /api/users?search=tu&role=TUTOR': () => [],
    });
    render(<AcademicWorkspace user={admin} request={request} />);
    await screen.findByText('Participantes');
    await userEvent.selectOptions(screen.getByLabelText('Rol en el proyecto'), 'TUTOR');
    await userEvent.type(screen.getByRole('combobox', { name: 'Persona a añadir' }), 'tu');
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/users?search=tu&role=TUTOR'));
  });

  it('un estudiante no ve formularios de gestión', async () => {
    const request = fakeRequest({ 'GET /api/projects': () => [p1], ...projectRoutes(p1.id, [b1], { [b1.id]: [a1] }) });
    render(<AcademicWorkspace user={student} request={request} />);
    await screen.findByText('Redactar la introducción');
    expect(screen.queryByRole('button', { name: 'Crear proyecto' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear tablero' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear actividad' })).not.toBeInTheDocument();
  });

  it('descarta la respuesta tardía del proyecto A al estar viendo el proyecto B', async () => {
    const b2 = makeBoard(41, p2.id, 'Tablero de datos');
    const a2 = makeActivity(51, b2.id, 'Limpiar el conjunto de datos');
    const lateBoards = deferred<unknown[]>();
    const lateMembers = deferred<unknown[]>();
    const request = fakeRequest({
      'GET /api/projects': () => [p1, p2],
      [`GET /api/projects/${p1.id}/boards`]: () => lateBoards.promise,
      [`GET /api/projects/${p1.id}/members`]: () => lateMembers.promise,
      ...projectRoutes(p2.id, [b2], { [b2.id]: [a2] }),
    });
    render(<AcademicWorkspace user={admin} request={request} />);

    await screen.findByRole('button', { name: /Semillero de datos/ });
    await userEvent.click(screen.getByRole('button', { name: /Semillero de datos/ }));
    expect(await screen.findByText('Limpiar el conjunto de datos')).toBeInTheDocument();

    lateBoards.resolve([b1]);
    lateMembers.resolve(members);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.queryByText('Entrega del protocolo')).not.toBeInTheDocument();
    expect(screen.getByText('Tablero de datos')).toBeInTheDocument();
    expect(within(screen.getByRole('heading', { name: 'Actividades de Tablero de datos' }).closest('section') as HTMLElement).getByText('Limpiar el conjunto de datos')).toBeInTheDocument();
  });
});
