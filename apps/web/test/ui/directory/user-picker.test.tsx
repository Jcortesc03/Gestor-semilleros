import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { UserPicker } from '../../../src/features/directory';
import type { DirectoryUser } from '../../../src/features/directory';
import { ApiError } from '../../../src/lib/api';
import type { ApiRequest } from '../../../src/types/api';

const ana: DirectoryUser = { id: 'u-1', fullName: 'Ana Pérez', email: 'ana@example.test', roles: ['STUDENT'] };
const andres: DirectoryUser = { id: 'u-2', fullName: 'Andrés Gómez', email: 'andres@example.test', roles: ['STUDENT'] };

function Harness({ request, role }: { request: ApiRequest; role?: 'STUDENT' }) {
  const [selected, setSelected] = useState<DirectoryUser | null>(null);
  return <UserPicker request={request} label="Persona" role={role} selected={selected} onSelect={setSelected} onClear={() => setSelected(null)} />;
}

describe('UserPicker', () => {
  it('espera el debounce y el mínimo de 2 caracteres antes de buscar', async () => {
    const request = vi.fn<ApiRequest>(async () => [ana]);
    render(<Harness request={request} role="STUDENT" />);
    const input = screen.getByRole('combobox', { name: 'Persona' });

    await userEvent.type(input, 'a');
    await new Promise((r) => setTimeout(r, 350));
    expect(request).not.toHaveBeenCalled();

    await userEvent.type(input, 'n');
    expect(request).not.toHaveBeenCalled();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledWith('/api/users?search=an&role=STUDENT');
    expect(await screen.findByRole('option', { name: /Ana Pérez/ })).toHaveTextContent('ana@example.test');
  });

  it('una ráfaga de teclas produce una sola consulta', async () => {
    const request = vi.fn<ApiRequest>(async () => [ana]);
    render(<Harness request={request} />);
    await userEvent.type(screen.getByRole('combobox'), 'ana p');
    await screen.findByRole('option');
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/api/users?search=ana+p');
  });

  it('se elige con el teclado: flechas, Enter y Escape', async () => {
    const request = vi.fn<ApiRequest>(async () => [ana, andres]);
    render(<Harness request={request} />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'an');
    await screen.findAllByRole('option');
    expect(input).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    const options = screen.getAllByRole('option');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id);

    await userEvent.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await userEvent.keyboard('{ArrowUp}{ArrowDown}{Enter}');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Andrés Gómez')).toBeInTheDocument();
    expect(screen.getByText('andres@example.test')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Cambiar persona/ }));
    expect(screen.getByRole('combobox')).toHaveValue('');
  });

  it('descarta la respuesta obsoleta de una búsqueda anterior', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    const request = vi.fn<ApiRequest>(() => new Promise((resolve) => { resolvers.push(resolve); }));
    render(<Harness request={request} />);
    const input = screen.getByRole('combobox');

    await userEvent.type(input, 'an');
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await userEvent.type(input, 'd');
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));

    resolvers[1]([andres]);
    expect(await screen.findByRole('option', { name: /Andrés Gómez/ })).toBeInTheDocument();
    resolvers[0]([ana]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('option', { name: /Ana Pérez/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Andrés Gómez/ })).toBeInTheDocument();
  });

  it('muestra cargando y estado vacío', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const request = vi.fn<ApiRequest>(() => new Promise((r) => { resolve = r; }));
    render(<Harness request={request} />);
    await userEvent.type(screen.getByRole('combobox'), 'zz');
    expect(screen.getByRole('status')).toHaveTextContent('Buscando usuarios…');
    await waitFor(() => expect(request).toHaveBeenCalled());
    resolve([]);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No encontramos usuarios con ese criterio.'));
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('muestra el error del servidor (403) sin romper el campo', async () => {
    const request = vi.fn<ApiRequest>(async () => { throw new ApiError(403); });
    render(<Harness request={request} />);
    await userEvent.type(screen.getByRole('combobox'), 'an');
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso');
    expect(screen.getByRole('combobox')).toBeEnabled();
  });

  it('trata una respuesta con forma inválida como error', async () => {
    const request = vi.fn<ApiRequest>(async () => ({ not: 'a list' }));
    render(<Harness request={request} />);
    await userEvent.type(screen.getByRole('combobox'), 'an');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('no ofrece usuarios excluidos', async () => {
    const request = vi.fn<ApiRequest>(async () => [ana, andres]);
    render(<UserPicker request={request} label="Persona" excludeIds={['u-1']} onSelect={() => undefined} />);
    await userEvent.type(screen.getByRole('combobox'), 'an');
    expect(await screen.findAllByRole('option')).toHaveLength(1);
    expect(screen.queryByRole('option', { name: /Ana Pérez/ })).not.toBeInTheDocument();
  });
});
