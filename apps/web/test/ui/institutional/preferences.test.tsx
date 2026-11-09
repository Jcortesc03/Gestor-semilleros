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

    await user.selectOptions(await screen.findByLabelText('País del teléfono'), 'CO');
    await user.type(screen.getByLabelText('Número de teléfono'), '3000000001');
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

  it('ofrece Latinoamérica y países frecuentes con el prefijo automático y límite nacional', async () => {
    const request = fakeRequest(async () => matrix());
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="preferences" />);
    const country = await screen.findByLabelText('País del teléfono');
    for (const code of ['AR', 'BO', 'BR', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'SV', 'GT', 'HT', 'HN', 'MX', 'NI', 'PA', 'PY', 'PE', 'PR', 'UY', 'VE', 'US', 'CA', 'ES']) {
      expect(country.querySelector(`option[value="${code}"]`)).not.toBeNull();
    }
    await user.selectOptions(country, 'VE');
    expect(screen.getByText('Prefijo: +58')).toBeInTheDocument();
    const number = screen.getByLabelText('Número de teléfono');
    expect(number).toHaveAttribute('maxlength', '10');
    await user.type(number, '412123456789');
    expect(number).toHaveValue('4121234567');
    await user.click(screen.getByRole('button', { name: 'Guardar preferencias' }));
    expect(request).toHaveBeenCalledWith('/api/me/notification-preferences', { method: 'PUT', body: { phone: '+584121234567' } });
  });

  it('impide guardar números incompletos o con letras y conserva el número al cambiar de país', async () => {
    const request = fakeRequest(async () => matrix());
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="preferences" />);
    await user.selectOptions(await screen.findByLabelText('País del teléfono'), 'VE');
    const number = screen.getByLabelText('Número de teléfono');
    await user.type(number, '412abc');
    expect(screen.getByRole('button', { name: 'Guardar preferencias' })).toBeDisabled();
    await user.clear(number);
    await user.type(number, '412123456');
    expect(screen.getByRole('button', { name: 'Guardar preferencias' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('País del teléfono'), 'CR');
    expect(number).toHaveValue('412123456');
    expect(screen.getByRole('button', { name: 'Guardar preferencias' })).toBeDisabled();
  });

  it('separa un teléfono guardado y permite borrarlo sin modificar las preferencias', async () => {
    const request = fakeRequest(async (_path, options) => options?.method === 'PUT' ? matrix() : matrix('+573000000001'));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="preferences" />);
    expect(await screen.findByLabelText('País del teléfono')).toHaveValue('CO');
    const number = screen.getByLabelText('Número de teléfono');
    expect(number).toHaveValue('3000000001');
    expect(screen.getByRole('button', { name: 'Guardar preferencias' })).toBeDisabled();
    await user.clear(number);
    await user.click(screen.getByRole('button', { name: 'Guardar preferencias' }));
    expect(request).toHaveBeenCalledWith('/api/me/notification-preferences', { method: 'PUT', body: { phone: null } });
  });

  it('no reescribe teléfonos existentes de países no incluidos al cambiar una preferencia', async () => {
    const request = fakeRequest(async () => matrix('+971501234567'));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="preferences" />);
    await user.click(await screen.findByRole('checkbox', { name: 'Noticia por WhatsApp' }));
    await user.click(screen.getByRole('button', { name: 'Guardar preferencias' }));
    expect(request).toHaveBeenCalledWith('/api/me/notification-preferences', {
      method: 'PUT', body: { preferences: [{ kind: 'NEWS', channel: 'WHATSAPP', enabled: true }] },
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
