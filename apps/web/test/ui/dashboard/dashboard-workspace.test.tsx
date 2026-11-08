import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardWorkspace } from '../../../src/features/dashboard';
import { ApiError } from '../../../src/lib/api';
import type { ApiRequest } from '../../../src/types/api';

const zeros = { PENDING: 0, IN_PROGRESS: 0, DONE: 0, CANCELLED: 0 };
const project = (over: Record<string, unknown> = {}) => ({ id: 'p-1', title: 'Proyecto demo', status: 'ACTIVE', projectRole: null, boards: 2, activities: 5, activitiesDone: 1, ...over });
const section = (role: string, over: Record<string, unknown> = {}) => ({
  role,
  scope: { areas: [], faculties: [] },
  projects: { total: 1, byStatus: { ACTIVE: 1, FINISHED: 0, CANCELLED: 0 }, items: [project()] },
  boards: { total: 2, byProgress: { ...zeros, PENDING: 2 }, overdue: 0 },
  activities: { total: 5, byProgress: { ...zeros, PENDING: 3, DONE: 2 }, pendingApproval: 0 },
  ...over,
});
const meetings = [{ id: 'm-1', reason: 'Revisión de avances', startsAt: '2026-11-20T20:00:00.000Z', status: 'SCHEDULED', joinUrl: null, project: { id: 'p-1', title: 'Proyecto demo' } }];
const news = [{ id: 'n-1', kind: 'NEWS', title: 'Convocatoria abierta', publishedAt: '2026-11-06T10:00:00.000Z', author: { id: 'u-1', fullName: 'Admin' } }];

function fake(sections: unknown[] | Error, extra: { meetings?: unknown; news?: unknown } = {}) {
  return vi.fn<ApiRequest>(async (path) => {
    if (path === '/api/dashboard') {
      if (sections instanceof Error) throw sections;
      return { generatedAt: '2026-11-07T15:00:00.000Z', sections };
    }
    if (path.startsWith('/api/meetings')) return extra.meetings ?? meetings;
    if (path.startsWith('/api/announcements')) return extra.news ?? news;
    throw new ApiError(404);
  });
}
const user = (roles: string[]) => ({ id: 'u-1', email: 'x@example.test', fullName: 'Persona', roles, mustChangePassword: false });
const mount = (roles: string[], request: ApiRequest, onNavigate = vi.fn()) =>
  render(<StrictMode><DashboardWorkspace user={user(roles)} request={request} onNavigate={onNavigate} /></StrictMode>);

describe('DashboardWorkspace', () => {
  it('muestra la carga y luego reuniones y novedades comunes', async () => {
    mount(['STUDENT'], fake([section('STUDENT')]));
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(await screen.findByText('Revisión de avances')).toBeInTheDocument();
    expect(await screen.findByText('Convocatoria abierta')).toBeInTheDocument();
  });

  it('administrador: visión institucional y accesos', async () => {
    const onNavigate = vi.fn();
    mount(['ADMIN'], fake([section('ADMIN', { boards: { total: 2, byProgress: zeros, overdue: 3 }, activities: { total: 5, byProgress: zeros, pendingApproval: 4 } })]), onNavigate);
    expect(await screen.findByRole('heading', { name: 'Toda la institución' })).toBeInTheDocument();
    expect(screen.getByText('Tableros vencidos').previousSibling).toHaveTextContent('3');
    expect(screen.getByText('Actividades por aprobar').previousSibling).toHaveTextContent('4');
    expect(screen.getByText('Proyectos por estado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Crear usuarios' }));
    await userEvent.click(screen.getByRole('button', { name: 'Estado de WhatsApp' }));
    expect(onNavigate.mock.calls).toEqual([['users'], ['whatsapp']]);
  });

  it('encargado de área: lista sus áreas', async () => {
    const onNavigate = vi.fn();
    mount(['AREA_MANAGER'], fake([section('AREA_MANAGER', { scope: { areas: [{ id: 'a', name: 'Investigación' }], faculties: [] } })]), onNavigate);
    expect(await screen.findByRole('heading', { name: 'Mis áreas' })).toBeInTheDocument();
    expect(screen.getByText('Investigación')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Ver novedades' })[0]);
    expect(onNavigate).toHaveBeenCalledWith('announcements');
  });

  it('decano: facultades y avance de proyectos en texto', async () => {
    mount(['DEAN'], fake([section('DEAN', { scope: { areas: [], faculties: [{ id: 'f', name: 'Ingeniería' }] } })]));
    expect(await screen.findByText('Ingeniería')).toBeInTheDocument();
    expect(screen.getByText(/Avance: 1 de 5/)).toBeInTheDocument();
  });

  it('tutor: destaca aprobaciones pendientes y tableros vencidos', async () => {
    const onNavigate = vi.fn();
    mount(['TUTOR'], fake([section('TUTOR', { boards: { total: 2, byProgress: zeros, overdue: 2 }, activities: { total: 5, byProgress: zeros, pendingApproval: 1 } })]), onNavigate);
    expect(await screen.findByText('actividad pendiente de aprobación')).toBeInTheDocument();
    expect(screen.getByText('tableros vencidos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver proyectos' }));
    expect(onNavigate).toHaveBeenCalledWith('academic');
  });

  it('estudiante: marca los proyectos donde es líder', async () => {
    mount(['STUDENT'], fake([section('STUDENT', { projects: { total: 2, byStatus: { ACTIVE: 2, FINISHED: 0, CANCELLED: 0 }, items: [project({ projectRole: 'STUDENT_LEADER' }), project({ id: 'p-2', title: 'Otro', projectRole: 'STUDENT' })] } })]));
    expect(await screen.findByText('Líder del proyecto')).toBeInTheDocument();
    expect(screen.getAllByText('Líder del proyecto')).toHaveLength(1);
    expect(screen.getByText(/Hechas: 2 de 5/)).toBeInTheDocument();
  });

  it('decano y tutor ven dos bloques en el orden del servidor', async () => {
    mount(['DEAN', 'TUTOR'], fake([section('DEAN'), section('TUTOR')]));
    await screen.findByRole('heading', { name: 'Mis facultades' });
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf('Mis facultades')).toBeLessThan(headings.indexOf('Mis proyectos como tutor'));
    expect(headings.indexOf('Mis proyectos como tutor')).toBeGreaterThan(-1);
  });

  it('muestra estado vacío sin secciones, sin reuniones ni novedades', async () => {
    mount([], fake([], { meetings: [], news: [] }));
    expect(await screen.findByText('Sin información para tu panel')).toBeInTheDocument();
    expect(await screen.findByText('Sin reuniones próximas')).toBeInTheDocument();
    expect(await screen.findByText('Sin novedades')).toBeInTheDocument();
  });

  it('muestra error del panel sin ocultar el resto', async () => {
    mount(['TUTOR'], fake(new ApiError(500)));
    expect(await screen.findByText('El servicio no está disponible en este momento.')).toBeInTheDocument();
    expect(await screen.findByText('Revisión de avances')).toBeInTheDocument();
  });

  it('los accesos de reuniones y novedades navegan', async () => {
    const onNavigate = vi.fn();
    mount(['STUDENT'], fake([section('STUDENT')]), onNavigate);
    const meetingsCard = (await screen.findByRole('heading', { name: 'Próximas reuniones' })).closest('section')!;
    await userEvent.click(within(meetingsCard).getByRole('button', { name: 'Ver reuniones' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ver todas las novedades' }));
    expect(onNavigate.mock.calls).toEqual([['meetings'], ['announcements']]);
  });
});
