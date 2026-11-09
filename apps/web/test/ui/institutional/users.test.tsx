import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstitutionalWorkspace } from '../../../src/features/institutional';
import { ApiError } from '../../../src/lib/api';
import type { ApiOptions } from '../../../src/types/api';
import { admin, fakeRequest, student } from './fixtures';

const CREATED = {
  id: 'new-1',
  email: 'tutor@example.test',
  fullName: 'Tutor de Ejemplo',
  status: 'ACTIVE',
  roles: ['TUTOR'],
  hasPassword: true,
  createdAt: '2026-11-07T10:00:00.000Z',
};

/** Usuarios ficticios para la gestión de cuentas. */
const ana = { id: 'u-2', fullName: 'Ana Pérez', email: 'ana@example.test', roles: ['STUDENT'], status: 'ACTIVE' };
const bruno = { id: 'u-3', fullName: 'Bruno Ruiz', email: 'bruno@example.test', roles: ['TUTOR'], status: 'INACTIVE' };
const anaDetail = {
  ...ana,
  hasPassword: true,
  mustChangePassword: false,
  createdAt: '2026-01-10T10:00:00.000Z',
  updatedAt: '2026-01-10T10:00:00.000Z',
};

/** Página de `GET /api/users` (ADR 0017). */
const pageOf = (items: unknown[], extra: Partial<{ total: number; page: number }> = {}) => ({ items, total: items.length, page: 1, pageSize: 20, ...extra });

/** Respuesta por defecto del servidor: listado (según el filtro) y detalle de Ana. */
function usersApi(path: string, options?: ApiOptions): unknown {
  if (path.startsWith('/api/users?')) {
    if (path.includes('status=INACTIVE')) return pageOf([bruno]);
    if (path.includes('search=')) return pageOf([]);
    return pageOf([ana]);
  }
  if (path === '/api/users/u-2' && !options?.method) return anaDetail;
  throw new Error(`Ruta no prevista: ${options?.method ?? 'GET'} ${path}`);
}

/** Panel del usuario seleccionado: su título es el nombre de la cuenta. */
function panelOf(name: string): HTMLElement {
  const section = screen.getByRole('heading', { name, level: 2 }).closest('section');
  if (!section) throw new Error('Panel no encontrado');
  return section;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Alta de usuarios', () => {
  it('no ofrece la gestión a quien no es administrador', () => {
    const request = fakeRequest(usersApi);
    render(<InstitutionalWorkspace user={student} request={request} section="users" />);

    expect(screen.getByText('Solo un administrador puede crear y gestionar cuentas.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear cuenta' })).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('envía el cuerpo del contrato con la contraseña opcional y limpia el campo', async () => {
    const request = fakeRequest((path, options) => (options?.method === 'POST' ? CREATED : usersApi(path, options)));
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
    const request = fakeRequest((path, options) => (options?.method === 'POST' ? CREATED : usersApi(path, options)));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    await user.type(screen.getByLabelText('Correo institucional'), 'tutor@example.test');
    await user.type(screen.getByLabelText('Nombre completo'), 'Tutor de Ejemplo');
    await user.selectOptions(screen.getByLabelText('Rol global'), 'TUTOR');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    const post = request.mock.calls.find(([path, options]) => path === '/api/users' && options?.method === 'POST');
    expect(post?.[1]).toEqual({ method: 'POST', body: { email: 'tutor@example.test', fullName: 'Tutor de Ejemplo', roles: ['TUTOR'] } });
    expect(post?.[1]?.body).not.toHaveProperty('password');
  });

  it('muestra la política de contraseñas y valida en cliente antes de enviar', async () => {
    const request = fakeRequest(usersApi);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    expect(screen.getByText('Entre 10 y 256 caracteres, con al menos una letra y un número, distinta del correo.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Correo institucional'), 'tutor1@example.test');
    await user.type(screen.getByLabelText('Nombre completo'), 'Tutor de Ejemplo');
    await user.type(screen.getByLabelText('Contraseña opcional'), 'sololetras');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('La contraseña debe incluir al menos un número.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Contraseña opcional'));
    await user.type(screen.getByLabelText('Contraseña opcional'), 'TUTOR1@EXAMPLE.TEST');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('La contraseña no puede ser igual al correo.')).toBeInTheDocument();

    expect(request.mock.calls.some(([path, options]) => path === '/api/users' && options?.method === 'POST')).toBe(false);
  });
});

