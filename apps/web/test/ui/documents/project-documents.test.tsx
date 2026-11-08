import { StrictMode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectDocuments } from '../../../src/features/documents/index.ts';
import { ApiError } from '../../../src/lib/api';
import { admin, deferred, fakeRequest, student, uuid } from '../academic/fixtures';

/** Datos ficticios: no son personas ni archivos reales. */
const projectId = uuid(10);
const otherProjectId = uuid(11);
const tutorId = uuid(30);
const pdfId = uuid(70);
const wordId = uuid(71);

const makeDocument = (id: string, fileName: string, format: string, uploaderId: string, uploader: string, sizeBytes = 183042) => ({
  id, projectId, fileName, format, mimeType: 'application/octet-stream', sizeBytes,
  uploadedBy: { id: uploaderId, fullName: uploader }, createdAt: '2026-11-06T15:00:00.000Z',
});

const pdf = makeDocument(pdfId, 'informe-avance.pdf', 'PDF', tutorId, 'Tatiana Tutora Demo');
const word = makeDocument(wordId, 'anexo.docx', 'WORD', student.id, 'Estudiante de Ejemplo', 2048);

const listOf = (...items: unknown[]) => fakeRequest({ [`GET /api/projects/${projectId}/documents`]: () => items });

function renderDocuments(request: ReturnType<typeof fakeRequest>, overrides: Partial<{ user: typeof admin; canDeleteAny: boolean; projectId: string }> = {}) {
  const props = { user: admin, canDeleteAny: false, projectId, ...overrides };
  return render(<ProjectDocuments request={request} user={props.user} projectId={props.projectId} canDeleteAny={props.canDeleteAny} />);
}

