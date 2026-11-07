import { Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { BuilderBotWhatsAppConfig, WhatsAppProviderName } from '../../../../config/notifications.config.types';
import { DeliveryError } from '../../models/channel';
import type {
  WhatsAppConnectionState,
  WhatsAppProviderFactory,
  WhatsAppProviderHandle,
  WhatsAppStatus,
} from '../../models/whatsapp-provider';
import { maskAddress } from '../channels/log.sender';

/**
 * Conexión de WhatsApp gestionada con BuilderBot. Arranca el provider configurado al iniciar el
 * módulo, sigue sus eventos y expone el estado (QR o código de emparejamiento) al administrador.
 */
export class WhatsAppGateway implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('WhatsApp');
  private handle: WhatsAppProviderHandle | null = null;
  private starting: Promise<void> | null = null;
  private status: WhatsAppStatus;

  constructor(
    private readonly config: BuilderBotWhatsAppConfig,
    private readonly factories: Record<WhatsAppProviderName, WhatsAppProviderFactory>,
  ) {
    this.status = this.initialStatus();
  }

  async onModuleInit(): Promise<void> {
    // Sin await: vincular la sesión puede tardar y no debe bloquear el arranque de la API.
    this.start().catch((error: unknown) => this.fail(`No se pudo iniciar WhatsApp: ${String(error)}`));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.handle?.stop().catch(() => undefined);
    this.handle = null;
    this.update('stopped');
  }

  /** Arranca la conexión. Las llamadas simultáneas comparten el mismo arranque. */
  start(): Promise<void> {
    if (this.handle) return Promise.resolve();
    this.starting ??= this.connect().finally(() => (this.starting = null));
    return this.starting;
  }

  private async connect(): Promise<void> {
    this.update('starting');
    const handle = await this.factories[this.config.provider](this.config);
    this.handle = handle;
    const { provider } = handle;

    provider.on('require_action', (action: { payload?: { qr?: string; code?: string } }) => {
      const code = action?.payload?.code ?? null;
      const qr = action?.payload?.qr ?? null;
      if (code) {
        this.update('awaiting_pairing_code', { pairingCode: code, qr: null });
        this.logger.warn(`Vincula WhatsApp con el código de emparejamiento ${code} (también en GET /api/integrations/whatsapp/status).`);
      } else if (qr) {
        this.update('awaiting_qr', { qr, pairingCode: null });
        this.logger.warn('Escanea el QR de WhatsApp: GET /api/integrations/whatsapp/qr (solo administradores).');
      }
    });
    provider.on('ready', () => {
      this.update('connected', { qr: null, pairingCode: null, detail: null });
      this.logger.log('WhatsApp conectado.');
    });
    provider.on('host', (host: { phone?: string }) => {
      if (host?.phone) this.status = { ...this.status, connectedPhone: `+${host.phone}` };
    });
    provider.on('auth_failure', (info: unknown) => {
      this.fail(Array.isArray(info) ? String(info[0] ?? '') : String(info ?? ''));
    });

    try {
      await handle.start();
    } catch (error) {
      // Libera el provider para que un nuevo start() pueda reintentar desde cero.
      this.handle = null;
      await handle.stop().catch(() => undefined);
      throw error;
    }
  }

  getStatus(): WhatsAppStatus {
    return { ...this.status, connectedPhone: this.status.connectedPhone && maskAddress(this.status.connectedPhone) };
  }

  /** Ruta del PNG del QR, solo mientras se espera el escaneo. */
  qrImagePath(): string | null {
    return this.status.state === 'awaiting_qr' ? (this.handle?.qrImagePath ?? null) : null;
  }

  /** Envía un texto a un número E.164. Falla con error reintentable si no hay conexión. */
  async sendText(phoneE164: string, text: string): Promise<void> {
    if (!this.handle || this.status.state !== 'connected') {
      throw new DeliveryError('WhatsApp no está conectado; la copia espera a que se reconecte.', true, true);
    }
    try {
      await this.handle.provider.sendMessage(phoneE164.replace(/^\+/, ''), text, {});
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new DeliveryError(`El provider de WhatsApp no pudo enviar el mensaje: ${reason}`.slice(0, 300), true);
    }
  }

  private fail(detail: string): void {
    this.update('auth_failure', { detail, qr: null, pairingCode: null });
    this.logger.error(`WhatsApp: ${detail}`);
  }

  private update(state: WhatsAppConnectionState, patch: Partial<WhatsAppStatus> = {}): void {
    this.status = { ...this.status, ...patch, state, updatedAt: new Date().toISOString() };
  }

  private initialStatus(): WhatsAppStatus {
    return {
      provider: this.config.provider,
      state: 'stopped',
      connectedPhone: null,
      qr: null,
      pairingCode: null,
      detail: null,
      updatedAt: new Date().toISOString(),
    };
  }
}
