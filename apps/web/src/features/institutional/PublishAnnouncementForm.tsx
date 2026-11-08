import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { CurrentUser } from '../../types/auth.ts';
import type { ApiRequest } from '../../types/api.ts';
import { Button, ErrorNotice, Field, LoadingState, inputClassName } from '../../components/WorkspaceUi';
import { AreaSelect, FacultyMultiSelect } from '../directory/index.ts';
import {
  ANNOUNCEMENT_KINDS,
  createAnnouncement,
  listProjectsForAudience,
  type AnnouncementAudienceInput,
  type AnnouncementKind,
  type Announcement,
  type CreateAnnouncementInput,
  type GlobalRole,
  type PublishableProject,
} from './api';
import { ANNOUNCEMENT_KIND_LABELS, hasRole, ROLE_OPTIONS, SelectField, textAreaClassName } from './shared';

type AudienceType = 'ALL' | 'AREA' | 'ROLE' | 'FACULTY' | 'PROJECT';

const AUDIENCE_TYPES: readonly AudienceType[] = ['ALL', 'AREA', 'ROLE', 'FACULTY', 'PROJECT'];

const AUDIENCE_LABELS: Record<AudienceType, string> = {
  ALL: 'Todos los usuarios',
  AREA: 'Área',
  ROLE: 'Por roles',
  FACULTY: 'Facultades',
  PROJECT: 'Proyecto',
};

/** Roles que pueden usar cada audiencia (ADR 0010, secs. 8 y 9). Los roles se suman. */
const AUDIENCE_ROLES: Record<AudienceType, readonly GlobalRole[]> = {
  ALL: ['ADMIN'],
  AREA: ['ADMIN', 'AREA_MANAGER'],
  ROLE: ['ADMIN', 'AREA_MANAGER'],
  FACULTY: ['ADMIN', 'DEAN'],
  PROJECT: ['ADMIN', 'DEAN', 'TUTOR'],
};

interface PublishFormState {
  title: string;
  content: string;
  kind: AnnouncementKind;
  audience: AudienceType;
  roles: GlobalRole[];
  facultyIds: string[];
  areaId: string;
  projectId: string;
}

const initialForm = (audience: AudienceType): PublishFormState => ({
  title: '', content: '', kind: 'NEWS', audience, roles: [], facultyIds: [], areaId: '', projectId: '',
});

/** Construye la audiencia del contrato; `null` cuando falta el destino elegido. */
function buildAudiences(form: PublishFormState): AnnouncementAudienceInput[] | null {
  switch (form.audience) {
    case 'ALL': return [{ type: 'ALL' }];
    case 'AREA': return form.areaId ? [{ type: 'AREA', areaId: form.areaId }] : null;
    case 'ROLE': return form.roles.length > 0 ? form.roles.map((role) => ({ type: 'ROLE', role })) : null;
    case 'FACULTY': return form.facultyIds.length > 0 ? form.facultyIds.map((facultyId) => ({ type: 'FACULTY', facultyId })) : null;
    case 'PROJECT': return form.projectId ? [{ type: 'PROJECT', projectId: form.projectId }] : null;
  }
}

interface PublishAnnouncementFormProps {
  user: CurrentUser;
  request: ApiRequest;
  onPublished: (announcement: Announcement) => void;
}

