import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CurrentUser } from '../../types/auth.ts';
import type { ApiRequest } from '../../types/api.ts';
import { Button, ErrorNotice, Field } from '../../components/WorkspaceUi';
import {
  ANNOUNCEMENT_KINDS,
  createAnnouncement,
  type AnnouncementAudienceInput,
  type AnnouncementKind,
  type Announcement,
  type CreateAnnouncementInput,
} from './api';
import { ANNOUNCEMENT_KIND_LABELS, hasRole, SelectField, textAreaClassName } from './shared';

interface PublishFormState {
  title: string;
  content: string;
  kind: AnnouncementKind;
  facultyId: string;
}

const INITIAL_FORM: PublishFormState = { title: '', content: '', kind: 'NEWS', facultyId: '' };

interface PublishAnnouncementFormProps {
  user: CurrentUser;
  request: ApiRequest;
  onPublished: (announcement: Announcement) => void;
}

export function PublishAnnouncementForm({ user, request, onPublished }: PublishAnnouncementFormProps) {
  const [form, setForm] = useState<PublishFormState>(INITIAL_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [queued, setQueued] = useState<number>();

  // Solo ADMIN y DEAN pueden usar el tipo NOTIFICACION (P-16); el servidor vuelve a validarlo.
  const canNotify = hasRole(user, 'ADMIN', 'DEAN');
  const kindOptions = ANNOUNCEMENT_KINDS
    .filter((kind) => kind !== 'NOTIFICATION' || canNotify)
    .map((kind) => ({ value: kind, label: ANNOUNCEMENT_KIND_LABELS[kind] }));
  // ADMIN y AREA_MANAGER publican para todos; el resto indica una facultad.
  const broadAudience = hasRole(user, 'ADMIN', 'AREA_MANAGER');

  function update<K extends keyof PublishFormState>(key: K, value: PublishFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const audience: AnnouncementAudienceInput = broadAudience
      ? { type: 'ALL' }
      : { type: 'FACULTY', facultyId: form.facultyId.trim() };
    const input: CreateAnnouncementInput = {
      kind: form.kind,
      title: form.title.trim(),
      content: form.content.trim(),
      audiences: [audience],
    };
    setBusy(true);
    setError(undefined);
    setQueued(undefined);
    try {
      const created = await createAnnouncement(request, input);
      onPublished(created);
      setQueued(created.queuedDeliveries ?? 0);
      setForm(INITIAL_FORM);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <Field required label="Título" value={form.title} onChange={(e) => update('title', e.target.value)} />
      <SelectField label="Tipo" value={form.kind} options={kindOptions} onChange={(kind) => update('kind', kind)} />
      <label className="block space-y-2 text-sm font-semibold">
        Contenido
        <textarea required className={textAreaClassName} value={form.content} onChange={(e) => update('content', e.target.value)} />
      </label>
      {!broadAudience && (
        <Field
          required
          label="UUID de facultad"
          hint="Referencia UUID del contrato; no se carga un catálogo ficticio."
          value={form.facultyId}
          onChange={(e) => update('facultyId', e.target.value)}
        />
      )}
      <p className="text-sm text-navy/70">
        La audiencia y sus permisos los valida el servidor. Los estados de entrega solo se muestran cuando el backend los reporta.
      </p>
      <Button type="submit" disabled={busy}>{busy ? 'Publicando…' : 'Publicar novedad'}</Button>
      {error !== undefined && <ErrorNotice error={error} />}
      {queued !== undefined && (
        <p role="status" className="rounded-lg bg-canvas p-4 text-sm font-semibold">
          Novedad publicada. Copias encoladas: {queued}.
        </p>
      )}
    </form>
  );
}
