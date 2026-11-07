import { NotificationKind, NotificationChannel } from '../../../generated/prisma/enums';

/**
 * Valor por defecto cuando el usuario no ha elegido (sin fila en `notification_preferences`):
 * el correo se activa; WhatsApp exige teléfono y consentimiento expreso, así que empieza desactivado.
 */
export const DEFAULT_CHANNEL_ENABLED: Record<NotificationChannel, boolean> = {
  EMAIL: true,
  WHATSAPP: false,
};

export const ALL_KINDS = Object.values(NotificationKind);
export const ALL_CHANNELS = Object.values(NotificationChannel);

export interface PreferenceRow {
  kind: NotificationKind;
  channel: NotificationChannel;
  enabled: boolean;
}

/** Matriz completa (tipo × canal) aplicando los valores por defecto a lo que falte. */
export function effectivePreferences(stored: readonly PreferenceRow[]): PreferenceRow[] {
  return ALL_KINDS.flatMap((kind) =>
    ALL_CHANNELS.map((channel) => ({
      kind,
      channel,
      enabled: stored.find((p) => p.kind === kind && p.channel === channel)?.enabled ?? DEFAULT_CHANNEL_ENABLED[channel],
    })),
  );
}

/** ¿El usuario quiere copia de este tipo por este canal? */
export function wantsCopy(stored: readonly PreferenceRow[], kind: NotificationKind, channel: NotificationChannel): boolean {
  return stored.find((p) => p.kind === kind && p.channel === channel)?.enabled ?? DEFAULT_CHANNEL_ENABLED[channel];
}
