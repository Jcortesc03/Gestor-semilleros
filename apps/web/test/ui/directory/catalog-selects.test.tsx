import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AreaSelect, FacultyMultiSelect } from '../../../src/features/directory';
import { ApiError } from '../../../src/lib/api';
import type { ApiRequest } from '../../../src/types/api';

const areas = [{ id: 'a-1', name: 'Investigación', description: null }, { id: 'a-2', name: 'Extensión', description: 'x' }];
const faculties = [{ id: 'f-1', name: 'Ingeniería' }, { id: 'f-2', name: 'Ciencias' }, { id: 'f-3', name: 'Derecho' }];

describe('AreaSelect', () => {
  it('carga las áreas y notifica la elección', async () => {
    const request = vi.fn<ApiRequest>(async () => areas);
    const onChange = vi.fn();
    render(<AreaSelect request={request} label="Área" value="" onChange={onChange} />);
    expect(screen.getByLabelText('Área')).toBeDisabled();
    await screen.findByRole('option', { name: 'Extensión' });
    await userEvent.selectOptions(screen.getByLabelText('Área'), 'a-2');
    expect(request).toHaveBeenCalledWith('/api/areas');
    expect(onChange).toHaveBeenCalledWith('a-2');
  });

  it('muestra el error y permite reintentar', async () => {
    let fail = true;
    const request = vi.fn<ApiRequest>(async () => { if (fail) throw new ApiError(500); return areas; });
    render(<AreaSelect request={request} label="Área" value="" onChange={() => undefined} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar áreas' }));
    expect(await screen.findByRole('option', { name: 'Investigación' })).toBeInTheDocument();
  });

  it('indica cuando el catálogo está vacío', async () => {
    render(<AreaSelect request={async () => []} label="Área" value="" onChange={() => undefined} />);
    expect(await screen.findByText('No hay áreas registradas.')).toBeInTheDocument();
  });
});

describe('FacultyMultiSelect', () => {
  function Harness({ request }: { request: ApiRequest }) {
    const [value, setValue] = useState<string[]>([]);
    return <><FacultyMultiSelect request={request} value={value} onChange={setValue} /><output data-testid="value">{value.join(',')}</output></>;
  }

  it('permite elegir varias facultades y conserva el orden del catálogo', async () => {
    render(<Harness request={vi.fn<ApiRequest>(async () => faculties)} />);
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Derecho' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ingeniería' }));
    expect(screen.getByTestId('value')).toHaveTextContent('f-1,f-3');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Derecho' }));
    expect(screen.getByTestId('value')).toHaveTextContent(/^f-1$/);
  });

  it('muestra el error del catálogo', async () => {
    render(<Harness request={async () => { throw new ApiError(401); }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión expiró');
  });
});
