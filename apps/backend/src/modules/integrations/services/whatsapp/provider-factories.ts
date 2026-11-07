import { join } from 'node:path';
import type { WhatsAppProviderName } from '../../../../config/notifications.config.types';
import type { BuilderBotProviderLike, WhatsAppProviderFactory } from '../../models/whatsapp-provider';

/**
 * Baileys (WhatsApp Web, sin API oficial). La sesión se guarda en `<cwd>/<sessionName>_sessions/`.
 * No se arranca el servidor HTTP de BuilderBot: publicaría el QR en un puerto abierto. Solo se
 * inicia la conexión (`initVendor`), que emite los eventos estándar del provider.
 */
/**
 * Forma mínima del módulo `@builderbot/provider-baileys` que se usa. Sus tipos publicados no
 * resuelven con `moduleResolution: nodenext` (re-exportan `./bailey` sin extensión desde un
 * `.d.ts` ESM), por eso se declara aquí. En ejecución se carga su build CommonJS.
 */
interface BaileysProviderInstance extends BuilderBotProviderLike {
  initVendor(): Promise<unknown>;
  destroy(): Promise<void>;
}
interface BaileysModule {
  BaileysProvider: new (args: Record<string, unknown>) => BaileysProviderInstance;
}

const baileys: WhatsAppProviderFactory = async (config) => {
  // Carga diferida: Baileys solo se carga si el transporte de WhatsApp es `builderbot`.
  const { BaileysProvider } = require('@builderbot/provider-baileys') as BaileysModule;
  // Equivale a `createProvider(BaileysProvider, args)` de @builderbot/bot (que solo hace `new`).
  const provider = new BaileysProvider({
    name: config.sessionName,
    usePairingCode: config.pairingPhone !== null,
    phoneNumber: config.pairingPhone,
    groupsIgnore: true,
    readStatus: false,
    writeMyself: 'none',
    lidCache: 'memory',
    captureProcessSignals: false,
  });
  return {
    provider,
    // `initVendor` es protegido en los tipos de BuilderBot, pero es la vía de arranque sin HTTP.
    start: async () => {
      await provider.initVendor();
    },
    stop: () => provider.destroy(),
    qrImagePath: join(process.cwd(), `${config.sessionName}.qr.png`),
  };
};

/**
 * Providers de BuilderBot disponibles. Para añadir otro (p. ej. `@builderbot/provider-meta`):
 * instalar el paquete, añadir su nombre a `WHATSAPP_PROVIDERS` y su fábrica aquí.
 */
export const WHATSAPP_PROVIDER_FACTORIES: Record<WhatsAppProviderName, WhatsAppProviderFactory> = { baileys };
