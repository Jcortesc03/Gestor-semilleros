import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChangePasswordPage } from '../../src/pages/ChangePasswordPage';
import { ApiError } from '../../src/lib/api';
import type { ApiOptions, ApiRequest } from '../../src/types/api';

const EMAIL = 'ana@example.test';

function okRequest() {
  return vi.fn(async (_path: string, _options?: ApiOptions) => undefined);
}

function rejectingRequest(error: unknown) {
  return vi.fn(async (_path: string, _options?: ApiOptions): Promise<unknown> => {
    throw error;
  });
}

function fillForm(user: ReturnType<typeof userEvent.setup>, values: { current?: string; next: string; confirmation: string }) {
  return (async () => {
    if (values.current !== undefined) await user.type(screen.getByLabelText('Contraseña actual'), values.current);
    await user.type(screen.getByLabelText('Nueva contraseña'), values.next);
    await user.type(screen.getByLabelText('Confirmar nueva contraseña'), values.confirmation);
  })();
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
}

describe('ChangePasswordPage: validación de la política', () => {
  it('rechaza una contraseña de menos de 10 caracteres sin llamar al backend', async () => {
    const user = userEvent.setup();
    const request = okRequest();
    render(<ChangePasswordPage mode="voluntary" email={EMAIL} request={request as ApiRequest} onCancel={() => {}} onChanged={() => {}} />);

    await fillForm(user, { next: 'abc123', confirmation: 'abc123' });
    await submit(user);

    expect(screen.getByText('La contraseña debe tener entre 10 y 256 caracteres.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('exige al menos una letra y un número', async () => {
    const user = userEvent.setup();
    const request = okRequest();
    render(<ChangePasswordPage mode="voluntary" email={EMAIL} request={request as ApiRequest} onCancel={() => {}} onChanged={() => {}} />);

    await fillForm(user, { next: 'solo-letras-abc', confirmation: 'solo-letras-abc' });
    await submit(user);

    expect(screen.getByText('Debe incluir al menos una letra y un número.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('no admite una contraseña igual al correo, sin distinguir mayúsculas', async () => {
    const user = userEvent.setup();
    const request = okRequest();
    render(<ChangePasswordPage mode="voluntary" email="ana2026@example.test" request={request as ApiRequest} onCancel={() => {}} onChanged={() => {}} />);

    await fillForm(user, { next: 'ANA2026@EXAMPLE.TEST', confirmation: 'ANA2026@EXAMPLE.TEST' });
    await submit(user);

    expect(screen.getByText('La contraseña no puede ser igual a tu correo electrónico.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('rechaza una confirmación que no coincide', async () => {
    const user = userEvent.setup();
    const request = okRequest();
    render(<ChangePasswordPage mode="voluntary" email={EMAIL} request={request as ApiRequest} onCancel={() => {}} onChanged={() => {}} />);

    await fillForm(user, { next: 'Nueva-Clave-2026', confirmation: 'Nueva-Clave-2027' });
    await submit(user);

    expect(screen.getByText('La confirmación no coincide con la nueva contraseña.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('en modo obligatorio exige la contraseña actual', async () => {
    const user = userEvent.setup();
    const request = okRequest();
    render(<ChangePasswordPage mode="required" email={EMAIL} request={request as ApiRequest} onSignOut={() => {}} onChanged={() => {}} />);

    await fillForm(user, { next: 'Nueva-Clave-2026', confirmation: 'Nueva-Clave-2026' });
    await submit(user);

    expect(screen.getByText('Escribe tu contraseña actual.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('ChangePasswordPage: envío', () => {
  it('en modo obligatorio envía la actual y la nueva con PUT /api/me/password', async () => {
    const user = userEvent.setup();
    const request = okRequest();
    const onChanged = vi.fn();
    render(<ChangePasswordPage mode="required" email={EMAIL} request={request as ApiRequest} onSignOut={() => {}} onChanged={onChanged} />);

    await fillForm(user, { current: 'Temporal-2026', next: 'Nueva-Clave-2026', confirmation: 'Nueva-Clave-2026' });
    await submit(user);

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/api/me/password', {
      method: 'PUT',
      body: { currentPassword: 'Temporal-2026', newPassword: 'Nueva-Clave-2026' },
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('en modo voluntario omite currentPassword si se deja vacía', async () => {
    const user = userEvent.setup();
    const request = okRequest();
    render(<ChangePasswordPage mode="voluntary" email={EMAIL} request={request as ApiRequest} onCancel={() => {}} onChanged={() => {}} />);

    await fillForm(user, { next: 'Nueva-Clave-2026', confirmation: 'Nueva-Clave-2026' });
    await submit(user);

    expect(request).toHaveBeenCalledWith('/api/me/password', {
      method: 'PUT',
      body: { newPassword: 'Nueva-Clave-2026' },
    });
    const [, options] = request.mock.calls[0] ?? [];
    expect(options?.body).not.toHaveProperty('currentPassword');
  });

  it('muestra el error 403 del backend y no notifica el cambio', async () => {
    const user = userEvent.setup();
    const request = rejectingRequest(new ApiError(403, { message: 'La contraseña actual no es correcta.' }));
    const onChanged = vi.fn();
    render(<ChangePasswordPage mode="voluntary" email={EMAIL} request={request as ApiRequest} onCancel={() => {}} onChanged={onChanged} />);

    await fillForm(user, { current: 'Mala-Clave-2026', next: 'Nueva-Clave-2026', confirmation: 'Nueva-Clave-2026' });
    await submit(user);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('La contraseña actual no es correcta.');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('muestra la lista de errores de validación del backend', async () => {
    const user = userEvent.setup();
    const request = rejectingRequest(new ApiError(400, { message: 'Datos inválidos.', errors: ['La nueva contraseña no cumple la política.'] }));
    render(<ChangePasswordPage mode="voluntary" email={EMAIL} request={request as ApiRequest} onCancel={() => {}} onChanged={() => {}} />);

    await fillForm(user, { next: 'Nueva-Clave-2026', confirmation: 'Nueva-Clave-2026' });
    await submit(user);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('listitem')).toHaveTextContent('La nueva contraseña no cumple la política.');
  });
});

describe('ChangePasswordPage: modos y accesibilidad', () => {
  it('el modo obligatorio no ofrece cancelar y sí cerrar sesión', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(<ChangePasswordPage mode="required" email={EMAIL} request={okRequest() as ApiRequest} onSignOut={onSignOut} onChanged={() => {}} />);

    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('el modo voluntario ofrece cancelar y no cerrar sesión', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ChangePasswordPage mode="voluntary" email={EMAIL} request={okRequest() as ApiRequest} onCancel={onCancel} onChanged={() => {}} />);

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('mostrar/ocultar cambia el tipo del campo y su estado pulsado', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordPage mode="voluntary" email={EMAIL} request={okRequest() as ApiRequest} onCancel={() => {}} onChanged={() => {}} />);

    const input = screen.getByLabelText('Nueva contraseña');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar la nueva contraseña' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar la nueva contraseña' })).toHaveAttribute('aria-pressed', 'true');
  });
});
