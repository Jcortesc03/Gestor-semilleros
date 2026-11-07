import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InstitutionalWorkspace } from '../../../src/features/institutional';
import { admin, fakeRequest, student } from './fixtures';

const createdUser = {
  id: 'new-1',
  email: 'tutor@example.test',
  fullName: 'Tutor de Ejemplo',
  status: 'ACTIVE',
  roles: ['TUTOR'],
  hasPassword: true,
  createdAt: '2026-11-07T10:00:00.000Z',
};

describe('Alta de usuarios', () => {
  it('no ofrece el formulario a quien no es administrador', () => {
    const request = fakeRequest(async () => createdUser);
    render(<InstitutionalWorkspace user={student} request={request} section="users" />);

    expect(screen.getByText('Solo un administrador puede crear cuentas.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear cuenta' })).not.toBeInTheDocument();
  });

  it('envía el cuerpo del contrato con la contraseña opcional y limpia el campo', async () => {
    const request = fakeRequest(async () => createdUser);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    await user.type(screen.getByLabelText('Correo institucional'), 'tutor@example.test');
    await user.type(screen.getByLabelText('Nombre completo'), 'Tutor de Ejemplo');
    await user.selectOptions(screen.getByLabelText('Rol global'), 'TUTOR');
    await user.type(screen.getByLabelText('Contraseña opcional'), 'Clave-Segura-1');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(request).toHaveBeenCalledWith('/api/users', {
      method: 'POST',
      body: { email: 'tutor@example.test', fullName: 'Tutor de Ejemplo', roles: ['TUTOR'], password: 'Clave-Segura-1' },
    });
    expect(await screen.findByText('Cuenta creada para tutor@example.test.')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña opcional')).toHaveValue('');
  });

  it('omite la contraseña del cuerpo cuando el campo está vacío', async () => {
    const request = fakeRequest(async () => createdUser);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    await user.type(screen.getByLabelText('Correo institucional'), 'tutor@example.test');
    await user.type(screen.getByLabelText('Nombre completo'), 'Tutor de Ejemplo');
    await user.selectOptions(screen.getByLabelText('Rol global'), 'TUTOR');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(request).toHaveBeenCalledWith('/api/users', {
      method: 'POST',
      body: { email: 'tutor@example.test', fullName: 'Tutor de Ejemplo', roles: ['TUTOR'] },
    });
    expect(request.mock.calls[0]?.[1]?.body).not.toHaveProperty('password');
  });
});
