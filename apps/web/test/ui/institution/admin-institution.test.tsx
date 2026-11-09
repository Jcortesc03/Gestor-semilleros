import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InstitutionWorkspace } from '../../../src/features/institution';
import { ApiError } from '../../../src/lib/api';
import { admin, dean, fakeRequest } from './fixtures';

const investigacion = { id: 'a-1', name: 'Investigación', description: 'Línea base' };
const ingenieria = { id: 'f-1', name: 'Ingeniería' };

describe('Áreas y facultades (administrador)', () => {
  it('pide el catálogo completo sin filtro de alcance', async () => {
    const request = fakeRequest(async (path) => {
      if (path === '/api/areas') return [investigacion];
      if (path === '/api/faculties') return [ingenieria];
      throw new ApiError(404);
    });
    render(<InstitutionWorkspace user={admin} request={request} />);

    expect(await screen.findByRole('button', { name: 'Editar Investigación' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Renombrar Ingeniería' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/areas');
    expect(request).toHaveBeenCalledWith('/api/faculties');
    expect(request).not.toHaveBeenCalledWith('/api/areas?scope=managed');
  });

  it('crea un área con el cuerpo del contrato y recarga la lista', async () => {
    let created = false;
    const request = fakeRequest(async (path, options) => {
      if (path === '/api/areas' && options?.method === 'POST') { created = true; return investigacion; }
      if (path === '/api/areas') return created ? [investigacion] : [];
      if (path === '/api/faculties') return [ingenieria];
      throw new ApiError(404);
    });
    const user = userEvent.setup();
    render(<InstitutionWorkspace user={admin} request={request} />);

    await screen.findByText('No hay áreas registradas');
    await user.type(screen.getByLabelText('Nombre del área'), '  Investigación ');
    await user.type(screen.getByLabelText('Descripción (opcional)'), 'Línea base');
    await user.click(screen.getByRole('button', { name: 'Crear área' }));

    expect(request).toHaveBeenCalledWith('/api/areas', {
      method: 'POST',
      body: { name: 'Investigación', description: 'Línea base' },
    });
    expect(await screen.findByRole('button', { name: 'Editar Investigación' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del área')).toHaveValue('');
  });

  it('pide confirmación antes de eliminar un área', async () => {
    let areas = [investigacion];
    const request = fakeRequest(async (path, options) => {
      if (path === '/api/areas/a-1' && options?.method === 'DELETE') { areas = []; return undefined; }
      if (path === '/api/areas') return areas;
      if (path === '/api/faculties') return [];
      throw new ApiError(404);
    });
    const user = userEvent.setup();
    render(<InstitutionWorkspace user={admin} request={request} />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar Investigación' }));
    expect(screen.getByRole('group', { name: 'Confirmación' })).toHaveTextContent('¿Eliminar el área «Investigación»?');
    expect(request).not.toHaveBeenCalledWith('/api/areas/a-1', expect.anything());

    await user.click(screen.getByRole('button', { name: 'Sí, eliminar área' }));
    expect(request).toHaveBeenCalledWith('/api/areas/a-1', { method: 'DELETE' });
    expect(await screen.findByText('No hay áreas registradas')).toBeInTheDocument();
  });

  it('cancela la eliminación sin llamar al backend', async () => {
    const request = fakeRequest(async (path) => {
      if (path === '/api/areas') return [investigacion];
      if (path === '/api/faculties') return [];
      throw new ApiError(404);
    });
    const user = userEvent.setup();
    render(<InstitutionWorkspace user={admin} request={request} />);

    await user.click(await screen.findByRole('button', { name: 'Eliminar Investigación' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('group', { name: 'Confirmación' })).not.toBeInTheDocument();
    expect(request.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
  });

  it('asigna el decano con el buscador de personas (rol DEAN)', async () => {
    let assigned: unknown = null;
    const request = fakeRequest(async (path, options) => {
      if (path === '/api/areas') return [];
      if (path === '/api/faculties') return [ingenieria];
      if (path === '/api/faculties/f-1/deans') return assigned ? [assigned] : [];
      if (path.startsWith('/api/users?')) return { items: [dean], total: 1, page: 1, pageSize: 20 };
      if (path === '/api/faculties/f-1/dean' && options?.method === 'PUT') {
        assigned = { id: 'd-1', userId: dean.id, fullName: dean.fullName, email: dean.email, startsAt: '2026-11-07T10:00:00.000Z', endsAt: null };
        return assigned;
      }
      throw new ApiError(404);
    });
    const user = userEvent.setup();
    render(<InstitutionWorkspace user={admin} request={request} />);

    await user.click(await screen.findByRole('button', { name: 'Decanos de Ingeniería' }));
    expect(await screen.findByText('Esta facultad no tiene decano vigente.')).toBeInTheDocument();

    const picker = screen.getByRole('combobox', { name: 'Nuevo decano' });
    await user.type(picker, 'Die');
    await user.click(await screen.findByRole('option', { name: /Diego Decano/ }));
    expect(request).toHaveBeenCalledWith('/api/users?search=Die&role=DEAN&pageSize=20');

    await user.click(screen.getByRole('button', { name: 'Asignar decano' }));
    expect(request).toHaveBeenCalledWith('/api/faculties/f-1/dean', { method: 'PUT', body: { userId: 'u-dean' } });
    expect(await screen.findByText('Decano vigente')).toBeInTheDocument();
  });

  it('cierra el decanato vigente solo tras confirmar', async () => {
    let closed = false;
    const current = { id: 'd-1', userId: dean.id, fullName: dean.fullName, email: dean.email, startsAt: '2026-11-01T08:00:00.000Z', endsAt: null };
    const request = fakeRequest(async (path, options) => {
      if (path === '/api/areas') return [];
      if (path === '/api/faculties') return [ingenieria];
      if (path === '/api/faculties/f-1/deans') return closed ? [{ ...current, endsAt: '2026-11-07T10:00:00.000Z' }] : [current];
      if (path === '/api/faculties/f-1/dean' && options?.method === 'DELETE') { closed = true; return undefined; }
      throw new ApiError(404);
    });
    const user = userEvent.setup();
    render(<InstitutionWorkspace user={admin} request={request} />);

    await user.click(await screen.findByRole('button', { name: 'Decanos de Ingeniería' }));
    const panel = await screen.findByRole('region', { name: 'Decanos de Ingeniería' });
    expect(within(panel).getByText('Decano vigente')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Cerrar decanato' }));
    expect(request.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
    await user.click(within(panel).getByRole('button', { name: 'Sí, cerrar decanato' }));

    expect(request).toHaveBeenCalledWith('/api/faculties/f-1/dean', { method: 'DELETE' });
    await waitFor(() => expect(within(panel).getByText('Esta facultad no tiene decano vigente.')).toBeInTheDocument());
  });

  it('muestra carga, error con reintento y el estado vacío', async () => {
    let attempts = 0;
    const request = fakeRequest(async (path) => {
      if (path === '/api/areas') {
        attempts += 1;
        if (attempts === 1) throw new ApiError(500);
        return [investigacion];
      }
      if (path === '/api/faculties') return [];
      throw new ApiError(404);
    });
    const user = userEvent.setup();
    render(<InstitutionWorkspace user={admin} request={request} />);

    expect(screen.getByText('Cargando áreas…')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible en este momento.');
    await user.click(screen.getByRole('button', { name: 'Reintentar áreas' }));
    expect(await screen.findByRole('button', { name: 'Editar Investigación' })).toBeInTheDocument();
    expect(screen.getByText('No hay facultades registradas')).toBeInTheDocument();
  });

  it('exige el nombre antes de enviar', async () => {
    const request = fakeRequest(async (path) => {
      if (path === '/api/areas' || path === '/api/faculties') return [];
      throw new ApiError(404);
    });
    const user = userEvent.setup();
    render(<InstitutionWorkspace user={admin} request={request} />);

    await user.click(await screen.findByRole('button', { name: 'Crear área' }));
    expect(screen.getByText('Escribe un nombre.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre del área')).toHaveFocus();
    expect(request.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });
});
