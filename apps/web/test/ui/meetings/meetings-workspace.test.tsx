import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MeetingsWorkspace } from '../../../src/features/meetings';
import { ApiError } from '../../../src/lib/api';
import type { ApiRequest } from '../../../src/types/api';

const tutor = { id: 'u-1', email: 'tutor@example.test', fullName: 'Tutor', roles: ['TUTOR'], mustChangePassword: false };
const dean = { id: 'u-3', email: 'decano@example.test', fullName: 'Decano', roles: ['DEAN'], mustChangePassword: false };
const areaManager = { id: 'u-4', email: 'encargado@example.test', fullName: 'Encargada', roles: ['AREA_MANAGER'], mustChangePassword: false };
const student = { id: 'u-9', email: 'est@example.test', fullName: 'Estudiante', roles: ['STUDENT'], mustChangePassword: false };
const linked = { configured: true, linked: true, email: 'tutor@example.test', linkedAt: '2026-11-06T15:00:00.000Z' };
const unlinked = { configured: true, linked: false, email: null, linkedAt: null };
const meeting = {
  id: 'm-1', reason: 'Revisión de avances', startsAt: '2026-11-20T20:00:00.000Z', endsAt: '2026-11-20T21:00:00.000Z', durationMinutes: 60,
  status: 'SCHEDULED', joinUrl: 'https://teams.example.test/1', recordingUrl: null, cancelledAt: null,
  project: { id: 'p-1', title: 'Proyecto demo' }, organizer: { id: 'u-1', fullName: 'Tutor' }, participants: [{ id: 'u-2', fullName: 'Ana' }],
};

/** Página de la API (ADR 0017). */
const pageOf = (items: unknown[], pageSize = 20) => ({ items, total: items.length, page: 1, pageSize });

function fake(routes: Record<string, unknown>) {
  return vi.fn<ApiRequest>(async (path, options) => {
    const key = `${options?.method ?? 'GET'} ${path}`;
    if (!(key in routes)) throw new ApiError(404);
    const value = routes[key];
    if (value instanceof Error) throw value;
    return value;
  });
}

const base = { 'GET /api/projects?pageSize=50': pageOf([{ id: 'p-1', title: 'Proyecto demo' }]) };

