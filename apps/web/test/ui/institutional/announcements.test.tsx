import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    expect(request).toHaveBeenCalledWith('/api/announcements?limit=20');
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
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
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
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
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
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
    expect(audienceOptionNames()).toEqual(['Todos los usuarios', 'Área', 'Por roles', 'Facultades', 'Proyecto']);
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
  });

  it('el administrador publica por roles: una audiencia ROLE por cada rol marcado', async () => {
    const created = { ...announcement, id: 'a-6', title: 'Aviso por roles', queuedDeliveries: 4 };
    const request = fakeRequest(async (_path, options) => (options?.method === 'POST' ? created : []));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
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
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
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
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
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
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={dean} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
    expect(audienceOptionNames()).toEqual(['Facultades', 'Proyecto']);
    expect(within(screen.getByLabelText('Tipo')).getByRole('option', { name: 'Notificación' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Facultad de Ingeniería')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/faculties?scope=dean');
    expect(request).not.toHaveBeenCalledWith('/api/faculties');
  });

  it('un usuario con varios roles elige primero el tipo de audiencia que le corresponde', async () => {
    const request = fakeRequest(async (path) => (path === '/api/areas?scope=managed' ? [{ id: 'ar-sem', name: 'Semilleros', description: null }] : []));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={{ ...dean, roles: ['DEAN', 'AREA_MANAGER'] }} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
    expect(audienceOptionNames()).toEqual(['Área', 'Por roles', 'Facultades', 'Proyecto']);
    expect(screen.getByLabelText('Destinatarios')).toHaveValue('AREA');
    expect(await screen.findByLabelText('Área destinataria')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/areas?scope=managed');
  });
});

/** Archivos ficticios para las pruebas de adjuntos (ADR 0015). */
function fileOf(name: string): File {
  return new File(['contenido de prueba'], name, { type: 'application/pdf' });
}

function bigFile(name: string): File {
  const file = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: 26 * 1024 * 1024 });
  return file;
}

const withFiles = {
  ...announcement,
  id: 'a-files',
  title: 'Noticia con anexos',
  attachments: [
    { id: 'att-1', fileName: 'convocatoria.pdf', format: 'PDF', mimeType: 'application/pdf', sizeBytes: 183042 },
    { id: 'att-2', fileName: 'anexo.docx', format: 'WORD', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 2048 },
  ],
};

