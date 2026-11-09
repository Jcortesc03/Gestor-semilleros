import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AcademicWorkspace } from '../../../src/features/academic';
import type { CurrentUser } from '../../../src/types/auth.ts';
import { admin, fakeRequest, makeActivity, makeBoard, makeMember, makeProject, pageOf, uuid } from './fixtures';

/** Datos ficticios: no representan personas ni archivos reales. */
const tutor: CurrentUser = { id: uuid(30), email: 'tutor@example.test', fullName: 'Tutor de Ejemplo', roles: ['TUTOR'], mustChangePassword: false };
const p1 = makeProject(10, 'Semillero de robótica');
const b1 = makeBoard(40, p1.id, 'Entrega del protocolo');
const activity = makeActivity(50, b1.id, 'Redactar la introducción');
const members = [makeMember(30, 'Tutor de Ejemplo', 'TUTOR'), makeMember(31, 'Estudiante de Ejemplo', 'STUDENT')];
const documentId = uuid(70);
const protocol = {
  id: documentId, projectId: p1.id, fileName: 'protocolo.pdf', format: 'PDF', mimeType: 'application/pdf',
  sizeBytes: 183042, uploadedBy: { id: uuid(30), fullName: 'Tutor de Ejemplo' }, createdAt: '2026-11-06T15:00:00.000Z',
};

function workspaceRoutes(state: { activities: unknown[]; documents: unknown[] }) {
  return {
    'GET /api/projects': () => pageOf([p1]),
    [`GET /api/projects/${p1.id}/boards`]: () => [b1],
    [`GET /api/projects/${p1.id}/members`]: () => members,
    [`GET /api/projects/${p1.id}/documents`]: () => pageOf(state.documents),
    [`GET /api/projects/${p1.id}/documents?pageSize=100`]: () => pageOf(state.documents, 1, 100),
    [`GET /api/boards/${b1.id}/activities`]: () => state.activities,
    'GET /api/areas': () => [{ id: uuid(1), name: 'Área de prueba', description: null }],
    'GET /api/faculties': () => [{ id: uuid(2), name: 'Ingeniería' }],
  };
}

describe('Documentos en el detalle del proyecto', () => {
  it('muestra la sección Documentos y, para el tutor, permite eliminar cualquier documento', async () => {
    const request = fakeRequest(workspaceRoutes({ activities: [activity], documents: [protocol] }));
    render(<AcademicWorkspace user={tutor} request={request} />);

    expect(await screen.findByRole('heading', { name: 'Documentos' })).toBeInTheDocument();
    expect(await screen.findByText('protocolo.pdf', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eliminar protocolo.pdf' })).toBeInTheDocument();
  });

  it('un estudiante sin autoría no ve eliminar en documentos ajenos', async () => {
    const student: CurrentUser = { id: uuid(31), email: 'est@example.test', fullName: 'Estudiante de Ejemplo', roles: ['STUDENT'], mustChangePassword: false };
    const request = fakeRequest(workspaceRoutes({ activities: [activity], documents: [protocol] }));
    render(<AcademicWorkspace user={student} request={request} />);

    expect(await screen.findByText('protocolo.pdf', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar protocolo.pdf' })).not.toBeInTheDocument();
  });
});

describe('Adjuntos de actividades', () => {
  it('adjunta un documento elegido del proyecto con kind DOCUMENT y muestra su nombre y descarga', async () => {
    const state: { activities: unknown[]; documents: unknown[] } = { activities: [activity], documents: [protocol] };
    const attached = {
      ...activity,
      attachments: [{
        id: uuid(90), kind: 'DOCUMENT', url: null, documentId, document: { id: documentId, fileName: 'protocolo.pdf', format: 'PDF', sizeBytes: 183042 },
        createdBy: { id: uuid(30), fullName: 'Tutor de Ejemplo' }, createdAt: '2026-11-07T10:00:00.000Z',
      }],
    };
    const request = fakeRequest({
      ...workspaceRoutes(state),
      [`POST /api/activities/${activity.id}/attachments`]: () => {
        state.activities = [attached];
        return attached;
      },
    });
    render(<AcademicWorkspace user={admin} request={request} />);

    const card = (await screen.findByRole('heading', { name: 'Redactar la introducción' })).closest('article') as HTMLElement;
    const select = await within(card).findByLabelText(/Documento del proyecto para Redactar la introducción/);
    expect(within(select).getByRole('option', { name: 'protocolo.pdf' })).toBeInTheDocument();
    await userEvent.selectOptions(select, documentId);
    await userEvent.click(within(card).getByRole('button', { name: 'Adjuntar documento' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/activities/${activity.id}/attachments`, {
      method: 'POST', body: { kind: 'DOCUMENT', documentId },
    }));
    const link = await within(card).findByRole('link', { name: 'Descargar protocolo.pdf' });
    expect(link).toHaveAttribute('href', `/api/documents/${documentId}/download`);
    expect(within(card).getByText('protocolo.pdf', { selector: 'span' })).toBeInTheDocument();
  });

  it('avisa cuando el proyecto no tiene documentos y no ofrece adjuntar uno', async () => {
    const request = fakeRequest(workspaceRoutes({ activities: [activity], documents: [] }));
    render(<AcademicWorkspace user={admin} request={request} />);

    expect(await screen.findByText('Sin documentos en el proyecto')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adjuntar documento' })).not.toBeInTheDocument();
  });

  it('el enlace sigue usando kind LINK con su URL', async () => {
    const request = fakeRequest({
      ...workspaceRoutes({ activities: [activity], documents: [] }),
      [`POST /api/activities/${activity.id}/attachments`]: () => activity,
    });
    render(<AcademicWorkspace user={admin} request={request} />);

    await userEvent.type(await screen.findByLabelText('Enlace http(s) para Redactar la introducción'), 'https://example.test/borrador');
    await userEvent.click(screen.getByRole('button', { name: 'Adjuntar enlace' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/activities/${activity.id}/attachments`, {
      method: 'POST', body: { kind: 'LINK', url: 'https://example.test/borrador' },
    }));
  });
});
