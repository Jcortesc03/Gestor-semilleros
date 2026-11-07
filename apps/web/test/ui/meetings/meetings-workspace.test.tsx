import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MeetingsWorkspace } from '../../../src/features/meetings';
import { ApiError } from '../../../src/lib/api';
import type { ApiRequest } from '../../../src/types/api';

const tutor = { id: 'u-1', email: 'tutor@example.test', fullName: 'Tutor', roles: ['TUTOR'] };
const student = { id: 'u-9', email: 'est@example.test', fullName: 'Estudiante', roles: ['STUDENT'] };
const linked = { configured: true, linked: true, email: 'tutor@example.test', linkedAt: '2026-11-06T15:00:00.000Z' };
const unlinked = { configured: true, linked: false, email: null, linkedAt: null };
const meeting = {
  id: 'm-1', reason: 'Revisión de avances', startsAt: '2026-11-20T20:00:00.000Z', endsAt: '2026-11-20T21:00:00.000Z', durationMinutes: 60,
  status: 'SCHEDULED', joinUrl: 'https://teams.example.test/1', recordingUrl: null, cancelledAt: null,
  project: { id: 'p-1', title: 'Proyecto demo' }, organizer: { id: 'u-1', fullName: 'Tutor' }, participants: [{ id: 'u-2', fullName: 'Ana' }],
};

function fake(routes: Record<string, unknown>) {
  return vi.fn<ApiRequest>(async (path, options) => {
    const key = `${options?.method ?? 'GET'} ${path}`;
    if (!(key in routes)) throw new ApiError(404);
    const value = routes[key];
    if (value instanceof Error) throw value;
    return value;
  });
}

const base = { 'GET /api/projects': [{ id: 'p-1', title: 'Proyecto demo' }] };

describe('MeetingsWorkspace', () => {
  it('muestra el botón de vincular cuando la cuenta no está vinculada', async () => {
    const request = fake({ ...base, 'GET /api/integrations/microsoft/status': unlinked, 'GET /api/meetings': [] });
    render(<StrictMode><MeetingsWorkspace user={tutor} request={request} /></StrictMode>);
    expect(await screen.findByRole('button', { name: /Vincular cuenta de Microsoft/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Crear reunión/ })).toBeDisabled();
  });

  it('lista las reuniones con su estado', async () => {
    const request = fake({ ...base, 'GET /api/integrations/microsoft/status': linked, 'GET /api/meetings': [meeting] });
    render(<MeetingsWorkspace user={student} request={request} />);
    expect(await screen.findByText('Revisión de avances')).toBeInTheDocument();
    expect(screen.getByText('Programada')).toBeInTheDocument();
    expect(screen.queryByText('Nueva reunión')).not.toBeInTheDocument();
  });

  it('muestra el estado vacío', async () => {
    const request = fake({ 'GET /api/integrations/microsoft/status': linked, 'GET /api/meetings': [] });
    render(<MeetingsWorkspace user={student} request={request} />);
    expect(await screen.findByText('No tienes reuniones')).toBeInTheDocument();
  });

  it('muestra el error de la lista', async () => {
    const request = fake({ 'GET /api/integrations/microsoft/status': linked, 'GET /api/meetings': new ApiError(500) });
    render(<MeetingsWorkspace user={student} request={request} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible');
  });

  it('crea una reunión con el cuerpo del contrato', async () => {
    const created = { ...meeting, id: 'm-2' };
    const request = fake({
      ...base,
      'GET /api/integrations/microsoft/status': linked,
      'GET /api/meetings': [],
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

  it('descarta la respuesta obsoleta del detalle al cambiar la selección', async () => {
    const second = { ...meeting, id: 'm-2', reason: 'Segunda reunión' };
    let resolveFirst: (value: unknown) => void = () => undefined;
    const request = vi.fn<ApiRequest>(async (path) => {
      if (path === '/api/integrations/microsoft/status') return linked;
      if (path === '/api/meetings') return [meeting, second];
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
});
