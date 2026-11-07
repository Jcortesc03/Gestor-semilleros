import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InstitutionalWorkspace } from '../../../src/features/institutional';
import { admin, fakeRequest, student } from './fixtures';

const awaitingQr = {
  transport: 'builderbot',
  provider: 'baileys',
  state: 'awaiting_qr',
  connectedPhone: null,
  qr: '2@credencial-de-prueba',
  pairingCode: null,
  detail: null,
  updatedAt: '2026-11-06T12:00:00.000Z',
};

describe('Estado de WhatsApp', () => {
  it('muestra el QR como imagen del endpoint PNG y no el texto de la credencial', async () => {
    const request = fakeRequest(async () => awaitingQr);
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="whatsapp" />);

    await user.click(screen.getByRole('button', { name: 'Consultar estado' }));

    const image = await screen.findByRole('img', { name: 'Código QR para vincular la cuenta de WhatsApp' });
    expect(image).toHaveAttribute('src', '/api/integrations/whatsapp/qr?v=2026-11-06T12%3A00%3A00.000Z');
    expect(screen.getByText('Esperando el escaneo del QR')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('credencial-de-prueba');
  });

  it('explica el transporte sin conexión real', async () => {
    const request = fakeRequest(async () => ({ transport: 'log' }));
    const user = userEvent.setup();
    render(<InstitutionalWorkspace user={admin} request={request} section="whatsapp" />);

    await user.click(screen.getByRole('button', { name: 'Consultar estado' }));

    expect(await screen.findByText(/registra los envíos en el log/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('no consulta el estado a quien no es administrador', () => {
    const request = fakeRequest(async () => awaitingQr);
    render(<InstitutionalWorkspace user={student} request={request} section="whatsapp" />);

    expect(screen.getByText('La conexión institucional solo puede consultarla un administrador.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
});