export function PublishAnnouncementForm({ user, request, onPublished }: PublishAnnouncementFormProps) {
  // Un usuario con varios roles elige primero el tipo de audiencia entre los que le corresponden.
  const audienceOptions = AUDIENCE_TYPES.filter((type) => hasRole(user, ...AUDIENCE_ROLES[type]));
  const defaultAudience = audienceOptions[0] ?? 'ALL';
  const [form, setForm] = useState<PublishFormState>(() => initialForm(defaultAudience));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [queued, setQueued] = useState<number>();
  const [projects, setProjects] = useState<PublishableProject[] | null>(null);
  const [projectsError, setProjectsError] = useState<unknown>();

  // Solo ADMIN y DEAN pueden usar el tipo NOTIFICACION (P-16, RN-93); el servidor vuelve a validarlo.
  const canNotify = hasRole(user, 'ADMIN', 'DEAN');
  const kindOptions = ANNOUNCEMENT_KINDS
    .filter((kind) => kind !== 'NOTIFICATION' || canNotify)
    .map((kind) => ({ value: kind, label: ANNOUNCEMENT_KIND_LABELS[kind] }));
  const audienceSelectOptions = audienceOptions.map((value) => ({ value, label: AUDIENCE_LABELS[value] }));

  // Alcance de los filtros: el administrador ve todo; los demás, solo lo que gestionan (ADR 0010, sec. 9).
  const isAdmin = hasRole(user, 'ADMIN');
  const areaScope = isAdmin ? 'all' : 'managed';
  const facultyScope = isAdmin ? 'all' : 'dean';

  // Fuentes de proyectos: administrador y decano ven `GET /api/projects`; tutor, `GET /api/projects/tutored`.
  // Un decano que también es tutor une ambas listas; el administrador ya cubre todo con la primera.
  const projectSources = { visible: hasRole(user, 'ADMIN', 'DEAN'), tutored: hasRole(user, 'TUTOR') && !isAdmin };
  const loadsProjects = form.audience === 'PROJECT';

  // Los proyectos se cargan solo cuando la audiencia PROJECT está seleccionada.
  const { visible: loadsVisibleProjects, tutored: loadsTutoredProjects } = projectSources;
  useEffect(() => {
    if (!loadsProjects) return;
    let active = true;
    setProjects(null);
    setProjectsError(undefined);
    listProjectsForAudience(request, { visible: loadsVisibleProjects, tutored: loadsTutoredProjects }).then(
      (items) => { if (active) setProjects(items); },
      (cause: unknown) => { if (active) setProjectsError(cause); },
    );
    return () => { active = false; };
  }, [request, loadsVisibleProjects, loadsTutoredProjects, loadsProjects]);

  const audiences = buildAudiences(form);

  function update<K extends keyof PublishFormState>(key: K, value: PublishFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleRole(role: GlobalRole, checked: boolean) {
    setForm((current) => {
      const roles = checked ? [...current.roles, role] : current.roles.filter((item) => item !== role);
      return { ...current, roles: ROLE_OPTIONS.map((option) => option.value).filter((item) => roles.includes(item)) };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || audiences === null) return;
    const input: CreateAnnouncementInput = {
      kind: form.kind,
      title: form.title.trim(),
      content: form.content.trim(),
      audiences,
    };
    setBusy(true);
    setError(undefined);
    setQueued(undefined);
    try {
      const created = await createAnnouncement(request, input);
      onPublished(created);
      setQueued(created.queuedDeliveries ?? 0);
      setForm(initialForm(defaultAudience));
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
      <SelectField
        label="Destinatarios"
        value={form.audience}
        options={audienceSelectOptions}
        onChange={(audience) => update('audience', audience)}
      />
      {form.audience === 'ALL' && (
        <p className="text-sm text-navy/70">La novedad llegará a todos los usuarios activos.</p>
      )}
      {form.audience === 'AREA' && (
        <AreaSelect
          request={request}
          label="Área destinataria"
          value={form.areaId}
          onChange={(areaId) => update('areaId', areaId)}
          required
          disabled={busy}
          scope={areaScope}
        />
      )}
      {form.audience === 'ROLE' && (
        <RoleCheckboxes selected={form.roles} disabled={busy} onToggle={toggleRole} />
      )}
      {form.audience === 'FACULTY' && (
        <FacultyMultiSelect
          request={request}
          label="Facultades destinatarias"
          value={form.facultyIds}
          onChange={(facultyIds) => update('facultyIds', facultyIds)}
          disabled={busy}
          scope={facultyScope}
        />
      )}
      {form.audience === 'PROJECT' && (
        <ProjectSelect
          projects={projects}
          error={projectsError}
          value={form.projectId}
          disabled={busy}
          onChange={(projectId) => update('projectId', projectId)}
        />
      )}
      <p className="text-sm text-navy/70">
        La audiencia y sus permisos los valida el servidor. Los estados de entrega solo se muestran cuando el backend los reporta.
      </p>
      <Button type="submit" disabled={busy || audiences === null}>{busy ? 'Publicando…' : 'Publicar novedad'}</Button>
      {error !== undefined && <ErrorNotice error={error} />}
      {queued !== undefined && (
        <p role="status" className="rounded-lg bg-canvas p-4 text-sm font-semibold">
          Novedad publicada. Copias encoladas: {queued}.
        </p>
      )}
    </form>
  );
}

interface RoleCheckboxesProps {
  selected: readonly GlobalRole[];
  disabled: boolean;
  onToggle: (role: GlobalRole, checked: boolean) => void;
}

/** Casillas de roles globales; cada rol elegido se envía como una audiencia `ROLE` (máximo 5, dentro de las 20 del contrato). */
function RoleCheckboxes({ selected, disabled, onToggle }: RoleCheckboxesProps) {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-semibold text-navy">Roles destinatarios</legend>
      {ROLE_OPTIONS.map((option) => (
        <label key={option.value} className="flex min-h-10 items-center gap-3 text-sm text-navy">
          <input
            type="checkbox"
            className="size-5"
            disabled={disabled}
            checked={selected.includes(option.value)}
            onChange={(event) => onToggle(option.value, event.target.checked)}
          />
          {option.label}
        </label>
      ))}
      {selected.length === 0 && <p className="text-sm text-navy/70">Elige al menos un rol.</p>}
    </fieldset>
  );
}

interface ProjectSelectProps {
  projects: PublishableProject[] | null;
  error: unknown;
  value: string;
  disabled: boolean;
  onChange: (projectId: string) => void;
}

/** Selector de proyectos destinatarios con estados de carga, error y vacío explícitos. */
function ProjectSelect({ projects, error, value, disabled, onChange }: ProjectSelectProps) {
  const id = useId();
  const loading = projects === null && error === undefined;
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">Proyecto destinatario</label>
      <select
        id={id}
        className={inputClassName}
        value={value}
        required
        disabled={disabled || projects === null}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{loading ? 'Cargando proyectos…' : 'Seleccionar'}</option>
        {projects?.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
      {loading && <LoadingState label="Cargando proyectos…" />}
      {error !== undefined && <ErrorNotice error={error} />}
      {projects?.length === 0 && <p className="text-sm text-navy/70">No hay proyectos disponibles para esta audiencia.</p>}
    </div>
  );
}
