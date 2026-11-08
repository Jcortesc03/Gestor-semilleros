import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PasswordRecoveryPage } from '../../src/pages/PasswordRecoveryPage';
import { ApiError } from '../../src/lib/api';
import type { ApiRequest } from '../../src/types/api';

describe('Recuperación de contraseña', () => {
  it('solicita el código al correo ingresado, verifica y recién entonces permite elegir contraseña', async () => {
    const request = vi.fn<ApiRequest>().mockResolvedValueOnce({ message: 'Respuesta genérica' })
      .mockResolvedValueOnce({ resetToken: 'a'.repeat(64) }).mockResolvedValueOnce(undefined);
    const onBack = vi.fn();
    render(<PasswordRecoveryPage request={request} onBack={onBack} />);
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ANA@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    expect(request).toHaveBeenLastCalledWith('/api/password-recovery/request', { method: 'POST', body: { email: 'ana@example.test' } });
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();
    const code = await screen.findByLabelText('Código de verificación');
    expect(code).toHaveAttribute('maxlength', '6');
    await userEvent.type(code, '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar código' }));
    expect(request).toHaveBeenLastCalledWith('/api/password-recovery/verify', { method: 'POST', body: { email: 'ana@example.test', code: '123456' } });
    await userEvent.type(await screen.findByLabelText('Nueva contraseña'), 'New-password-123');
    await userEvent.type(screen.getByLabelText('Confirmar nueva contraseña'), 'Wrong-password-123');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nueva contraseña' }));
    expect(screen.getByRole('alert')).toHaveTextContent('La confirmación no coincide');
    expect(request).toHaveBeenCalledTimes(2);
    await userEvent.clear(screen.getByLabelText('Confirmar nueva contraseña'));
    await userEvent.type(screen.getByLabelText('Confirmar nueva contraseña'), 'New-password-123');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar nueva contraseña' }));
    expect(request).toHaveBeenLastCalledWith('/api/password-recovery/reset', {
      method: 'POST', body: { resetToken: 'a'.repeat(64), newPassword: 'New-password-123', confirmation: 'New-password-123' },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Ya puedes iniciar sesión');
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Volver a iniciar sesión' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('un código rechazado no abre el formulario de contraseña y permite solicitar otro', async () => {
    const request = vi.fn<ApiRequest>().mockResolvedValueOnce({}).mockRejectedValueOnce(new ApiError(400, { message: 'Código inválido o vencido.' }));
    render(<PasswordRecoveryPage request={request} onBack={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    await userEvent.type(await screen.findByLabelText('Código de verificación'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar código' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido');
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Solicitar otro código' }));
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('ana@example.test');
    expect(screen.queryByLabelText('Código de verificación')).not.toBeInTheDocument();
  });
});