describe('Filtro por tipo de novedad', () => {
  it('cada pestaña pide su tipo con ?kind= y «Todas» no envía kind', async () => {
    const request = fakeRequest(async () => []);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    expect(screen.getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'Noticias' }));
    expect(await screen.findByText('No hay noticias visibles')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/announcements?kind=NEWS&limit=20');

    await user.click(screen.getByRole('tab', { name: 'Notificaciones' }));
    expect(await screen.findByText('No hay notificaciones visibles')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/announcements?kind=NOTIFICATION&limit=20');

    await user.click(screen.getByRole('tab', { name: 'Todas' }));
    expect(await screen.findByText('No hay novedades visibles')).toBeInTheDocument();
    expect(request).toHaveBeenLastCalledWith('/api/announcements?limit=20');
  });

  it('las pestañas se recorren con flechas, llevan el foco y piden el tipo elegido', async () => {
    const request = fakeRequest(async () => []);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    screen.getByRole('tab', { name: 'Todas' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Noticias' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Noticias' })).toHaveFocus();
    expect(await screen.findByText('No hay noticias visibles')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/announcements?kind=NEWS&limit=20');
  });

  it('descarta la respuesta de una pestaña anterior si llega después', async () => {
    let resolveAll!: (value: unknown[]) => void;
    const request = fakeRequest((path) => {
      if (path === '/api/announcements?kind=NEWS&limit=20') return Promise.resolve([{ ...announcement, id: 'n-1', title: 'Noticia rápida' }]);
      return new Promise((resolve) => { resolveAll = resolve; });
    });
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await user.click(screen.getByRole('tab', { name: 'Noticias' }));
    expect(await screen.findByRole('heading', { name: 'Noticia rápida' })).toBeInTheDocument();

    resolveAll([{ ...announcement, id: 'c-1', kind: 'COMMUNICATION', title: 'Comunicado tardío' }]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('heading', { name: 'Comunicado tardío' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Noticia rápida' })).toBeInTheDocument();
  });
});

describe('Adjuntos en noticias', () => {
  it('una noticia con archivos se publica como multipart: JSON en data y un campo files por archivo', async () => {
    const created = { ...withFiles, queuedDeliveries: 2 };
    const request = fakeRequest(async (_path, options) => (options?.method === 'POST' ? created : []));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
    await user.type(screen.getByLabelText('Título'), 'Noticia con anexos');
    await user.type(screen.getByLabelText('Contenido'), 'Detalles de la convocatoria');
    await user.upload(screen.getByLabelText('Archivos adjuntos (opcional)'), [fileOf('convocatoria.pdf'), fileOf('anexo.pdf')]);
    expect(screen.getByRole('list', { name: 'Archivos elegidos' })).toHaveTextContent('convocatoria.pdf');
    await user.click(screen.getByRole('button', { name: 'Publicar novedad' }));

    const post = request.mock.calls.find(([, options]) => options?.method === 'POST');
    const body = post?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(JSON.parse(String(form.get('data')))).toEqual({
      kind: 'NEWS', title: 'Noticia con anexos', content: 'Detalles de la convocatoria', audiences: [{ type: 'ALL' }],
    });
    expect((form.getAll('files') as File[]).map((file) => file.name)).toEqual(['convocatoria.pdf', 'anexo.pdf']);
    expect(await screen.findByRole('status')).toHaveTextContent('Copias encoladas: 2');
  });

  it('sin archivos la noticia sigue enviándose como JSON', async () => {
    const request = fakeRequest(async (_path, options) => (options?.method === 'POST' ? { ...announcement, id: 'a-9' } : []));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
    await user.type(screen.getByLabelText('Título'), 'Sin anexos');
    await user.type(screen.getByLabelText('Contenido'), 'Texto');
    await user.click(screen.getByRole('button', { name: 'Publicar novedad' }));

    const post = request.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(post?.[1]?.body).not.toBeInstanceOf(FormData);
    expect(post?.[1]?.body).toEqual({ kind: 'NEWS', title: 'Sin anexos', content: 'Texto', audiences: [{ type: 'ALL' }] });
  });

  it('permite quitar un archivo elegido', async () => {
    const request = fakeRequest(async () => []);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
    await user.upload(screen.getByLabelText('Archivos adjuntos (opcional)'), [fileOf('uno.pdf'), fileOf('dos.pdf')]);
    await user.click(screen.getByRole('button', { name: 'Quitar uno.pdf' }));

    const list = screen.getByRole('list', { name: 'Archivos elegidos' });
    expect(list).not.toHaveTextContent('uno.pdf');
    expect(list).toHaveTextContent('dos.pdf');
  });

  it('rechaza más de 5 archivos o uno de más de 25 MB sin añadir ninguno', async () => {
    const request = fakeRequest(async () => []);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
    const input = screen.getByLabelText('Archivos adjuntos (opcional)');
    await user.upload(input, Array.from({ length: 6 }, (_, index) => fileOf(`archivo-${index}.pdf`)));
    expect(screen.getByRole('alert')).toHaveTextContent('Puedes adjuntar hasta 5 archivos por noticia.');
    expect(screen.queryByRole('list', { name: 'Archivos elegidos' })).not.toBeInTheDocument();

    await user.upload(input, bigFile('grande.pdf'));
    expect(screen.getByRole('alert')).toHaveTextContent('El archivo supera el tamaño máximo de 25 MB.');
    expect(screen.queryByRole('list', { name: 'Archivos elegidos' })).not.toBeInTheDocument();
  });

  it('con 5 archivos elegidos el selector se desactiva', async () => {
    const request = fakeRequest(async () => []);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
    await user.upload(screen.getByLabelText('Archivos adjuntos (opcional)'), Array.from({ length: 5 }, (_, index) => fileOf(`a-${index}.pdf`)));
    expect(screen.getByLabelText('Archivos adjuntos (opcional)')).toBeDisabled();
  });

  it('al cambiar a otro tipo descarta los archivos elegidos', async () => {
    const request = fakeRequest(async () => []);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    await user.click(screen.getByRole('button', { name: 'Nueva novedad' }));
    await user.upload(screen.getByLabelText('Archivos adjuntos (opcional)'), [fileOf('convocatoria.pdf')]);
    await user.selectOptions(screen.getByLabelText('Tipo'), 'COMMUNICATION');
    expect(screen.queryByLabelText('Archivos adjuntos (opcional)')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Tipo'), 'NEWS');
    expect(screen.queryByRole('list', { name: 'Archivos elegidos' })).not.toBeInTheDocument();
  });

  it('la tarjeta lista los adjuntos con descarga y vista previa solo para PDF e imágenes', async () => {
    const request = fakeRequest(async () => [withFiles]);
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    expect(await screen.findByRole('heading', { name: 'Noticia con anexos' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Archivos adjuntos' })).toBeInTheDocument();
    expect(screen.getByText('PDF · 179 KB')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Descargar convocatoria.pdf' })).toHaveAttribute(
      'href',
      '/api/announcements/a-files/attachments/att-1/download',
    );
    const view = screen.getByRole('link', { name: 'Ver convocatoria.pdf' });
    expect(view).toHaveAttribute('href', '/api/announcements/a-files/attachments/att-1/download?inline=true');
    expect(view).toHaveAttribute('target', '_blank');
    expect(view).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'Descargar anexo.docx' })).toHaveAttribute(
      'href',
      '/api/announcements/a-files/attachments/att-2/download',
    );
    expect(screen.queryByRole('link', { name: 'Ver anexo.docx' })).not.toBeInTheDocument();
  });
});

/** Novedades ficticias para la paginación; `publishedAt` decrece como en el servidor (más reciente primero). */
function feedPage(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const position = offset + index;
    return {
      ...announcement,
      id: `p-${position}`,
      title: `Novedad ${position}`,
      publishedAt: new Date(Date.UTC(2026, 10, 6, 15) - position * 60_000).toISOString(),
    };
  });
}

describe('Paginación de novedades', () => {
  it('pide páginas de 20 y «Cargar más» envía before con la fecha de la última novedad mostrada', async () => {
    const first = feedPage(20);
    const lastShown = first[19].publishedAt;
    const request = fakeRequest(async (path) => (path.includes('before=') ? feedPage(2, 20) : first));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    expect(await screen.findByRole('heading', { name: 'Novedad 19' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/api/announcements?limit=20');

    await user.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByRole('heading', { name: 'Novedad 21' })).toBeInTheDocument();
    expect(request).toHaveBeenLastCalledWith(`/api/announcements?limit=20&before=${encodeURIComponent(lastShown)}`);
    expect(screen.getByRole('heading', { name: 'Novedad 0' })).toBeInTheDocument();
    // La segunda página trae 2 novedades (menos de 20): no quedan más y el botón se oculta.
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('oculta «Cargar más» cuando la primera página llega con menos de 20 novedades', async () => {
    const request = fakeRequest(async () => feedPage(3));
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    expect(await screen.findByRole('heading', { name: 'Novedad 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('al cambiar de pestaña se reinicia la paginación y se pide la primera página del tipo', async () => {
    const request = fakeRequest(async (path) => (path === '/api/announcements?kind=NEWS&limit=20' ? feedPage(2) : feedPage(20)));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await user.click(await screen.findByRole('button', { name: 'Cargar más' }));
    await user.click(screen.getByRole('tab', { name: 'Noticias' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Novedad 19' })).not.toBeInTheDocument());
    expect(request).toHaveBeenLastCalledWith('/api/announcements?kind=NEWS&limit=20');
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });
});

describe('Publicar novedad: pliegue tras publicar', () => {
  it('abre el formulario con «Nueva novedad» y, al publicar, lo pliega, confirma el envío y recarga la pestaña', async () => {
    const created = { ...announcement, id: 'a-7', title: 'Nueva noticia', queuedDeliveries: 3 };
    const request = fakeRequest(async (_path, options) => (options?.method === 'POST' ? created : []));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="announcements" />);

    await screen.findByText('No hay novedades visibles');
    const toggle = screen.getByRole('button', { name: 'Nueva novedad' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.type(screen.getByLabelText('Título'), 'Nueva noticia');
    await user.type(screen.getByLabelText('Contenido'), 'Cuerpo de la noticia');
    await user.click(screen.getByRole('button', { name: 'Publicar novedad' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Novedad publicada. Copias encoladas: 3.');
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva novedad' })).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => {
      const reloads = request.mock.calls.filter(([path, options]) => path === '/api/announcements?limit=20' && options === undefined);
      expect(reloads).toHaveLength(2);
    });
  });
});
