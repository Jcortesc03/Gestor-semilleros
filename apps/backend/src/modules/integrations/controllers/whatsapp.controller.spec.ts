import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotFoundException, StreamableFile } from '@nestjs/common';
import type { NotificationsConfig } from '../../../config/notifications.config.types';
import type { WhatsAppStatus } from '../models/whatsapp-provider';
import type { WhatsAppGateway } from '../services/whatsapp/whatsapp-gateway.service';
import { WhatsAppController } from './whatsapp.controller';

const builderbot = {
  provider: 'baileys' as const,
  sessionName: 'pruebas',
  pairingPhone: null,
};

const status: WhatsAppStatus = {
  provider: 'baileys',
  state: 'connected',
  connectedPhone: '+***0001',
  qr: null,
  pairingCode: null,
  detail: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function config(whatsapp: NotificationsConfig['whatsapp']): NotificationsConfig {
  return {
    email: { transport: 'disabled' },
    whatsapp,
    autoDispatch: false,
    dispatchIntervalSeconds: 60,
    maxAttempts: 3,
    maxDeferHours: 24,
  };
}

function fakeGateway(overrides: Partial<WhatsAppGateway> = {}): WhatsAppGateway {
  return {
    getStatus: jest.fn().mockReturnValue(status),
    qrImagePath: jest.fn().mockReturnValue(null),
    ...overrides,
  } as unknown as WhatsAppGateway;
}

describe('WhatsAppController', () => {
  it('con transporte log informa el transporte sin estado del gateway', () => {
    const controller = new WhatsAppController(config({ transport: 'log' }), null);

    expect(controller.status()).toEqual({ transport: 'log' });
  });

  it('con builderbot informa el transporte y el estado del gateway', () => {
    const gateway = fakeGateway();
    const controller = new WhatsAppController(
      config({ transport: 'builderbot', builderbot }),
      gateway,
    );

    expect(controller.status()).toEqual({ transport: 'builderbot', ...status });
    expect(gateway.getStatus).toHaveBeenCalledTimes(1);
  });

  it('qr() sin QR pendiente lanza NotFoundException', () => {
    const controller = new WhatsAppController(
      config({ transport: 'builderbot', builderbot }),
      fakeGateway(),
    );

    expect(() => controller.qr()).toThrow(NotFoundException);
  });

  it('qr() con un PNG pendiente devuelve un StreamableFile', () => {
    const directory = mkdtempSync(join(tmpdir(), 'whatsapp-qr-'));
    try {
      const file = join(directory, 'x.qr.png');
      writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const gateway = fakeGateway({ qrImagePath: jest.fn().mockReturnValue(file) });
      const controller = new WhatsAppController(
        config({ transport: 'builderbot', builderbot }),
        gateway,
      );

      expect(controller.qr()).toBeInstanceOf(StreamableFile);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