/** Archivo de prueba; `size` permite simular un archivo mayor sin reservar memoria real. */
function fileOf(name: string, type: string, size?: number) {
  const file = new File(['contenido de prueba'], name, { type });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('ProjectDocuments: lista', () => {
  it('muestra nombre, formato, tamaño y autor de cada documento', async () => {
    renderDocuments(listOf(pdf, word));

    const row = (await screen.findByText('informe-avance.pdf')).closest('li') as HTMLElement;
    expect(within(row).getByText(/PDF · 179 KB · Subido por Tatiana Tutora Demo/)).toBeInTheDocument();
    const wordRow = screen.getByText('anexo.docx').closest('li') as HTMLElement;
    expect(within(wordRow).getByText(/Word · 2,0 KB · Subido por Estudiante de Ejemplo/)).toBeInTheDocument();
    expect(screen.getByText('2 documentos')).toBeInTheDocument();
  });

  it('enlaza la descarga del backend y ofrece «Ver» en línea solo para PDF e imágenes', async () => {
    renderDocuments(listOf(pdf, word));
    await screen.findByText('informe-avance.pdf');

    expect(screen.getByRole('link', { name: 'Descargar informe-avance.pdf' })).toHaveAttribute('href', `/api/documents/${pdfId}/download`);
    expect(screen.getByRole('link', { name: 'Descargar anexo.docx' })).toHaveAttribute('href', `/api/documents/${wordId}/download`);

    const view = screen.getByRole('link', { name: 'Ver informe-avance.pdf' });
    expect(view).toHaveAttribute('href', `/api/documents/${pdfId}/download?inline=true`);
    expect(view).toHaveAttribute('target', '_blank');
    expect(view).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('link', { name: 'Ver anexo.docx' })).not.toBeInTheDocument();
  });

  it('muestra el estado vacío cuando el proyecto no tiene documentos', async () => {
    renderDocuments(listOf());
    expect(await screen.findByText('Sin documentos')).toBeInTheDocument();
  });

  it('muestra el estado de carga mientras llega la lista', async () => {
    const pending = deferred<unknown[]>();
    renderDocuments(fakeRequest({ [`GET /api/projects/${projectId}/documents`]: () => pending.promise }));
    expect(screen.getByText('Cargando documentos…')).toBeInTheDocument();
    pending.resolve([pdf]);
    expect(await screen.findByText('informe-avance.pdf')).toBeInTheDocument();
  });

  it('muestra el error del backend y permite reintentar', async () => {
    let fail = true;
    renderDocuments(fakeRequest({
      [`GET /api/projects/${projectId}/documents`]: () => { if (fail) throw new ApiError(503); return [pdf]; },
    }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible en este momento.');

    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('informe-avance.pdf')).toBeInTheDocument();
  });

  it('carga una sola vez de forma estable bajo StrictMode', async () => {
    const request = listOf(pdf);
    render(<StrictMode><ProjectDocuments request={request} user={admin} projectId={projectId} canDeleteAny={false} /></StrictMode>);
    expect(await screen.findByText('informe-avance.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Cargando documentos…')).not.toBeInTheDocument();
  });

  it('descarta la respuesta tardía del proyecto anterior al cambiar de proyecto', async () => {
    const late = deferred<unknown[]>();
    const other = makeDocument(uuid(80), 'datos-nuevos.xlsx', 'EXCEL', tutorId, 'Tatiana Tutora Demo');
    const request = fakeRequest({
      [`GET /api/projects/${projectId}/documents`]: () => late.promise,
      [`GET /api/projects/${otherProjectId}/documents`]: () => [other],
    });
    const { rerender } = renderDocuments(request);
    rerender(<ProjectDocuments request={request} user={admin} projectId={otherProjectId} canDeleteAny={false} />);

    expect(await screen.findByText('datos-nuevos.xlsx')).toBeInTheDocument();
    late.resolve([pdf]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('informe-avance.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('datos-nuevos.xlsx')).toBeInTheDocument();
  });
});

describe('ProjectDocuments: subida', () => {
  it('envía el archivo como FormData en el campo file y refresca la lista', async () => {
    let uploaded = false;
    const created = makeDocument(uuid(72), 'acta.pdf', 'PDF', admin.id, 'Admin');
    const request = fakeRequest({
      [`GET /api/projects/${projectId}/documents`]: () => (uploaded ? [created] : []),
      [`POST /api/projects/${projectId}/documents`]: () => { uploaded = true; return created; },
    });
    renderDocuments(request);
    await screen.findByText('Sin documentos');

    const file = fileOf('acta.pdf', 'application/pdf');
    await userEvent.upload(screen.getByLabelText('Archivo a subir'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Subir documento' }));

    await waitFor(() => expect(request.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true));
    const post = request.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(post?.[0]).toBe(`/api/projects/${projectId}/documents`);
    const body = post?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect(await screen.findByText('acta.pdf')).toBeInTheDocument();
    expect(screen.getByLabelText('Archivo a subir')).toHaveValue('');
  });

  it('rechaza en cliente una extensión no admitida sin llamar al servidor', async () => {
    const request = listOf();
    renderDocuments(request);
    await screen.findByText('Sin documentos');
    const user = userEvent.setup({ applyAccept: false });

    await user.upload(screen.getByLabelText('Archivo a subir'), fileOf('programa.exe', 'application/x-msdownload'));
    await user.click(screen.getByRole('button', { name: 'Subir documento' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Formato no admitido');
    expect(request.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it('rechaza en cliente un archivo mayor de 25 MB sin llamar al servidor', async () => {
    const request = listOf();
    renderDocuments(request);
    await screen.findByText('Sin documentos');
    const user = userEvent.setup({ applyAccept: false });

    await user.upload(screen.getByLabelText('Archivo a subir'), fileOf('enorme.pdf', 'application/pdf', 26 * 1024 * 1024));
    await user.click(screen.getByRole('button', { name: 'Subir documento' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo supera el tamaño máximo de 25 MB.');
    expect(request.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it('muestra el 413 del backend tal cual', async () => {
    const request = fakeRequest({
      [`GET /api/projects/${projectId}/documents`]: () => [],
      [`POST /api/projects/${projectId}/documents`]: () => {
        throw new ApiError(413, { message: 'El archivo supera el tamaño máximo de 25 MB.' });
      },
    });
    renderDocuments(request);
    await screen.findByText('Sin documentos');

    await userEvent.upload(screen.getByLabelText('Archivo a subir'), fileOf('limite.pdf', 'application/pdf'));
    await userEvent.click(screen.getByRole('button', { name: 'Subir documento' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo supera el tamaño máximo de 25 MB.');
  });

  it('muestra cada error de validación 400 del backend en la lista', async () => {
    const request = fakeRequest({
      [`GET /api/projects/${projectId}/documents`]: () => [],
      [`POST /api/projects/${projectId}/documents`]: () => {
        throw new ApiError(400, {
          message: 'Datos inválidos.',
          errors: ['El contenido del archivo no corresponde a su tipo.'],
        });
      },
    });
    renderDocuments(request);
    await screen.findByText('Sin documentos');

    await userEvent.upload(screen.getByLabelText('Archivo a subir'), fileOf('falso.pdf', 'application/pdf'));
    await userEvent.click(screen.getByRole('button', { name: 'Subir documento' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Datos inválidos.');
    expect(within(alert).getByText('El contenido del archivo no corresponde a su tipo.')).toBeInTheDocument();
  });

  it('muestra el 503 cuando el almacenamiento no está disponible', async () => {
    const request = fakeRequest({
      [`GET /api/projects/${projectId}/documents`]: () => [],
      [`POST /api/projects/${projectId}/documents`]: () => {
        throw new ApiError(503, { message: 'El almacenamiento de documentos no está disponible.' });
      },
    });
    renderDocuments(request);
    await screen.findByText('Sin documentos');
    await userEvent.upload(screen.getByLabelText('Archivo a subir'), fileOf('x.png', 'image/png'));
    await userEvent.click(screen.getByRole('button', { name: 'Subir documento' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible en este momento.');
  });

  it('el botón de subir sigue deshabilitado sin archivo elegido', async () => {
    renderDocuments(listOf());
    await screen.findByText('Sin documentos');
    expect(screen.getByRole('button', { name: 'Subir documento' })).toBeDisabled();
  });
});

describe('ProjectDocuments: eliminación', () => {
  it('pide confirmación y solo elimina si el usuario acepta', async () => {
    const request = fakeRequest({
      [`GET /api/projects/${projectId}/documents`]: () => [pdf],
      [`DELETE /api/documents/${pdfId}`]: () => undefined,
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderDocuments(request, { canDeleteAny: true });
    await screen.findByText('informe-avance.pdf');

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar informe-avance.pdf' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar informe-avance.pdf' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/documents/${pdfId}`, { method: 'DELETE' }));
  });

  it('muestra el 409 del backend cuando el documento está adjunto a una actividad', async () => {
    const request = fakeRequest({
      [`GET /api/projects/${projectId}/documents`]: () => [pdf],
      [`DELETE /api/documents/${pdfId}`]: () => {
        throw new ApiError(409, { message: 'El documento está adjunto a actividades; quítalo de ellas primero.' });
      },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderDocuments(request, { canDeleteAny: true });
    await screen.findByText('informe-avance.pdf');

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar informe-avance.pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El documento está adjunto a actividades; quítalo de ellas primero.');
  });

  it('un tutor o gestor (canDeleteAny) ve Eliminar en documentos ajenos', async () => {
    renderDocuments(listOf(pdf), { canDeleteAny: true, user: admin });
    expect(await screen.findByRole('button', { name: 'Eliminar informe-avance.pdf' })).toBeInTheDocument();
  });

  it('sin canDeleteAny, el usuario solo elimina sus propios documentos', async () => {
    renderDocuments(listOf(pdf, word), { canDeleteAny: false, user: student });
    await screen.findByText('informe-avance.pdf');
    expect(screen.queryByRole('button', { name: 'Eliminar informe-avance.pdf' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar anexo.docx' })).toBeInTheDocument();
  });
});
