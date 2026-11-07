import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { ApiRequest } from '../../types/api.ts';
import { Button, ErrorNotice, Field, LoadingState, PanelCard } from '../../components/WorkspaceUi';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreference,
  type NotificationPreferences,
  type NotificationPreferencesUpdate,
} from './api';
import { CHANNEL_LABELS, NOTIFICATION_KIND_LABELS } from './shared';

interface PreferencesDraft {
  phone: string;
  preferences: NotificationPreference[];
}

function preferenceKey(item: Pick<NotificationPreference, 'kind' | 'channel'>): string {
  return `${item.kind}:${item.channel}`;
}

function toDraft(value: NotificationPreferences): PreferencesDraft {
  return { phone: value.phone ?? '', preferences: value.preferences };
}

/**
 * Construye solo los cambios respecto a lo guardado en el servidor, para que la actualización
 * sea parcial. Devuelve `null` si no hay nada que enviar.
 */
function buildUpdate(saved: NotificationPreferences, draft: PreferencesDraft): NotificationPreferencesUpdate | null {
  const nextPhone = draft.phone.trim() === '' ? null : draft.phone.trim();
  const phoneChanged = nextPhone !== saved.phone;
  const savedValues = new Map(saved.preferences.map((item) => [preferenceKey(item), item.enabled] as const));
  const changed = draft.preferences.filter((item) => savedValues.get(preferenceKey(item)) !== item.enabled);
  if (!phoneChanged && changed.length === 0) return null;
  return {
    ...(phoneChanged ? { phone: nextPhone } : {}),
    ...(changed.length > 0 ? { preferences: changed } : {}),
  };
}

export function PreferencesSection({ request }: { request: ApiRequest }) {
  const [saved, setSaved] = useState<NotificationPreferences | null>(null);
  const [draft, setDraft] = useState<PreferencesDraft | null>(null);
  const [loadError, setLoadError] = useState<unknown>();
  const [saveError, setSaveError] = useState<unknown>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Bandera local por ejecución: StrictMode repite el efecto y solo la última respuesta se aplica.
    let active = true;
    getNotificationPreferences(request)
      .then((value) => {
        if (!active) return;
        setSaved(value);
        setDraft(toDraft(value));
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(cause);
      });
    return () => {
      active = false;
    };
  }, [request]);

  if (loadError !== undefined) {
    return <PanelCard title="Preferencias de notificación"><ErrorNotice error={loadError} /></PanelCard>;
  }
  if (!saved || !draft) {
    return <PanelCard title="Preferencias de notificación"><LoadingState label="Cargando preferencias…" /></PanelCard>;
  }

  const update = buildUpdate(saved, draft);

  function togglePreference(target: NotificationPreference, enabled: boolean) {
    setDraft((current) => current && {
      ...current,
      preferences: current.preferences.map((item) => (preferenceKey(item) === preferenceKey(target) ? { ...item, enabled } : item)),
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!update || saving) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const result = await updateNotificationPreferences(request, update);
      setSaved(result);
      setDraft(toDraft(result));
    } catch (cause) {
      // El borrador se conserva para que la persona pueda corregirlo y volver a intentarlo.
      setSaveError(cause);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PanelCard title="Preferencias de notificación">
      <form className="space-y-6" onSubmit={save}>
        <Field
          type="tel"
          autoComplete="tel"
          label="Teléfono internacional"
          hint="Formato E.164, por ejemplo +573001234567. Para recibir copias por WhatsApp debes registrar un teléfono. Vacío lo borra."
          value={draft.phone}
          onChange={(event) => setDraft((current) => current && { ...current, phone: event.target.value })}
        />
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-3 text-sm font-semibold">Copias que quiero recibir</legend>
          {draft.preferences.map((preference) => {
            const kindLabel = NOTIFICATION_KIND_LABELS[preference.kind];
            const channelLabel = CHANNEL_LABELS[preference.channel];
            return (
              <label
                key={preferenceKey(preference)}
                className="flex items-center justify-between gap-4 rounded-lg border border-navy/10 bg-canvas/50 p-4"
              >
                <span>
                  <strong className="block text-sm">{kindLabel}</strong>
                  <span className="text-xs text-navy/65">{channelLabel}</span>
                </span>
                <input
                  type="checkbox"
                  className="size-5"
                  aria-label={`${kindLabel} por ${channelLabel}`}
                  checked={preference.enabled}
                  onChange={(event) => togglePreference(preference, event.target.checked)}
                />
              </label>
            );
          })}
        </fieldset>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={!update || saving}>{saving ? 'Guardando…' : 'Guardar preferencias'}</Button>
          {!update && <p className="text-sm text-navy/70">No hay cambios pendientes.</p>}
        </div>
        {saveError !== undefined && <ErrorNotice error={saveError} />}
      </form>
    </PanelCard>
  );
}
