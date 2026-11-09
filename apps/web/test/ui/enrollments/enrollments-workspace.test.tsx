import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnrollmentsWorkspace, canManageEnrollments } from '../../../src/features/enrollments';
import { ApiError } from '../../../src/lib/api';
import type { ApiRequest } from '../../../src/types/api';

const admin = { id: 'u-1', email: 'admin@example.test', fullName: 'Admin', roles: ['ADMIN'], mustChangePassword: false };
const areaManager = { id: 'u-2', email: 'encargada@example.test', fullName: 'Encargada', roles: ['AREA_MANAGER'], mustChangePassword: false };

const options = {
  areas: [
    { id: 'a-1', name: 'Área de Sistemas', sourceConfigured: true, source: { spreadsheetId: 'sheet-1', range: 'Respuestas!A:I', areaType: 'SEEDLING' } },
    { id: 'a-2', name: 'Área de Software', sourceConfigured: false, source: null },
  ],
  faculties: [
    { value: 'SYSTEMS_ENGINEERING', label: 'Ingeniería de Sistemas' },
    { value: 'SOFTWARE_ENGINEERING', label: 'Ingeniería de Software' },
  ],
  areaTypes: [
    { value: 'SEEDLING', label: 'Semillero' },
    { value: 'DEGREE_PROJECT', label: 'Proyecto de grado' },
  ],
  documentTypes: [
    { value: 'CC', label: 'Cédula de ciudadanía' },
    { value: 'TI', label: 'Tarjeta de identidad' },
  ],
  statuses: [
    { value: 'PENDING', label: 'Pendiente' },
    { value: 'ACCEPTED', label: 'Aceptada' },
    { value: 'REJECTED', label: 'Rechazada' },
  ],
};

const pending = {
  id: 'e-1', firstNames: 'Ana María', lastNames: 'Pérez Gómez', email: 'ana@example.test',
  documentType: 'TI', documentNumber: '00123', faculty: 'SYSTEMS_ENGINEERING', areaId: 'a-1',
  areaType: 'SEEDLING', period: '2026-2', status: 'PENDING', createdAt: '2026-11-07T15:00:00.000Z', rejectedAt: null,
};
const rejected = { ...pending, id: 'e-2', firstNames: 'Luis', lastNames: 'Ríos', email: 'luis@example.test', documentType: 'CC', documentNumber: '00456', faculty: 'SOFTWARE_ENGINEERING', period: '2025-2', status: 'REJECTED', rejectedAt: '2026-11-07T16:00:00.000Z' };

const preview = {
  previewToken: 'tok-1',
  rows: [{
    sourceRow: 2, firstNames: 'Ana María', lastNames: 'Pérez Gómez', email: 'ana@example.test',
    documentType: 'TI', documentNumber: '00123', faculty: 'SYSTEMS_ENGINEERING', areaType: 'SEEDLING',
    period: '2026-2', consent: true, errors: [], duplicate: false,
  }, {
    sourceRow: 3, firstNames: 'Luis', lastNames: 'Ríos', email: 'luis@example.test',
    documentType: 'CC', documentNumber: '456', faculty: 'SOFTWARE_ENGINEERING', areaType: 'SEEDLING',
    period: '2026-2', consent: false, errors: ['Falta la autorización de tratamiento de datos'], duplicate: true,
  }],
  summary: { read: 2, valid: 1, invalid: 1, duplicates: 1 },
};

function fake(routes: Record<string, unknown>) {
  return vi.fn<ApiRequest>(async (path, payload) => {
    const key = `${payload?.method ?? 'GET'} ${path}`;
    if (!(key in routes)) throw new ApiError(404);
    const value = routes[key];
    if (value instanceof Error) throw value;
    return value;
  });
}

const baseRoutes = {
  'GET /api/enrollments/options': options,
  'GET /api/enrollments': { items: [pending, rejected], total: 2 },
};
const mount = (request: ApiRequest, user = admin) =>
  render(<StrictMode><EnrollmentsWorkspace user={user} request={request} /></StrictMode>);

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('canManageEnrollments (visibilidad del menú Inscripciones)', () => {
  it('es visible para ADMIN', () => { expect(canManageEnrollments(['ADMIN'])).toBe(true); });
  it('es visible para AREA_MANAGER', () => { expect(canManageEnrollments(['AREA_MANAGER'])).toBe(true); });
  it('no es visible para DEAN', () => { expect(canManageEnrollments(['DEAN'])).toBe(false); });
  it('no es visible para TUTOR', () => { expect(canManageEnrollments(['TUTOR'])).toBe(false); });
  it('no es visible para STUDENT', () => { expect(canManageEnrollments(['STUDENT'])).toBe(false); });
});