describe('MeetingsWorkspace', () => {
  it('muestra el botón de vincular cuando la cuenta no está vinculada', async () => {
    const request = fake({ ...base, 'GET /api/integrations/microsoft/status': unlinked, 'GET /api/meetings?page=1&pageSize=20': pageOf([]) });
    render(<StrictMode><MeetingsWorkspace user={tutor} request={request} /></StrictMode>);
    expect(await screen.findByRole('button', { name: /Vincular cuenta de Microsoft/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Crear reunión/ })).toBeDisabled();
  });

  it('lista las reuniones con su estado', async () => {
    const request = fake({ ...base, 'GET /api/integrations/microsoft/status': linked, 'GET /api/meetings?page=1&pageSize=20': pageOf([meeting]) });
    render(<MeetingsWorkspace user={student} request={request} />);
    expect(await screen.findByText('Revisión de avances')).toBeInTheDocument();
    expect(screen.getByText('Programada')).toBeInTheDocument();
    expect(screen.queryByText('Nueva reunión')).not.toBeInTheDocument();
  });

  it('muestra el estado vacío', async () => {
    const request = fake({ 'GET /api/integrations/microsoft/status': linked, 'GET /api/meetings?page=1&pageSize=20': pageOf([]) });
    render(<MeetingsWorkspace user={student} request={request} />);
    expect(await screen.findByText('No tienes reuniones')).toBeInTheDocument();
  });

  it.each([
    ['decano', dean],
    ['encargada de área', areaManager],
  ])('el formulario «Nueva reunión» es visible para %s', async (_label, user) => {
    const request = fake({ ...base, 'GET /api/integrations/microsoft/status': linked, 'GET /api/meetings?page=1&pageSize=20': pageOf([]) });
    render(<MeetingsWorkspace user={user} request={request} />);
    expect(await screen.findByRole('heading', { name: 'Nueva reunión' })).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toBeInTheDocument();
  });

  it('un estudiante no ve el formulario «Nueva reunión»', async () => {
    const request = fake({ ...base, 'GET /api/integrations/microsoft/status': linked, 'GET /api/meetings?page=1&pageSize=20': pageOf([]) });
    render(<MeetingsWorkspace user={student} request={request} />);
    await screen.findByText('No tienes reuniones');
    expect(screen.queryByRole('heading', { name: 'Nueva reunión' })).not.toBeInTheDocument();
  });

  it('initialProjectId preselecciona el proyecto del formulario', async () => {
    const request = fake({
      ...base,
      'GET /api/integrations/microsoft/status': linked,
      'GET /api/meetings?page=1&pageSize=20': pageOf([]),
      'GET /api/projects/p-1/members': [
        { id: 'x', user: { id: 'u-1', fullName: 'Tutor', email: 'tutor@example.test' }, projectRole: 'TUTOR' },
        { id: 'y', user: { id: 'u-2', fullName: 'Ana', email: 'ana@example.test' }, projectRole: 'STUDENT' },
      ],
    });
    render(<MeetingsWorkspace user={tutor} request={request} initialProjectId="p-1" />);
    const select = await screen.findByLabelText('Proyecto');
    await waitFor(() => expect(within(select).getByText('Proyecto demo')).toBeInTheDocument());
    expect(select).toHaveValue('p-1');
    expect(await screen.findByLabelText(/Ana/)).toBeInTheDocument();
  });

  it('initialProjectId fuera de la primera página del selector muestra igualmente su título', async () => {
    const request = fake({
      'GET /api/projects?pageSize=50': { items: [{ id: 'p-1', title: 'Proyecto demo' }], total: 80, page: 1, pageSize: 50 },
      'GET /api/projects/p-77': { id: 'p-77', title: 'Proyecto lejano', status: 'ACTIVE' },
      'GET /api/integrations/microsoft/status': linked,
      'GET /api/meetings?page=1&pageSize=20': pageOf([]),
      'GET /api/projects/p-77/members': [],
    });
    render(<MeetingsWorkspace user={tutor} request={request} initialProjectId="p-77" />);
    const select = await screen.findByLabelText('Proyecto');
    await waitFor(() => expect(within(select).getByText('Proyecto lejano')).toBeInTheDocument());
    expect(select).toHaveValue('p-77');
  });

  it('muestra el error de la lista', async () => {
    const request = fake({ 'GET /api/integrations/microsoft/status': linked, 'GET /api/meetings?page=1&pageSize=20': new ApiError(500) });
    render(<MeetingsWorkspace user={student} request={request} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible');
  });

  it('crea una reunión con el cuerpo del contrato', async () => {
    const created = { ...meeting, id: 'm-2' };
    const request = fake({
      ...base,
      'GET /api/integrations/microsoft/status': linked,
      'GET /api/meetings?page=1&pageSize=20': pageOf([]),
      'GET /api/projects/p-1/members': [
        { id: 'x', user: { id: 'u-1', fullName: 'Tutor', email: 'tutor@example.test' }, projectRole: 'TUTOR' },
        { id: 'y', user: { id: 'u-2', fullName: 'Ana', email: 'ana@example.test' }, projectRole: 'STUDENT' },
      ],
      'POST /api/meetings': created,
      'GET /api/meetings/m-2': created,
    });
    render(<MeetingsWorkspace user={tutor} request={request} />);
    const user = userEvent.setup();
    await screen.findByText('No tienes reuniones');
    await user.type(screen.getByLabelText('Motivo'), '  Revisión  ');
    await user.type(screen.getByLabelText('Inicio'), '2030-11-20T15:00');
    const select = screen.getByLabelText('Proyecto');
    await waitFor(() => expect(within(select).getByText('Proyecto demo')).toBeInTheDocument());
    await user.selectOptions(select, 'p-1');
    await user.click(await screen.findByLabelText(/Ana/));
    expect(screen.queryByLabelText(/tutor@example.test/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Crear reunión/ }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/meetings', {
      method: 'POST',
      body: {
        reason: 'Revisión',
        startsAt: new Date('2030-11-20T15:00').toISOString(),
        durationMinutes: 60,
        projectId: 'p-1',
        participantIds: ['u-2'],
      },
    }));
    expect(await screen.findByText('Reunión creada.')).toBeInTheDocument();
  });

  it('crea una reunión sin proyecto eligiendo participantes con el buscador', async () => {
    const created = { ...meeting, id: 'm-3', project: null };
    const request = fake({
      ...base,
      'GET /api/integrations/microsoft/status': linked,
      'GET /api/meetings?page=1&pageSize=20': pageOf([]),
      'GET /api/users?search=an&pageSize=20': pageOf([
        { id: 'u-1', fullName: 'Tutor', email: 'tutor@example.test', roles: ['TUTOR'] },
        { id: 'u-2', fullName: 'Ana', email: 'ana@example.test', roles: ['STUDENT'] },
      ]),
      'POST /api/meetings': created,
      'GET /api/meetings/m-3': created,
    });
    render(<MeetingsWorkspace user={tutor} request={request} />);
    const user = userEvent.setup();
    await screen.findByText('No tienes reuniones');
    await user.type(screen.getByLabelText('Motivo'), 'Reunión libre');
    await user.type(screen.getByLabelText('Inicio'), '2030-11-20T15:00');
    expect(screen.getByRole('button', { name: /Crear reunión/ })).toBeDisabled();

    await user.type(screen.getByRole('combobox', { name: 'Buscar participantes' }), 'an');
    const options = await within(await screen.findByRole('listbox', { name: /Resultados/ })).findAllByRole('option');
    expect(options).toHaveLength(1);
    await user.click(options[0]);
    expect(screen.getByRole('list', { name: 'Participantes elegidos' })).toHaveTextContent('Ana');
    await user.click(screen.getByRole('button', { name: /Crear reunión/ }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/meetings', {
      method: 'POST',
      body: { reason: 'Reunión libre', startsAt: new Date('2030-11-20T15:00').toISOString(), durationMinutes: 60, projectId: null, participantIds: ['u-2'] },
    }));
  });

  it('descarta la respuesta obsoleta del detalle al cambiar la selección', async () => {
    const second = { ...meeting, id: 'm-2', reason: 'Segunda reunión' };
    let resolveFirst: (value: unknown) => void = () => undefined;
    const request = vi.fn<ApiRequest>(async (path) => {
      if (path === '/api/integrations/microsoft/status') return linked;
      if (path === '/api/meetings?page=1&pageSize=20') return pageOf([meeting, second]);
      if (path === '/api/meetings/m-1') return new Promise((resolve) => { resolveFirst = resolve; });
      if (path === '/api/meetings/m-2') return second;
      throw new ApiError(404);
    });
    render(<MeetingsWorkspace user={student} request={request} />);
    const user = userEvent.setup();
    const buttons = await screen.findAllByRole('button', { name: 'Ver detalle' });
    await user.click(buttons[0]);
    await user.click(buttons[1]);
    expect(await screen.findByRole('heading', { name: 'Segunda reunión' })).toBeInTheDocument();
    resolveFirst(meeting);
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByRole('heading', { name: 'Revisión de avances' })).not.toBeInTheDocument();
  });

  it('pagina el listado de reuniones con «Siguiente» y «Anterior»', async () => {
    const second = { ...meeting, id: 'm-2', reason: 'Reunión de la página 2' };
    const request = fake({
      'GET /api/integrations/microsoft/status': linked,
      'GET /api/meetings?page=1&pageSize=20': { items: [meeting], total: 21, page: 1, pageSize: 20 },
      'GET /api/meetings?page=2&pageSize=20': { items: [second], total: 21, page: 2, pageSize: 20 },
    });
    render(<MeetingsWorkspace user={student} request={request} />);
    const user = userEvent.setup();
    expect(await screen.findByText('Revisión de avances')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Paginación de Reuniones' });
    expect(nav).toHaveTextContent('1–20 de 21 · página 1 de 2');
    await user.click(within(nav).getByRole('button', { name: 'Página siguiente' }));
    expect(await screen.findByText('Reunión de la página 2')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Paginación de Reuniones' })).toHaveTextContent('21–21 de 21 · página 2 de 2');
    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(await screen.findByText('Revisión de avances')).toBeInTheDocument();
  });

  it('el selector de proyectos busca por título sin cargar la lista completa', async () => {
    const request = fake({
      'GET /api/integrations/microsoft/status': linked,
      'GET /api/meetings?page=1&pageSize=20': pageOf([]),
      'GET /api/projects?pageSize=50': { items: [{ id: 'p-1', title: 'Proyecto demo' }], total: 120, page: 1, pageSize: 50 },
      'GET /api/projects?search=rob&pageSize=50': pageOf([{ id: 'p-9', title: 'Robótica' }], 50),
    });
    render(<MeetingsWorkspace user={tutor} request={request} />);
    const user = userEvent.setup();
    expect(await screen.findByText(/Se muestran 1 de 120 proyectos/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar proyecto'), 'rob');
    expect(await screen.findByRole('option', { name: 'Robótica' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/projects?search=rob&pageSize=50');
    expect(screen.queryByRole('option', { name: 'Proyecto demo' })).not.toBeInTheDocument();
  });
});
