import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
    expect(image.getAttribute('src')).toMatch(/^\/api\/integrations\/whatsapp\/qr\?v=2026-11-06T12%3A00%3A00\.000Z-\d+$/);
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

  it('carga el estado al abrir y renueva el QR solo, sin pulsar nada (WhatsApp lo cambia cada ~40 s)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let current: Record<string, unknown> = awaitingQr;
      const request = fakeRequest(async () => current);
      render(<InstitutionalWorkspace user={admin} request={request} section="whatsapp" />);

      const qrImage = () => screen.getByRole('img', { name: 'Código QR para vincular la cuenta de WhatsApp' });
      await screen.findByRole('img', { name: 'Código QR para vincular la cuenta de WhatsApp' });
      const first = qrImage().getAttribute('src');
      expect(first).toMatch(/^\/api\/integrations\/whatsapp\/qr\?v=2026-11-06T12%3A00%3A00\.000Z-/);

      // Aunque updatedAt no cambie, cada consulta vuelve a pedir la imagen: BuilderBot avisa del QR
      // nuevo antes de escribir el PNG, así que la primera descarga podía traer el QR anterior.
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      const sameVersion = qrImage().getAttribute('src');
      expect(sameVersion).not.toBe(first);

      current = { ...awaitingQr, updatedAt: '2026-11-06T12:00:40.000Z' };
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(qrImage().getAttribute('src')).toMatch(/^\/api\/integrations\/whatsapp\/qr\?v=2026-11-06T12%3A00%3A40\.000Z-/);

      // Una vez conectado deja de consultar.
      current = { ...awaitingQr, state: 'connected', connectedPhone: '+57 300 000 0000', updatedAt: '2026-11-06T12:01:00.000Z' };
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(await screen.findByText('Conectado')).toBeInTheDocument();
      const calls = request.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
      expect(request.mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });
});
