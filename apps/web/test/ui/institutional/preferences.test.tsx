import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InstitutionalWorkspace } from '../../../src/features/institutional';
import { ApiError } from '../../../src/lib/api.ts';
import { admin, fakeRequest } from './fixtures';

const KINDS = ['NEWS', 'COMMUNICATION', 'CHANGE', 'NOTIFICATION', 'MEETING'] as const;

/** Matriz completa de 10 combinaciones, en el orden del contrato. */
function matrix(phone: string | null = null, whatsappNews = false) {
  return {
    phone,
    preferences: KINDS.flatMap((kind) => [
      { kind, channel: 'EMAIL' as const, enabled: true },
      { kind, channel: 'WHATSAPP' as const, enabled: kind === 'NEWS' && whatsappNews },
    ]),
  };
}

describe('Preferencias de notificación', () => {
  it('carga la matriz completa, incluidas las reuniones', async () => {
    const request = fakeRequest(async () => matrix());
    render(<InstitutionalWorkspace user={admin} request={request} section="preferences" />);

    expect(await screen.findByRole('checkbox', { name: 'Reunión por Correo' })).toBeChecked();
    expect(screen.getAllByRole('checkbox')).toHaveLength(10);
    expect(screen.getByRole('checkbox', { name: 'Noticia por WhatsApp' })).not.toBeChecked();
    expect(request).toHaveBeenCalledWith('/api/me/notification-preferences');
  });

  it('guardar envía solo el cambio realizado', async () => {
    const request = fakeRequest(async (_path, options) => (options?.method === 'PUT' ? matrix(null, true) : matrix()));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="preferences" />);

    const save = await screen.findByRole('button', { name: 'Guardar preferencias' });
    expect(save).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Noticia por WhatsApp' }));
    await user.click(save);

    expect(request).toHaveBeenCalledWith('/api/me/notification-preferences', {
      method: 'PUT',
      body: { preferences: [{ kind: 'NEWS', channel: 'WHATSAPP', enabled: true }] },
    });
    expect(await screen.findByRole('checkbox', { name: 'Noticia por WhatsApp' })).toBeChecked();
  });

  it('envía el teléfono junto con el cambio de preferencia', async () => {
    const request = fakeRequest(async (_path, options) => (options?.method === 'PUT' ? matrix('+573000000001', true) : matrix()));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="preferences" />);

    await user.type(await screen.findByLabelText('Teléfono internacional'), '+573000000001');
    await user.click(screen.getByRole('checkbox', { name: 'Noticia por WhatsApp' }));
    await user.click(screen.getByRole('button', { name: 'Guardar preferencias' }));

    expect(request).toHaveBeenCalledWith('/api/me/notification-preferences', {
      method: 'PUT',
      body: {
        phone: '+573000000001',
        preferences: [{ kind: 'NEWS', channel: 'WHATSAPP', enabled: true }],
      },
    });
  });

  it('conserva el borrador y muestra el error si el guardado falla', async () => {
    const request = fakeRequest(async (_path, options) => {
      if (options?.method === 'PUT') throw new ApiError(400);
      return matrix();
    });
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="preferences" />);

    await user.click(await screen.findByRole('checkbox', { name: 'Noticia por WhatsApp' }));
    await user.click(screen.getByRole('button', { name: 'Guardar preferencias' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa los datos del formulario');
    expect(screen.getByRole('checkbox', { name: 'Noticia por WhatsApp' })).toBeChecked();
  });

  it('muestra el error de carga en lugar de un formulario vacío', async () => {
    const request = fakeRequest(async () => { throw new ApiError(401); });
    render(<InstitutionalWorkspace user={admin} request={request} section="preferences" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión expiró. Vuelve a iniciar sesión.');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
