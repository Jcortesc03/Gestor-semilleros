import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErrorNotice } from '../../src/components/WorkspaceUi';
import { ApiError } from '../../src/lib/api';

describe('ErrorNotice', () => {
  it('lista cada error de validación dentro del mismo aviso', () => {
    const error = new ApiError(400, { message: 'Datos inválidos.', errors: ['El título es obligatorio.', 'La fecha no es válida.'] });
    render(<ErrorNotice error={error} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Datos inválidos.');
    const items = within(alert).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['El título es obligatorio.', 'La fecha no es válida.']);
  });

  it('muestra solo el mensaje cuando no hay lista de errores', () => {
    render(<ErrorNotice error={new ApiError(409, { message: 'Ya existe un usuario con ese correo.' })} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Ya existe un usuario con ese correo.');
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('usa un mensaje genérico para errores que no son ApiError', () => {
    render(<ErrorNotice error={new Error('fallo interno')} />);

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos completar la solicitud. Intenta de nuevo.');
    expect(screen.queryByText('fallo interno')).not.toBeInTheDocument();
  });
});
