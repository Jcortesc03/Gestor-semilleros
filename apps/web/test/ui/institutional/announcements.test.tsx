import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InstitutionalWorkspace } from '../../../src/features/institutional';
import { ApiError } from '../../../src/lib/api.ts';
import { admin, fakeRequest } from './fixtures';

const announcement = {
  id: 'a-1',
  kind: 'NEWS',
  title: 'Convocatoria de semilleros',
  content: 'La convocatoria estará abierta hasta el 30 de noviembre.',
  publishedAt: '2026-11-06T15:00:00.000Z',
  author: { id: 'u-admin', fullName: 'Administrador de Ejemplo' },
  audiences: [{ type: 'ALL' }],
};

describe('Novedades institucionales', () => {
  it('carga y muestra el feed aunque StrictMode ejecute los efectos dos veces', async () => {
    const request = fakeRequest(async () => [announcement]);
    render(
      <StrictMode>
        <InstitutionalWorkspace user={admin} request={request} section="announcements" />
      </StrictMode>,
    );

    expect(await screen.findByRole('heading', { name: 'Convocatoria de semilleros' })).toBeInTheDocument();
    expect(screen.getByText('La convocatoria estará abierta hasta el 30 de noviembre.')).toBeInTheDocument();
    expect(screen.getByText(/Audiencia: todos los usuarios/)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/announcements');
  });

  it('muestra el estado vacío cuando no hay novedades visibles', async () => {
    const request = fakeRequest(async () => []);
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    expect(await screen.findByText('No hay novedades visibles')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Convocatoria de semilleros' })).not.toBeInTheDocument();
  });

  it('muestra el error del servidor en lugar de quedarse cargando', async () => {
    const request = fakeRequest(async () => { throw new ApiError(403); });
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para realizar esta acción.');
    expect(screen.queryByText('Cargando novedades…')).not.toBeInTheDocument();
  });

  it('publica una novedad para todos y envía el cuerpo del contrato', async () => {
    const created = { ...announcement, id: 'a-2', title: 'Nueva noticia', queuedDeliveries: 3 };
    const request = fakeRequest(async (_path, options) => (options?.method === 'POST' ? created : []));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    await user.type(screen.getByLabelText('Título'), 'Nueva noticia');
    await user.type(screen.getByLabelText('Contenido'), 'Cuerpo de la noticia');
    await user.click(screen.getByRole('button', { name: 'Publicar novedad' }));

    expect(request).toHaveBeenCalledWith('/api/announcements', {
      method: 'POST',
      body: { kind: 'NEWS', title: 'Nueva noticia', content: 'Cuerpo de la noticia', audiences: [{ type: 'ALL' }] },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Copias encoladas: 3');
  });

  it('muestra el resumen de entregas que devuelve el servidor', async () => {
    const summary = {
      EMAIL: { PENDING: 0, SENT: 10, FAILED: 1, SKIPPED: 1 },
      WHATSAPP: { PENDING: 0, SENT: 2, FAILED: 0, SKIPPED: 0 },
    };
    const request = fakeRequest(async (path) => (path.endsWith('/deliveries') ? summary : [announcement]));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await user.click(await screen.findByRole('button', { name: 'Ver resumen de entregas' }));
    expect(await screen.findByText(/Enviados: 10 · Pendientes: 0 · Fallidos: 1 · Omitidos: 1/)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/announcements/a-1/deliveries');
  });

  it('un decano elige facultades del catálogo en lugar de escribir un UUID', async () => {
    const dean = { ...admin, id: 'u-dean', fullName: 'Decano de Ejemplo', roles: ['DEAN'] };
    const created = { ...announcement, id: 'a-3', title: 'Aviso de facultad', queuedDeliveries: 0 };
    const request = fakeRequest(async (path, options) => {
      if (options?.method === 'POST') return created;
      if (path === '/api/faculties?scope=dean') return [{ id: 'f-ing', name: 'Facultad de Ingeniería' }, { id: 'f-cie', name: 'Facultad de Ciencias' }];
      return [];
    });
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={dean} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    expect(screen.queryByLabelText(/UUID/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Título'), 'Aviso de facultad');
    await user.type(screen.getByLabelText('Contenido'), 'Texto del aviso');
    expect(screen.getByRole('button', { name: 'Publicar novedad' })).toBeDisabled();
    await user.click(await screen.findByLabelText('Facultad de Ingeniería'));
    await user.click(screen.getByRole('button', { name: 'Publicar novedad' }));

    const post = request.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(post?.[1]?.body).toMatchObject({ audiences: [{ type: 'FACULTY', facultyId: 'f-ing' }] });
  });
});

/** Usuarios ficticios para las audiencias por rol (ADR 0010, sec. 8). */
const areaManager = { ...admin, id: 'u-area', fullName: 'Encargado de Ejemplo', roles: ['AREA_MANAGER'] };
const tutor = { ...admin, id: 'u-tutor', fullName: 'Tutor de Ejemplo', roles: ['TUTOR'] };
const dean = { ...admin, id: 'u-dean', fullName: 'Decano de Ejemplo', roles: ['DEAN'] };

const project = (id: string, title: string) => ({
  id, title, description: null, status: 'ACTIVE', area: { id: 'ar-sem', name: 'Semilleros' },
  faculties: [], startsOn: null, endsOn: null, createdAt: '2026-11-06T15:00:00.000Z',
});

function audienceOptionNames(): string[] {
  return within(screen.getByLabelText('Destinatarios')).getAllByRole('option').map((option) => option.textContent ?? '');
}

describe('Audiencias de novedades según el rol', () => {
  it('el administrador ve todas las audiencias y publica a todos por defecto', async () => {
    const request = fakeRequest(async () => []);
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    expect(audienceOptionNames()).toEqual(['Todos los usuarios', 'Área', 'Por roles', 'Facultades', 'Proyecto']);
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
  });

  it('el administrador publica por roles: una audiencia ROLE por cada rol marcado', async () => {
    const created = { ...announcement, id: 'a-6', title: 'Aviso por roles', queuedDeliveries: 4 };
    const request = fakeRequest(async (_path, options) => (options?.method === 'POST' ? created : []));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    await user.type(screen.getByLabelText('Título'), 'Aviso por roles');
    await user.type(screen.getByLabelText('Contenido'), 'Cuerpo por roles');
    await user.selectOptions(screen.getByLabelText('Destinatarios'), 'ROLE');
    expect(screen.getByRole('button', { name: 'Publicar novedad' })).toBeDisabled();
    await user.click(screen.getByLabelText('Tutor'));
    await user.click(screen.getByLabelText('Estudiante'));
    await user.click(screen.getByRole('button', { name: 'Publicar novedad' }));

    expect(request).toHaveBeenCalledWith('/api/announcements', {
      method: 'POST',
      body: {
        kind: 'NEWS',
        title: 'Aviso por roles',
        content: 'Cuerpo por roles',
        audiences: [{ type: 'ROLE', role: 'TUTOR' }, { type: 'ROLE', role: 'STUDENT' }],
      },
    });
    expect(request.mock.calls.some(([path]) => path === '/api/projects' || path.endsWith('/members'))).toBe(false);
  });

  it('el encargado de área publica a su área y no ofrece todos los usuarios', async () => {
    const created = { ...announcement, id: 'a-4', title: 'Aviso de área', queuedDeliveries: 1 };
    const request = fakeRequest(async (path, options) => {
      if (options?.method === 'POST') return created;
      if (path === '/api/areas?scope=managed') return [{ id: 'ar-sem', name: 'Semilleros', description: null }];
      return [];
    });
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={areaManager} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    expect(audienceOptionNames()).toEqual(['Área', 'Por roles']);
    expect(await screen.findByRole('option', { name: 'Semilleros' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/areas?scope=managed');
    expect(request).not.toHaveBeenCalledWith('/api/areas');
    expect(screen.getByRole('button', { name: 'Publicar novedad' })).toBeDisabled();
    await user.type(screen.getByLabelText('Título'), 'Aviso de área');
    await user.type(screen.getByLabelText('Contenido'), 'Texto del aviso');
    await user.selectOptions(await screen.findByLabelText('Área destinataria'), 'ar-sem');
    await user.click(screen.getByRole('button', { name: 'Publicar novedad' }));

    expect(request).toHaveBeenCalledWith('/api/announcements', {
      method: 'POST',
      body: { kind: 'NEWS', title: 'Aviso de área', content: 'Texto del aviso', audiences: [{ type: 'AREA', areaId: 'ar-sem' }] },
    });
  });

  it('el tutor publica a sus proyectos, sin ALL, FACULTY ni NOTIFICATION', async () => {
    const created = { ...announcement, id: 'a-5', title: 'Aviso del proyecto', queuedDeliveries: 0 };
    const request = fakeRequest(async (path, options) => {
      if (options?.method === 'POST') return created;
      if (path === '/api/projects/tutored') return [project('p-1', 'Semillero de robótica')];
      if (path === '/api/projects') return [project('p-1', 'Semillero de robótica'), project('p-2', 'Semillero ajeno')];
      return [];
    });
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={tutor} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    expect(audienceOptionNames()).toEqual(['Proyecto']);
    const kinds = within(screen.getByLabelText('Tipo')).getAllByRole('option').map((option) => option.textContent);
    expect(kinds).not.toContain('Notificación');

    expect(await screen.findByRole('option', { name: 'Semillero de robótica' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Semillero ajeno' })).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/projects/tutored');
    expect(request).not.toHaveBeenCalledWith('/api/projects');
    expect(request.mock.calls.some(([path]) => path.endsWith('/members'))).toBe(false);
    await user.type(screen.getByLabelText('Título'), 'Aviso del proyecto');
    await user.type(screen.getByLabelText('Contenido'), 'Texto del aviso');
    await user.selectOptions(screen.getByLabelText('Proyecto destinatario'), 'p-1');
    await user.click(screen.getByRole('button', { name: 'Publicar novedad' }));

    expect(request).toHaveBeenCalledWith('/api/announcements', {
      method: 'POST',
      body: { kind: 'NEWS', title: 'Aviso del proyecto', content: 'Texto del aviso', audiences: [{ type: 'PROJECT', projectId: 'p-1' }] },
    });
  });

  it('el decano elige facultades o proyectos y puede usar el tipo Notificación', async () => {
    const request = fakeRequest(async (path) => {
      if (path === '/api/faculties?scope=dean') return [{ id: 'f-ing', name: 'Facultad de Ingeniería' }];
      if (path === '/api/projects') return [];
      return [];
    });
    render(<InstitutionalWorkspace user={dean} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    expect(audienceOptionNames()).toEqual(['Facultades', 'Proyecto']);
    expect(within(screen.getByLabelText('Tipo')).getByRole('option', { name: 'Notificación' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Facultad de Ingeniería')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/faculties?scope=dean');
    expect(request).not.toHaveBeenCalledWith('/api/faculties');
  });

  it('un usuario con varios roles elige primero el tipo de audiencia que le corresponde', async () => {
    const request = fakeRequest(async (path) => (path === '/api/areas?scope=managed' ? [{ id: 'ar-sem', name: 'Semilleros', description: null }] : []));
    render(<InstitutionalWorkspace user={{ ...dean, roles: ['DEAN', 'AREA_MANAGER'] }} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    expect(audienceOptionNames()).toEqual(['Área', 'Por roles', 'Facultades', 'Proyecto']);
    expect(screen.getByLabelText('Destinatarios')).toHaveValue('AREA');
    expect(await screen.findByLabelText('Área destinataria')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/areas?scope=managed');
  });
});