describe('EnrollmentsWorkspace', () => {
  it('se muestra como un panel Inscripciones con los datos de la solicitud', async () => {
    mount(fake(baseRoutes), areaManager);
    expect(await screen.findByRole('heading', { name: 'Inscripciones' })).toBeInTheDocument();
    expect(screen.getByText('Ana María')).toBeInTheDocument();
    expect(screen.getByText('ana@example.test')).toBeInTheDocument();
    expect(screen.getByText('00123')).toBeInTheDocument();
    expect(screen.getByText('Tarjeta de identidad')).toBeInTheDocument();
    expect(screen.getAllByText('Ingeniería de Sistemas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Área de Sistemas').length).toBeGreaterThan(0);
    expect(screen.getByText('2026-2')).toBeInTheDocument();
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rechazada').length).toBeGreaterThan(0);
  });

  it('muestra la carga y el estado vacío', async () => {
    mount(fake({ ...baseRoutes, 'GET /api/enrollments': { items: [], total: 0 } }));
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(await screen.findByText('No hay inscripciones')).toBeInTheDocument();
  });

  it('muestra el error de la lista sin datos', async () => {
    mount(fake({ ...baseRoutes, 'GET /api/enrollments': new ApiError(500) }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El servicio no está disponible');
    expect(screen.queryByText('Ana María')).not.toBeInTheDocument();
  });

  it('no expone controles técnicos de fuente ni selección en el panel', async () => {
    mount(fake(baseRoutes));
    await screen.findByText('Ana María');
    expect(screen.queryByText('Identificador de la hoja')).not.toBeInTheDocument();
    expect(screen.queryByText('Rango')).not.toBeInTheDocument();
    expect(screen.queryByText(/Guardar fuente/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /seleccionadas/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Configura la fuente de esta área/)).not.toBeInTheDocument();
  });

  it('muestra la ayuda corta cuando la fuente no está configurada', async () => {
    mount(fake(baseRoutes));
    const area = await screen.findByLabelText('Área de la fuente');
    await userEvent.selectOptions(area, 'a-2');
    expect(screen.getByText('La fuente aún no está configurada.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar inscripciones' })).toBeDisabled();
  });

  it('exige confirmación explícita antes de importar el token firmado', async () => {
    const request = fake({ ...baseRoutes, 'POST /api/enrollments/preview': preview, 'POST /api/enrollments/import': { imported: 1, duplicates: 0, invalid: 1 } });
    mount(request, areaManager);
    const area = await screen.findByLabelText('Área de la fuente');
    await userEvent.selectOptions(area, 'a-1');
    await userEvent.click(screen.getByRole('button', { name: 'Importar inscripciones' }));
    expect(await screen.findByText('Falta la autorización de tratamiento de datos')).toBeInTheDocument();
    expect(screen.getByText(/Leídas: 2/)).toBeInTheDocument();
    expect(screen.getAllByText('00123').length).toBeGreaterThan(0);
    const confirm = screen.getByRole('button', { name: 'Confirmar importación' });
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByLabelText(/Revisé la vista previa/));
    await userEvent.click(confirm);
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/enrollments/import', { method: 'POST', body: { previewToken: 'tok-1' } }));
    expect(await screen.findByText(/Se importó 1 solicitud/)).toBeInTheDocument();
  });

  it('al cambiar de área se descarta la vista previa anterior', async () => {
    const request = fake({ ...baseRoutes, 'POST /api/enrollments/preview': preview });
    mount(request);
    const area = await screen.findByLabelText('Área de la fuente');
    await userEvent.selectOptions(area, 'a-1');
    await userEvent.click(screen.getByRole('button', { name: 'Importar inscripciones' }));
    expect(await screen.findByText('Falta la autorización de tratamiento de datos')).toBeInTheDocument();
    await userEvent.selectOptions(area, 'a-2');
    await waitFor(() => expect(screen.queryByText('Falta la autorización de tratamiento de datos')).not.toBeInTheDocument());
  });

  it('renderiza la vista previa mixta con guión para documento y facultad nulos', async () => {
    const mixedPreview = {
      previewToken: 'tok-2',
      rows: [
        { sourceRow: 2, firstNames: 'Ana María', lastNames: 'Pérez Gómez', email: 'ana@example.test', documentType: 'TI', documentNumber: '00123', faculty: 'SYSTEMS_ENGINEERING', areaType: 'SEEDLING', period: '2026-2', consent: true, errors: [], duplicate: false },
        { sourceRow: 3, firstNames: 'Luis', lastNames: 'Ríos', email: 'invitado@example.test', documentType: null, documentNumber: '456', faculty: null, areaType: 'SEEDLING', period: '2026-2', consent: false, errors: ['Área no válida'], duplicate: false },
      ],
      summary: { read: 2, valid: 1, invalid: 1, duplicates: 0 },
    };
    const request = fake({
      'GET /api/enrollments/options': options,
      'GET /api/enrollments': { items: [], total: 0 },
      'POST /api/enrollments/preview': mixedPreview,
    });
    mount(request, areaManager);
    const area = await screen.findByLabelText('Área de la fuente');
    await userEvent.selectOptions(area, 'a-1');
    await userEvent.click(screen.getByRole('button', { name: 'Importar inscripciones' }));
    await waitFor(() => expect(screen.getByText(/Leídas: 2/)).toBeInTheDocument());
    // fila válida muestra la etiqueta real y el correo
    expect(screen.getByText('ana@example.test')).toBeInTheDocument();
    expect(screen.getByText('Tarjeta de identidad')).toBeInTheDocument();
    // fila inválida muestra su correo y guión para documento y facultad nulos
    expect(screen.getByText('invitado@example.test')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('acepta una solicitud con el cuerpo del contrato', async () => {
    const request = fake({ ...baseRoutes, 'PATCH /api/enrollments/e-1/status': { ...pending, status: 'ACCEPTED' } });
    mount(request);
    await screen.findByText('Ana María');
    const row = screen.getByText('Ana María').closest('li') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/enrollments/e-1/status', { method: 'PATCH', body: { status: 'ACCEPTED' } }));
  });

  it('rechaza una solicitud con el cuerpo del contrato', async () => {
    const request = fake({ ...baseRoutes, 'PATCH /api/enrollments/e-1/status': { ...pending, status: 'REJECTED' } });
    mount(request);
    await screen.findByText('Ana María');
    const row = screen.getByText('Ana María').closest('li') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/enrollments/e-1/status', { method: 'PATCH', body: { status: 'REJECTED' } }));
  });

  it('solo ofrece eliminar a las rechazadas y pide confirmación local', async () => {
    const request = fake({ ...baseRoutes, 'DELETE /api/enrollments/e-2': undefined });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount(request);
    await screen.findByText('Ana María');
    const pendingRow = screen.getByText('Ana María').closest('li') as HTMLElement;
    const rejectedRow = screen.getByText('Luis').closest('li') as HTMLElement;
    expect(within(pendingRow).queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    await userEvent.click(within(rejectedRow).getByRole('button', { name: 'Eliminar' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('no borra la respuesta en Google'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/enrollments/e-2', { method: 'DELETE' }));
    await waitFor(() => expect(request.mock.calls.filter(([path]) => path === '/api/enrollments').length).toBeGreaterThan(1));
  });

  it('aplica filtros con codificación segura y exporta el xlsx con los mismos filtros', async () => {
    const request = fake(baseRoutes);
    const blob = new Blob(['PK'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fetcher = vi.fn(async () => new Response(blob, { status: 200, headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } }));
    vi.stubGlobal('fetch', fetcher);
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    mount(request);
    await screen.findByText('Ana María');
    await userEvent.type(screen.getByLabelText('Buscar'), 'ana pérez');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'PENDING');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(request.mock.calls.some(([path]) => typeof path === 'string' && path.startsWith('/api/enrollments?') && path.includes('status=PENDING&search=ana+p%C3%A9rez'))).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/api/enrollments/export.xlsx?status=PENDING&search=ana+p%C3%A9rez'), expect.anything()));
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
  });

  it('muestra el error de exportación sin mostrar el cuerpo como archivo', async () => {
    mount(fake(baseRoutes));
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: 'Sesión expirada' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    await screen.findByText('Ana María');
    await userEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sesión expirada');
  });
});
