import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { ApiRequest } from '../../types/api.ts';
import { Button, ErrorNotice, Field, LoadingState, PanelCard, inputClassName } from '../../components/WorkspaceUi';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreference,
  type NotificationPreferences,
  type NotificationPreferencesUpdate,
} from './api';
import { CHANNEL_LABELS, NOTIFICATION_KIND_LABELS } from './shared';
import { PHONE_COUNTRIES, splitPhone } from './phone';

interface PreferencesDraft {
  phone: string;
  countryCode: string;
  nationalNumber: string;
  preferences: NotificationPreference[];
}

function preferenceKey(item: Pick<NotificationPreference, 'kind' | 'channel'>): string {
  return `${item.kind}:${item.channel}`;
}

function toDraft(value: NotificationPreferences, preferredCode?: string): PreferencesDraft {
  return { phone: value.phone ?? '', ...splitPhone(value.phone, preferredCode), preferences: value.preferences };
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
  const countryId = useId();
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
  const country = PHONE_COUNTRIES.find((item) => item.code === draft.countryCode);
  const validPhone = draft.phone === (saved.phone ?? '') || draft.nationalNumber === ''
    || Boolean(country && /^\d+$/.test(draft.nationalNumber) && country.lengths.includes(draft.nationalNumber.length));

  function changePhone(countryCode: string, nationalNumber: string) {
    const selected = PHONE_COUNTRIES.find((item) => item.code === countryCode);
    setDraft((current) => current && {
      ...current, countryCode, nationalNumber,
      phone: nationalNumber === '' ? '' : selected ? `+${selected.prefix}${nationalNumber}` : nationalNumber,
    });
  }

  function togglePreference(target: NotificationPreference, enabled: boolean) {
    setDraft((current) => current && {
      ...current,
      preferences: current.preferences.map((item) => (preferenceKey(item) === preferenceKey(target) ? { ...item, enabled } : item)),
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!update || saving || !validPhone) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const result = await updateNotificationPreferences(request, update);
      setSaved(result);
      setDraft(toDraft(result, draft?.countryCode));
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
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <label htmlFor={countryId} className="block text-sm font-semibold text-navy">País del teléfono</label>
            <select id={countryId} className={inputClassName} value={draft.countryCode} disabled={saving}
              aria-describedby={`${countryId}-hint`}
              onChange={(event) => changePhone(event.target.value, draft.nationalNumber)}>
              <option value="">{draft.phone.startsWith('+') && !country ? 'País no incluido (número guardado)' : 'Seleccionar país'}</option>
              {PHONE_COUNTRIES.map((item) => <option key={item.code} value={item.code}>{item.name} (+{item.prefix})</option>)}
            </select>
            <p id={`${countryId}-hint`} className="text-sm text-navy/70">{country ? `Prefijo: +${country.prefix}` : 'Selecciona el país para agregar o cambiar tu teléfono.'}</p>
          </div>
          <Field
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            label="Número de teléfono"
            hint={country
              ? `Longitudes admitidas: ${country.lengths.join(', ')} dígitos. Sin prefijo internacional ni código de salida. Vacío borra el teléfono.`
              : 'El número guardado se conserva. Selecciona un país para reemplazarlo; vacío lo borra.'}
            value={draft.nationalNumber}
            disabled={saving}
            maxLength={country ? Math.max(...country.lengths) : 16}
            aria-invalid={!validPhone}
            onChange={(event) => {
              const next = event.target.value;
              if (!country || next.length <= Math.max(...country.lengths) || next.length < draft.nationalNumber.length) {
                changePhone(draft.countryCode, next);
              }
            }}
          />
        </div>
        {!validPhone && <p role="alert" className="text-sm text-alert">Selecciona un país e ingresa solo dígitos con una longitud admitida para ese país.</p>}
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
          <Button type="submit" disabled={!update || saving || !validPhone}>{saving ? 'Guardando…' : 'Guardar preferencias'}</Button>
          {!update && <p className="text-sm text-navy/70">No hay cambios pendientes.</p>}
        </div>
        {saveError !== undefined && <ErrorNotice error={saveError} />}
      </form>
    </PanelCard>
  );
}