describe('Listado de usuarios', () => {
  it('muestra nombre, correo, roles y estado, y filtra por estado con la consulta del contrato', async () => {
    const request = fakeRequest(usersApi);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    const list = await screen.findByRole('list', { name: 'Usuarios' });
    expect(within(list).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(list).getByText('ana@example.test')).toBeInTheDocument();
    expect(within(list).getByText('Estudiante')).toBeInTheDocument();
    expect(within(list).getByText('Activo')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/users?status=ACTIVE&page=1&pageSize=20');

    await user.selectOptions(screen.getByLabelText('Estado'), 'INACTIVE');
    expect(await within(await screen.findByRole('list', { name: 'Usuarios' })).findByText('Bruno Ruiz')).toBeInTheDocument();
    expect(request).toHaveBeenLastCalledWith('/api/users?status=INACTIVE&page=1&pageSize=20');
  });

  it('busca con debounce: una ráfaga de teclas produce una sola consulta', async () => {
    const request = fakeRequest(usersApi);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);
    await screen.findByRole('list', { name: 'Usuarios' });

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nombre o correo' }), 'ana');
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/users?search=ana&status=ACTIVE&page=1&pageSize=20'));
    const searches = request.mock.calls.filter(([path]) => path.includes('search='));
    expect(searches).toHaveLength(1);
  });

  it('pagina el directorio y vuelve a la primera página al cambiar un filtro', async () => {
    const request = fakeRequest((path, options) => {
      if (path === '/api/users?status=ACTIVE&page=1&pageSize=20') return pageOf([ana], { total: 25 });
      if (path === '/api/users?status=ACTIVE&page=2&pageSize=20') return pageOf([{ ...ana, id: 'u-9', fullName: 'Zoe Página Dos' }], { total: 25, page: 2 });
      return usersApi(path, options);
    });
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    const nav = await screen.findByRole('navigation', { name: 'Paginación de Usuarios' });
    expect(nav).toHaveTextContent('1–20 de 25 · página 1 de 2');
    await user.click(within(nav).getByRole('button', { name: 'Página siguiente' }));
    expect(await screen.findByText('Zoe Página Dos')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/users?status=ACTIVE&page=2&pageSize=20');

    await user.selectOptions(screen.getByLabelText('Estado'), 'INACTIVE');
    expect(await screen.findByText('Bruno Ruiz')).toBeInTheDocument();
    expect(request).toHaveBeenLastCalledWith('/api/users?status=INACTIVE&page=1&pageSize=20');
  });

  it('muestra el estado vacío cuando no hay resultados', async () => {
    const request = fakeRequest((path, options) => (path.startsWith('/api/users?') ? pageOf([]) : usersApi(path, options)));
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    expect(await screen.findByText('No hay usuarios con estos filtros')).toBeInTheDocument();
  });

  it('muestra el error del listado con ErrorNotice', async () => {
    const request = fakeRequest(() => {
      throw new ApiError(403, { message: 'No tienes permisos para realizar esta acción.' });
    });
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    expect(await screen.findByText('No tienes permisos para realizar esta acción.')).toBeInTheDocument();
  });
});

describe('Detalle y edición de usuarios', () => {
  it('edita solo los roles cambiados con el cuerpo correcto', async () => {
    const request = fakeRequest((path, options) => {
      if (path === '/api/users/u-2' && options?.method === 'PATCH') {
        return { ...anaDetail, roles: ['TUTOR', 'STUDENT'], updatedAt: '2026-11-07T10:00:00.000Z' };
      }
      return usersApi(path, options);
    });
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    const panel = panelOf('Ana Pérez');
    const save = within(panel).getByRole('button', { name: 'Guardar cambios' });
    expect(save).toBeDisabled();

    await user.click(within(panel).getByRole('checkbox', { name: 'Tutor' }));
    await user.click(save);

    expect(request).toHaveBeenCalledWith('/api/users/u-2', { method: 'PATCH', body: { roles: ['TUTOR', 'STUDENT'] } });
    expect(await within(panel).findByText('Cambios guardados.')).toBeInTheDocument();
  });

  it('muestra el 409 del backend con ErrorNotice al quitar un rol que se ejerce', async () => {
    const message = 'No puedes quitar el rol Estudiante: ejerces como estudiante activo en el proyecto Semillero Demo.';
    const request = fakeRequest((path, options) => {
      if (path === '/api/users/u-2' && options?.method === 'PATCH') throw new ApiError(409, { message });
      return usersApi(path, options);
    });
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    const panel = panelOf('Ana Pérez');
    await user.click(within(panel).getByRole('checkbox', { name: 'Estudiante' }));
    await user.click(within(panel).getByRole('checkbox', { name: 'Tutor' }));
    await user.click(within(panel).getByRole('button', { name: 'Guardar cambios' }));

    expect(await within(panel).findByText(message)).toBeInTheDocument();
  });

  it('exige al menos un rol antes de enviar', async () => {
    const request = fakeRequest(usersApi);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    const panel = panelOf('Ana Pérez');
    await user.click(within(panel).getByRole('checkbox', { name: 'Estudiante' }));
    await user.click(within(panel).getByRole('button', { name: 'Guardar cambios' }));

    expect(await within(panel).findByText('Selecciona al menos un rol.')).toBeInTheDocument();
    expect(request.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
  });

  it('desactiva solo después de confirmar', async () => {
    const request = fakeRequest((path, options) => {
      if (path === '/api/users/u-2/deactivate') return { ...anaDetail, status: 'INACTIVE' };
      return usersApi(path, options);
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    const panel = panelOf('Ana Pérez');

    await user.click(within(panel).getByRole('button', { name: 'Desactivar cuenta' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.some(([path]) => path.endsWith('/deactivate'))).toBe(false);

    await user.click(within(panel).getByRole('button', { name: 'Desactivar cuenta' }));
    expect(request).toHaveBeenCalledWith('/api/users/u-2/deactivate', { method: 'POST' });
    expect(await within(panel).findByRole('button', { name: 'Reactivar cuenta' })).toBeInTheDocument();
  });

  it('fija una contraseña temporal y avisa de que deberá cambiarla', async () => {
    const request = fakeRequest((path, options) => {
      if (path === '/api/users/u-2/password') return undefined;
      return usersApi(path, options);
    });
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    const panel = panelOf('Ana Pérez');
    await user.type(within(panel).getByLabelText('Nueva contraseña temporal'), 'Temporal-2026');
    await user.click(within(panel).getByRole('button', { name: 'Fijar contraseña temporal' }));

    expect(request).toHaveBeenCalledWith('/api/users/u-2/password', { method: 'PUT', body: { password: 'Temporal-2026' } });
    expect(await within(panel).findByText('Contraseña temporal fijada para ana@example.test. Deberá cambiarla al entrar.')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Nueva contraseña temporal')).toHaveValue('');
  });

  it('valida la política de la contraseña temporal antes de enviar', async () => {
    const request = fakeRequest(usersApi);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    await user.click(await screen.findByRole('button', { name: /Ana Pérez/ }));
    const panel = panelOf('Ana Pérez');
    await user.type(within(panel).getByLabelText('Nueva contraseña temporal'), 'corta1');
    await user.click(within(panel).getByRole('button', { name: 'Fijar contraseña temporal' }));

    expect(await within(panel).findByText('La contraseña debe tener entre 10 y 256 caracteres.')).toBeInTheDocument();
    expect(request.mock.calls.some(([path]) => path.endsWith('/password'))).toBe(false);
  });
});

describe('Carga y peticiones obsoletas', () => {
  it('muestra el estado de carga mientras llega el listado', async () => {
    const request = fakeRequest(() => new Promise(() => undefined));
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    expect(await screen.findByText('Cargando usuarios…')).toBeInTheDocument();
  });

  it('descarta la respuesta de un filtro anterior que llega tarde', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const request = fakeRequest((path, options) => {
      if (path === '/api/users?status=ACTIVE&page=1&pageSize=20') return new Promise((resolve) => { resolveFirst = resolve; });
      return usersApi(path, options);
    });
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="users" />);

    await user.selectOptions(screen.getByLabelText('Estado'), 'INACTIVE');
    expect(await screen.findByText('Bruno Ruiz')).toBeInTheDocument();
    resolveFirst?.(pageOf([ana]));
    await Promise.resolve();
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument();
  });
});
