import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MeetingsWorkspace } from '../../../src/features/meetings';
import { ApiError } from '../../../src/lib/api';
import type { ApiRequest } from '../../../src/types/api';

const tutor = { id: 'u-1', email: 'tutor@example.test', fullName: 'Tutor', roles: ['TUTOR'], mustChangePassword: false };
const personal = { configured: true, linked: true, email: 'tutor@outlook.example.test', linkedAt: '2026-11-06T15:00:00.000Z', accountType: 'PERSONAL' };
const work = { configured: true, linked: true, email: 'tutor@example.test', linkedAt: '2026-11-06T15:00:00.000Z', accountType: 'WORK_OR_SCHOOL' };
const PERSONAL_NOTE = 'Microsoft no genera enlaces de Teams para cuentas personales: al crear una reunión deberás indicar el enlace (Teams gratis, Meet, Zoom…).';

const created = {
  id: 'm-2', reason: 'Revisión', startsAt: '2026-11-20T20:00:00.000Z', endsAt: '2026-11-20T21:00:00.000Z', durationMinutes: 60,
  status: 'SCHEDULED', joinUrl: 'https://meet.example.test/abc', recordingUrl: null, cancelledAt: null,
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

/** Llamadas `POST /api/meetings` registradas en el mock. */
function postCalls(request: ReturnType<typeof fake>) {
  return request.mock.calls.filter(([path, options]) => path === '/api/meetings' && options?.method === 'POST');
}

function routesFor(status: unknown): Record<string, unknown> {
  return {
    'GET /api/projects': [{ id: 'p-1', title: 'Proyecto demo' }],
    'GET /api/integrations/microsoft/status': status,
    'GET /api/meetings': [],
    'GET /api/projects/p-1/members': [
      { id: 'y', user: { id: 'u-2', fullName: 'Ana', email: 'ana@example.test' }, projectRole: 'STUDENT' },
    ],
    'POST /api/meetings': created,
    'GET /api/meetings/m-2': created,
  };
}

async function fillForm(joinUrl?: string) {
  const user = userEvent.setup();
  await screen.findByText('No tienes reuniones');
  await user.type(screen.getByLabelText('Motivo'), 'Revisión');
  await user.type(screen.getByLabelText('Inicio'), '2030-11-20T15:00');
  const select = screen.getByLabelText('Proyecto');
  await waitFor(() => expect(within(select).getByText('Proyecto demo')).toBeInTheDocument());
  await user.selectOptions(select, 'p-1');
  await user.click(await screen.findByLabelText(/Ana/));
  if (joinUrl !== undefined) await user.type(screen.getByLabelText('Enlace de la reunión'), joinUrl);
  return user;
}

describe('MeetingsWorkspace con tipo de cuenta', () => {
  it('con cuenta personal muestra el tipo, la nota y el campo de enlace, y envía joinUrl', async () => {
    const request = fake(routesFor(personal));
    render(<MeetingsWorkspace user={tutor} request={request} />);

    expect(await screen.findByText('Cuenta personal')).toBeInTheDocument();
    expect(screen.getByText(PERSONAL_NOTE)).toBeInTheDocument();
    const user = await fillForm('https://meet.example.test/abc');
    expect(screen.getByLabelText('Enlace de la reunión')).toHaveAttribute('type', 'url');
    expect(screen.getByLabelText('Enlace de la reunión')).toBeRequired();
    await user.click(screen.getByRole('button', { name: /Crear reunión/ }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/meetings', {
      method: 'POST',
      body: {
        reason: 'Revisión',
        startsAt: new Date('2030-11-20T15:00').toISOString(),
        durationMinutes: 60,
        projectId: 'p-1',
        participantIds: ['u-2'],
        joinUrl: 'https://meet.example.test/abc',
      },
    }));
    expect(await screen.findByText('Reunión creada.')).toBeInTheDocument();
  });

  it('con cuenta personal no permite crear sin enlace', async () => {
    const request = fake(routesFor(personal));
    render(<MeetingsWorkspace user={tutor} request={request} />);
    await fillForm();
    expect(screen.getByRole('button', { name: /Crear reunión/ })).toBeDisabled();
    expect(postCalls(request)).toHaveLength(0);
  });

  it('valida en cliente que el enlace sea https y no envía la reunión si no lo es', async () => {
    const request = fake(routesFor(personal));
    render(<MeetingsWorkspace user={tutor} request={request} />);
    const user = await fillForm('http://meet.example.test/abc');
    await user.click(screen.getByRole('button', { name: /Crear reunión/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace de la reunión debe empezar por https://');
    expect(postCalls(request)).toHaveLength(0);
  });

  it('valida en cliente que el enlace no supere 2048 caracteres', async () => {
    const request = fake(routesFor(personal));
    render(<MeetingsWorkspace user={tutor} request={request} />);
    const user = await fillForm();
    // fireEvent evita teclear miles de caracteres y salta el maxLength del navegador para probar la validación JS.
    fireEvent.change(screen.getByLabelText('Enlace de la reunión'), { target: { value: `https://meet.example.test/${'a'.repeat(2030)}` } });
    await user.click(screen.getByRole('button', { name: /Crear reunión/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('no puede tener más de 2048 caracteres');
    expect(postCalls(request)).toHaveLength(0);
  });

  it('con cuenta laboral muestra el tipo, no muestra el campo ni la nota y no envía joinUrl', async () => {
    const request = fake(routesFor(work));
    render(<MeetingsWorkspace user={tutor} request={request} />);

    expect(await screen.findByText('Cuenta laboral o educativa')).toBeInTheDocument();
    expect(screen.queryByText(PERSONAL_NOTE)).not.toBeInTheDocument();
    const user = await fillForm();
    expect(screen.queryByLabelText('Enlace de la reunión')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Crear reunión/ }));

    expect(await screen.findByText('Reunión creada.')).toBeInTheDocument();
    const [post] = postCalls(request);
    expect(post?.[1]?.body).toEqual({
      reason: 'Revisión',
      startsAt: new Date('2030-11-20T15:00').toISOString(),
      durationMinutes: 60,
      projectId: 'p-1',
      participantIds: ['u-2'],
    });
    expect(post?.[1]?.body).not.toHaveProperty('joinUrl');
  });

  it('muestra el error del backend con ErrorNotice al crear', async () => {
    const routes = routesFor(work);
    routes['POST /api/meetings'] = new ApiError(422, { message: 'Microsoft no generó el enlace de Teams; la cuenta vinculada debe ser laboral o educativa con Teams.' });
    const request = fake(routes);
    render(<MeetingsWorkspace user={tutor} request={request} />);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: /Crear reunión/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('la cuenta vinculada debe ser laboral o educativa con Teams');
  });
});
