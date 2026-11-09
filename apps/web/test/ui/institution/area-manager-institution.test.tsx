import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InstitutionWorkspace } from '../../../src/features/institution';
import { ApiError } from '../../../src/lib/api';
import { areaManager, fakeRequest, student } from './fixtures';

const investigacion = { id: 'a-1', name: 'Investigación', description: null };
const extension = { id: 'a-2', name: 'Extensión', description: 'Proyección social' };

describe('Áreas y facultades (encargado de área)', () => {
  it('pide solo sus áreas (scope=managed) y muestra edición sin acciones de administrador', async () => {
    const request = fakeRequest(async (path) => {
      if (path === '/api/areas?scope=managed') return [investigacion, extension];
      throw new ApiError(404);
    });
    render(<InstitutionWorkspace user={areaManager} request={request} />);

    expect(await screen.findByRole('button', { name: 'Editar Investigación' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Extensión' })).toBeInTheDocument();
    expect(screen.queryByText(/Se muestran todas las áreas/)).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/areas?scope=managed');
    expect(request).not.toHaveBeenCalledWith('/api/areas', expect.anything());
    expect(screen.queryByRole('button', { name: 'Crear área' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Encargados/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Facultades' })).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalledWith('/api/faculties', expect.anything());
    expect(request).not.toHaveBeenCalledWith('/api/faculties?scope=dean', expect.anything());
  });

  it('muestra solo las áreas asignadas que devuelve el servidor', async () => {
    const request = fakeRequest(async (path) => {
      if (path === '/api/areas?scope=managed') return [extension];
      throw new ApiError(404);
    });
    render(<InstitutionWorkspace user={areaManager} request={request} />);

    expect(await screen.findByRole('button', { name: 'Editar Extensión' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Investigación' })).not.toBeInTheDocument();
  });

  it('edita su área y envía la descripción vacía como null', async () => {
    const request = fakeRequest(async (path, options) => {
      if (path === '/api/areas/a-1' && options?.method === 'PATCH') return investigacion;
      if (path === '/api/areas?scope=managed') return [investigacion, extension];
      throw new ApiError(404);
    });
    const user = userEvent.setup();
    render(<InstitutionWorkspace user={areaManager} request={request} />);

    await user.click(await screen.findByRole('button', { name: 'Editar Investigación' }));
    await user.type(screen.getByLabelText('Nombre del área'), ' Central');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(request).toHaveBeenCalledWith('/api/areas/a-1', { method: 'PATCH', body: { name: 'Investigación Central', description: null } });
  });

  it('muestra el 403 del backend al editar un área ajena', async () => {
    const request = fakeRequest(async (path, options) => {
      if (path === '/api/areas/a-2' && options?.method === 'PATCH') {
        throw new ApiError(403, { message: 'No tienes permisos para realizar esta acción.' });
      }
      if (path === '/api/areas?scope=managed') return [investigacion, extension];
      throw new ApiError(404);
    });
    const user = userEvent.setup();
    render(<InstitutionWorkspace user={areaManager} request={request} />);

    await user.click(await screen.findByRole('button', { name: 'Editar Extensión' }));
    await user.clear(screen.getByLabelText('Descripción (opcional)'));
    await user.type(screen.getByLabelText('Descripción (opcional)'), 'Nuevo texto');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(request).toHaveBeenCalledWith('/api/areas/a-2', { method: 'PATCH', body: { name: 'Extensión', description: 'Nuevo texto' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permisos para realizar esta acción.');
  });

  it('muestra carga y, sin áreas asignadas, el estado vacío de encargado', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const request = fakeRequest((path) => {
      if (path === '/api/areas?scope=managed') return new Promise((r) => { resolve = r; });
      throw new ApiError(404);
    });
    const { unmount } = render(<InstitutionWorkspace user={areaManager} request={request} />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando áreas…');
    resolve([]);
    expect(await screen.findByText('No tienes áreas asignadas.')).toBeInTheDocument();
    expect(screen.queryByText('No hay áreas registradas')).not.toBeInTheDocument();
    unmount();
  });

  it('a quien no es administrador ni encargado solo se le indica que no está disponible', () => {
    const request = fakeRequest(async () => { throw new ApiError(403); });
    render(<InstitutionWorkspace user={student} request={request} />);
    expect(screen.getByText('Sección no disponible para este rol')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
});
