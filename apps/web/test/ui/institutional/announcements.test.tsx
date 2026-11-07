import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
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
});
