import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import type { BuilderBotWhatsAppConfig } from '../../../../config/notifications.config.types';
import { DeliveryError } from '../../models/channel';
import type { BuilderBotProviderLike, WhatsAppProviderHandle } from '../../models/whatsapp-provider';
import { WhatsAppGateway } from './whatsapp-gateway.service';

const config: BuilderBotWhatsAppConfig = {
  provider: 'baileys',
  sessionName: 'pruebas',
  pairingPhone: null,
};

/** Provider falso: emite los eventos estándar y registra los envíos. */
function createProvider(): {
  provider: BuilderBotProviderLike;
  emitter: EventEmitter;
  sendMessage: jest.Mock;
} {
  const emitter = new EventEmitter();
  const sendMessage = jest.fn().mockResolvedValue(undefined);
  const provider: BuilderBotProviderLike = Object.assign(emitter, { sendMessage });
  return { provider, emitter, sendMessage };
}

/** Gateway con una fábrica falsa: no carga Baileys ni abre conexiones de red. */
function setup() {
  const { provider, emitter, sendMessage } = createProvider();
  const start = jest.fn().mockResolvedValue(undefined);
  const stop = jest.fn().mockResolvedValue(undefined);
  const handle: WhatsAppProviderHandle = {
    provider,
    start,
    stop,
    qrImagePath: '/tmp/x.qr.png',
  };
  const factory = jest.fn().mockResolvedValue(handle);
  const gateway = new WhatsAppGateway(config, { baileys: factory });
  return { gateway, emitter, sendMessage, start, stop, factory };
}

async function captureDeliveryError(promise: Promise<void>): Promise<DeliveryError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DeliveryError) {
      return error;
    }
    throw error;
  }
  throw new Error('Se esperaba un DeliveryError.');
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('WhatsAppGateway', () => {
  it('inicia en estado stopped', () => {
    const { gateway } = setup();

    expect(gateway.getStatus().state).toBe('stopped');
    expect(gateway.getStatus().provider).toBe('baileys');
  });

  it('pasa a starting y arranca el handle una sola vez aunque se llame start() dos veces', async () => {
    const { gateway, start, factory } = setup();

    const firstStart = gateway.start();
    expect(gateway.getStatus().state).toBe('starting');
    await firstStart;
    await gateway.start();

    expect(start).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('dos start() simultáneos crean el provider una sola vez', async () => {
    const { gateway, factory, start } = setup();
    await Promise.all([gateway.start(), gateway.start()]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('si el arranque del provider falla, lo detiene y permite reintentar', async () => {
    const { gateway, factory, start, stop } = setup();
    start.mockRejectedValueOnce(new Error('sin red'));
    await expect(gateway.start()).rejects.toThrow('sin red');
    expect(stop).toHaveBeenCalledTimes(1);
    await gateway.start();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('con require_action y QR pasa a awaiting_qr y expone la ruta de la imagen', async () => {
    const { gateway, emitter } = setup();
    await gateway.start();

    emitter.emit('require_action', { payload: { qr: 'qr-de-prueba' } });

    const status = gateway.getStatus();
    expect(status.state).toBe('awaiting_qr');
    expect(status.qr).toBe('qr-de-prueba');
    expect(status.pairingCode).toBeNull();
    expect(gateway.qrImagePath()).toBe('/tmp/x.qr.png');
  });

  it('con require_action y código pasa a awaiting_pairing_code y no expone QR', async () => {
    const { gateway, emitter } = setup();
    await gateway.start();

    emitter.emit('require_action', { payload: { code: 'ABC-123' } });

    const status = gateway.getStatus();
    expect(status.state).toBe('awaiting_pairing_code');
    expect(status.pairingCode).toBe('ABC-123');
    expect(status.qr).toBeNull();
    expect(gateway.qrImagePath()).toBeNull();
  });

  it('con ready pasa a connected y limpia QR y código', async () => {
    const { gateway, emitter } = setup();
    await gateway.start();
    emitter.emit('require_action', { payload: { qr: 'qr-de-prueba' } });

    emitter.emit('ready');

    const status = gateway.getStatus();
    expect(status.state).toBe('connected');
    expect(status.qr).toBeNull();
    expect(status.pairingCode).toBeNull();
    expect(status.detail).toBeNull();
  });

  it('con host guarda el teléfono enmascarado', async () => {
    const { gateway, emitter } = setup();
    await gateway.start();

    emitter.emit('host', { phone: '573000000001' });

    expect(gateway.getStatus().connectedPhone).toBe('+***0001');
  });

  it('con auth_failure guarda el motivo', async () => {
    const { gateway, emitter } = setup();
    await gateway.start();

    emitter.emit('auth_failure', ['motivo']);

    const status = gateway.getStatus();
    expect(status.state).toBe('auth_failure');
    expect(status.detail).toBe('motivo');
  });

  it('sendText sin conexión deja la copia en espera (no gasta intentos)', async () => {
    const { gateway } = setup();

    const error = await captureDeliveryError(gateway.sendText('+573000000001', 'Hola'));

    expect(error).toBeInstanceOf(DeliveryError);
    expect(error.retryable).toBe(true);
    expect(error.deferred).toBe(true);
    expect(error.message).toContain('WhatsApp no está conectado');
  });

  it('sendText conectado envía al número sin el prefijo +', async () => {
    const { gateway, emitter, sendMessage } = setup();
    await gateway.start();
    emitter.emit('ready');

    await gateway.sendText('+573000000001', 'Hola');

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('573000000001', 'Hola', {});
  });

  it('sendText propaga como reintentable el motivo del rechazo del provider', async () => {
    const { gateway, emitter, sendMessage } = setup();
    await gateway.start();
    emitter.emit('ready');
    sendMessage.mockRejectedValueOnce(new Error('sesión cerrada'));

    const error = await captureDeliveryError(gateway.sendText('+573000000001', 'Hola'));

    expect(error).toBeInstanceOf(DeliveryError);
    expect(error.retryable).toBe(true);
    expect(error.message).toContain('sesión cerrada');
  });

  it('onApplicationShutdown detiene el handle y vuelve a stopped', async () => {
    const { gateway, stop } = setup();
    await gateway.start();

    await gateway.onApplicationShutdown();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(gateway.getStatus().state).toBe('stopped');
  });

  it('onModuleInit pasa a auth_failure si la fábrica falla', async () => {
    const factory = jest.fn().mockRejectedValue(new Error('baileys no disponible'));
    const gateway = new WhatsAppGateway(config, { baileys: factory });

    await gateway.onModuleInit();
    await new Promise(setImmediate);

    const status = gateway.getStatus();
    expect(status.state).toBe('auth_failure');
    expect(status.detail).toContain('baileys no disponible');
  });
});
