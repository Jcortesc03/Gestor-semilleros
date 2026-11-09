import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../../src/pages/LoginPage';

describe('LoginPage', () => {
  it('permite abrir la recuperación de contraseña', async () => {
    const onForgotPassword = vi.fn();
    render(<LoginPage onSubmit={vi.fn()} onForgotPassword={onForgotPassword} pending={false} error={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Olvidé mi contraseña' }));
    expect(onForgotPassword).toHaveBeenCalledOnce();
  });
  it('envía el correo sin espacios y limpia la contraseña tras el intento', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onSubmit={onSubmit} pending={false} error={null} />);

    await userEvent.type(screen.getByLabelText('Correo electrónico'), '  ana@example.test ');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta-123');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(onSubmit).toHaveBeenCalledWith({ email: 'ana@example.test', password: 'secreta-123' });
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
  });

  it('ofrece Google solo cuando está habilitado y lo invoca al pulsar', async () => {
    const { rerender } = render(<LoginPage onSubmit={vi.fn()} pending={false} error={null} />);
    expect(screen.queryByRole('button', { name: 'Continuar con Google' })).not.toBeInTheDocument();

    const onGoogle = vi.fn().mockResolvedValue(undefined);
    rerender(<LoginPage onSubmit={vi.fn()} onGoogle={onGoogle} pending={false} error={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }));
    expect(onGoogle).toHaveBeenCalledOnce();

    rerender(<LoginPage onSubmit={vi.fn()} onGoogle={onGoogle} pending error={null} />);
    expect(screen.getByRole('button', { name: 'Continuar con Google' })).toBeDisabled();
  });

  it('muestra el error recibido', () => {
    render(<LoginPage onSubmit={vi.fn()} pending={false} error="El correo o la contraseña no son correctos." />);
    expect(screen.getByRole('alert')).toHaveTextContent('El correo o la contraseña no son correctos.');
  });
});
