import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ExternalLink, Link2, Unlink, Video } from 'lucide-react';
import { Button, EmptyState, ErrorNotice, Field, LoadingState, PanelCard, inputClassName } from '../../components/WorkspaceUi';
import { UserPicker, canSearchUsers } from '../directory';
import type { DirectoryUser } from '../directory';
import type { CurrentUser } from '../../types/auth';
import type { ApiRequest } from '../../types/api';
import {
  changeMeetingStatus, createMeeting, getMeeting, getMeetingProjects, getMeetings, getMicrosoftConnectUrl,
  getMicrosoftStatus, getProjectMembers, setMeetingRecording, unlinkMicrosoft,
} from './api';
import type { Meeting, MeetingProject, MeetingStatus, MicrosoftAccountType, MicrosoftStatus, ProjectMember } from './api';

export interface MeetingsWorkspaceProps { user: CurrentUser; request: ApiRequest; initialProjectId?: string }

const STATUS_LABELS: Record<MeetingStatus, string> = {
  SCHEDULED: 'Programada', IN_PROGRESS: 'En proceso', FINISHED: 'Finalizada', CANCELLED: 'Cancelada',
};

const ACCOUNT_TYPE_LABELS: Record<MicrosoftAccountType, string> = {
  WORK_OR_SCHOOL: 'Cuenta laboral o educativa', PERSONAL: 'Cuenta personal',
};

const PERSONAL_ACCOUNT_NOTE = 'Microsoft no genera enlaces de Teams para cuentas personales: al crear una reunión deberás indicar el enlace (Teams gratis, Meet, Zoom…).';

const MAX_JOIN_URL_LENGTH = 2048;

/** Devuelve el mensaje de error del enlace de la reunión o `null` si es válido (https://, hasta 2048 caracteres). */
function validateJoinUrl(value: string): string | null {
  const url = value.trim();
  if (!url) return 'Indica el enlace de la reunión.';
  if (url.length > MAX_JOIN_URL_LENGTH) return `El enlace de la reunión no puede tener más de ${MAX_JOIN_URL_LENGTH} caracteres.`;
  try {
    if (new URL(url).protocol === 'https:') return null;
  } catch { /* se informa abajo */ }
  return 'El enlace de la reunión debe empezar por https:// y ser una dirección válida.';
}

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

type Remote<T> = { phase: 'loading' } | { phase: 'error'; error: unknown } | { phase: 'ready'; data: T };

/** Carga con descarte de respuestas obsoletas y compatible con StrictMode (cada efecto tiene su propia bandera). */
function useRemote<T>(load: () => Promise<T>, deps: readonly unknown[]): [Remote<T>, () => void] {
  const [state, setState] = useState<Remote<T>>({ phase: 'loading' });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let current = true;
    setState({ phase: 'loading' });
    loadRef.current().then(
      (data) => { if (current) setState({ phase: 'ready', data }); },
      (error: unknown) => { if (current) setState({ phase: 'error', error }); },
    );
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return [state, useCallback(() => setTick((n) => n + 1), [])];
}

export function MeetingsWorkspace({ user, request, initialProjectId }: MeetingsWorkspaceProps) {
  const [microsoft, reloadMicrosoft] = useRemote(() => getMicrosoftStatus(request), [request]);
  const [meetings, reloadMeetings] = useRemote(() => getMeetings(request), [request]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canCreate = user.roles.includes('TUTOR') || user.roles.includes('ADMIN') || user.roles.includes('DEAN') || user.roles.includes('AREA_MANAGER');
  const linked = microsoft.phase === 'ready' && microsoft.data.linked;

  return (
    <div className="space-y-6">
      <MicrosoftPanel request={request} state={microsoft} reload={reloadMicrosoft} />
      {canCreate && (
        <CreateMeeting
          user={user}
          request={request}
          linked={linked}
          accountType={microsoft.phase === 'ready' ? microsoft.data.accountType : null}
          initialProjectId={initialProjectId}
          onCreated={(meeting) => { reloadMeetings(); setSelectedId(meeting.id); }}
        />
      )}
      <PanelCard title="Reuniones">
        {meetings.phase === 'loading' && <LoadingState label="Cargando reuniones…" />}
        {meetings.phase === 'error' && <div className="space-y-4"><ErrorNotice error={meetings.error} /><Button variant="secondary" onClick={reloadMeetings}>Reintentar</Button></div>}
        {meetings.phase === 'ready' && meetings.data.length === 0 && (
          <EmptyState title="No tienes reuniones" description="Cuando organices o te inviten a una reunión aparecerá aquí." />
        )}
        {meetings.phase === 'ready' && meetings.data.length > 0 && (
          <ul className="divide-y divide-navy/10">
            {meetings.data.map((meeting) => (
              <li key={meeting.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{meeting.reason}</p>
                  <p className="text-sm text-navy/70">{formatDateTime(meeting.startsAt)} · {meeting.durationMinutes} min{meeting.project ? ` · ${meeting.project.title}` : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-canvas px-3 py-1 text-sm font-semibold">{STATUS_LABELS[meeting.status]}</span>
                  <Button variant="secondary" aria-pressed={selectedId === meeting.id} onClick={() => setSelectedId(meeting.id)}>Ver detalle</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
      {selectedId && (
        <MeetingDetail
          key={selectedId}
          user={user}
          request={request}
          meetingId={selectedId}
          onChanged={reloadMeetings}
        />
      )}
    </div>
  );
}

function MicrosoftPanel({ request, state, reload }: { request: ApiRequest; state: Remote<MicrosoftStatus>; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function link() {
    setBusy(true); setError(null);
    try {
      const url = await getMicrosoftConnectUrl(request);
      window.location.assign(url);
    } catch (caught) { setError(caught); setBusy(false); }
  }

  async function unlink() {
    if (!window.confirm('¿Desvincular tu cuenta de Microsoft? Ya no podrás crear reuniones hasta vincularla de nuevo.')) return;
    setBusy(true); setError(null);
    try { await unlinkMicrosoft(request); reload(); } catch (caught) { setError(caught); } finally { setBusy(false); }
  }

  return (
    <PanelCard title="Cuenta de Microsoft">
      {state.phase === 'loading' && <LoadingState label="Consultando la vinculación…" />}
      {state.phase === 'error' && <div className="space-y-4"><ErrorNotice error={state.error} /><Button variant="secondary" onClick={reload}>Reintentar</Button></div>}
      {state.phase === 'ready' && !state.data.configured && (
        <EmptyState title="Integración no configurada" description="El servicio de Microsoft Teams aún no está configurado en el servidor." />
      )}
      {state.phase === 'ready' && state.data.configured && !state.data.linked && (
        <div className="space-y-4">
          <p className="text-sm text-navy/70">Para crear reuniones con Microsoft Teams debes vincular tu cuenta. Es solo un permiso de calendario; no cambia cómo inicias sesión.</p>
          <Button onClick={link} disabled={busy}><Link2 aria-hidden="true" className="size-5" />Vincular cuenta de Microsoft</Button>
        </div>
      )}
      {state.phase === 'ready' && state.data.configured && state.data.linked && (
        <div className="space-y-4">
          <p>Cuenta vinculada: <strong>{state.data.email ?? 'sin correo'}</strong>{state.data.linkedAt ? ` (desde ${formatDateTime(state.data.linkedAt)})` : ''}</p>
          {state.data.accountType && <p>Tipo de cuenta: <strong>{ACCOUNT_TYPE_LABELS[state.data.accountType]}</strong></p>}
          {state.data.accountType === 'PERSONAL' && <p className="text-sm leading-relaxed text-navy/70">{PERSONAL_ACCOUNT_NOTE}</p>}
          <Button variant="secondary" onClick={unlink} disabled={busy}><Unlink aria-hidden="true" className="size-5" />Desvincular cuenta</Button>
        </div>
      )}
      {error !== null && <div className="mt-4"><ErrorNotice error={error} /></div>}
    </PanelCard>
  );
}

function CreateMeeting({ user, request, linked, accountType, initialProjectId, onCreated }: {
  user: CurrentUser; request: ApiRequest; linked: boolean; accountType: MicrosoftAccountType | null; initialProjectId?: string; onCreated: (meeting: Meeting) => void;
}) {
  const [projects] = useRemote<MeetingProject[]>(() => getMeetingProjects(request), [request]);
  const [reason, setReason] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [duration, setDuration] = useState('60');
  const [joinUrl, setJoinUrl] = useState('');
  const personal = accountType === 'PERSONAL';
  const [projectId, setProjectId] = useState(initialProjectId ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [picked, setPicked] = useState<DirectoryUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState(false);
  const [members, setMembers] = useState<Remote<ProjectMember[]> | null>(null);

  useEffect(() => {
    if (initialProjectId) setProjectId(initialProjectId);
  }, [initialProjectId]);

  useEffect(() => {
    setSelected([]);
    setPicked([]);
    if (!projectId) { setMembers(null); return undefined; }
    let current = true;
    setMembers({ phase: 'loading' });
    getProjectMembers(request, projectId).then(
      (data) => { if (current) setMembers({ phase: 'ready', data: data.filter((m) => m.userId !== user.id) }); },
      (caught: unknown) => { if (current) setMembers({ phase: 'error', error: caught }); },
    );
    return () => { current = false; };
  }, [projectId, request, user.id]);

  const participantIds = projectId ? selected : picked.map((item) => item.id);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null); setCreated(false);
    const date = new Date(startsAt);
    if (Number.isNaN(date.getTime())) { setError(new Error('Indica una fecha y hora de inicio válidas.')); return; }
    const joinUrlError = personal ? validateJoinUrl(joinUrl) : null;
    if (joinUrlError) { setError(new Error(joinUrlError)); return; }
    setBusy(true);
    try {
      const meeting = await createMeeting(request, {
        reason: reason.trim(),
        startsAt: date.toISOString(),
        durationMinutes: Number(duration),
        projectId: projectId || null,
        participantIds,
        ...(personal ? { joinUrl: joinUrl.trim() } : {}),
      });
      setReason(''); setStartsAt(''); setJoinUrl(''); setSelected([]); setPicked([]); setCreated(true);
      onCreated(meeting);
    } catch (caught) { setError(caught); } finally { setBusy(false); }
  }

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <PanelCard title="Nueva reunión">
      <form onSubmit={submit} className="space-y-4">
        {!linked && <p className="text-sm text-navy/70">Vincula tu cuenta de Microsoft para poder crear reuniones.</p>}
        <Field label="Motivo" value={reason} maxLength={200} required onChange={(e) => setReason(e.target.value)} />
        <Field label="Inicio" type="datetime-local" value={startsAt} required onChange={(e) => setStartsAt(e.target.value)} hint="Se envía con tu zona horaria local." />
        <Field label="Duración (minutos)" type="number" min={5} max={480} value={duration} required onChange={(e) => setDuration(e.target.value)} />
        {personal && (
          <Field
            label="Enlace de la reunión"
            type="url"
            value={joinUrl}
            maxLength={MAX_JOIN_URL_LENGTH}
            required
            onChange={(e) => setJoinUrl(e.target.value)}
            hint="Enlace https:// a la sala (Teams gratis, Google Meet, Zoom…). Es obligatorio con cuenta personal."
          />
        )}
        <div className="space-y-2">
          <label htmlFor="meeting-project" className="block text-sm font-semibold">Proyecto</label>
          <select id="meeting-project" className={inputClassName} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Sin proyecto</option>
            {projects.phase === 'ready' && projects.data.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          {projects.phase === 'loading' && <LoadingState label="Cargando proyectos…" />}
          {projects.phase === 'error' && <ErrorNotice error={projects.error} />}
          <p className="text-sm text-navy/70">{projectId ? 'Los participantes se eligen entre los miembros del proyecto.' : 'Sin proyecto, puedes invitar a cualquier usuario activo.'}</p>
        </div>
        {!projectId && (canSearchUsers(user.roles) ? (
          <div className="space-y-3">
            <UserPicker
              request={request}
              label="Buscar participantes"
              hint="Escribe al menos 2 letras del nombre o del correo."
              excludeIds={[user.id, ...picked.map((item) => item.id)]}
              onSelect={(person) => setPicked((prev) => [...prev, person])}
            />
            {picked.length > 0 && (
              <ul aria-label="Participantes elegidos" className="divide-y divide-navy/10 rounded-lg border border-navy/15">
                {picked.map((person) => (
                  <li key={person.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0">{person.fullName} <span className="text-navy/70">({person.email})</span></span>
                    <Button variant="secondary" onClick={() => setPicked((prev) => prev.filter((item) => item.id !== person.id))}>Quitar a {person.fullName}</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : <p className="text-sm text-navy/70">Elige un proyecto para invitar a sus miembros.</p>)}
        {members?.phase === 'loading' && <LoadingState label="Cargando participantes…" />}
        {members?.phase === 'error' && <ErrorNotice error={members.error} />}
        {members?.phase === 'ready' && members.data.length === 0 && <EmptyState title="Sin participantes" description="El proyecto no tiene otros miembros activos para invitar." />}
        {members?.phase === 'ready' && members.data.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Participantes</legend>
            {members.data.map((m) => (
              <label key={m.userId} className="flex items-center gap-3 text-sm">
                <input type="checkbox" className="size-5" checked={selected.includes(m.userId)} onChange={() => toggle(m.userId)} />
                {m.fullName} <span className="text-navy/70">({m.email})</span>
              </label>
            ))}
          </fieldset>
        )}
        {error !== null && (error instanceof Error && error.name !== 'ApiError' ? <p role="alert" className="text-sm text-alert">{error.message}</p> : <ErrorNotice error={error} />)}
        {created && <p role="status" className="text-sm font-semibold">Reunión creada.</p>}
        <Button type="submit" disabled={busy || !linked || participantIds.length === 0 || !reason.trim() || !startsAt || (personal && !joinUrl.trim())}>
          <Video aria-hidden="true" className="size-5" />Crear reunión
        </Button>
      </form>
    </PanelCard>
  );
}

function MeetingDetail({ user, request, meetingId, onChanged }: { user: CurrentUser; request: ApiRequest; meetingId: string; onChanged: () => void }) {
  const [state, reload] = useRemote(() => getMeeting(request, meetingId), [request, meetingId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recording, setRecording] = useState('');

  useEffect(() => { if (state.phase === 'ready') setRecording(state.data.recordingUrl ?? ''); }, [state]);

  async function act(run: () => Promise<string | null>) {
    setBusy(true); setError(null); setNotice(null);
    try { setNotice(await run()); onChanged(); reload(); } catch (caught) { setError(caught); } finally { setBusy(false); }
  }

  const changeStatus = (status: 'IN_PROGRESS' | 'FINISHED') => act(async () => { await changeMeetingStatus(request, meetingId, status); return null; });

  const cancel = () => {
    if (!window.confirm('¿Cancelar esta reunión? Se avisará a los participantes.')) return;
    return act(async () => {
      const result = await changeMeetingStatus(request, meetingId, 'CANCELLED');
      return 'teamsSynced' in result && !result.teamsSynced ? 'La reunión se canceló, pero no se pudo cancelar el evento en Teams.' : null;
    });
  };

  const saveRecording = (event: FormEvent) => {
    event.preventDefault();
    return act(async () => { await setMeetingRecording(request, meetingId, recording.trim() || null); return null; });
  };

  return (
    <PanelCard title="Detalle de la reunión">
      {state.phase === 'loading' && <LoadingState label="Cargando reunión…" />}
      {state.phase === 'error' && <div className="space-y-4"><ErrorNotice error={state.error} /><Button variant="secondary" onClick={reload}>Reintentar</Button></div>}
      {state.phase === 'ready' && (() => {
        const m = state.data;
        const canManage = m.organizer.id === user.id || user.roles.includes('ADMIN');
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold">{m.reason}</h3>
              <p className="text-sm text-navy/70">{STATUS_LABELS[m.status]} · {formatDateTime(m.startsAt)} a {formatDateTime(m.endsAt)}</p>
            </div>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold">Organizador</dt><dd>{m.organizer.fullName}</dd></div>
              <div><dt className="font-semibold">Proyecto</dt><dd>{m.project?.title ?? 'Sin proyecto'}</dd></div>
              <div className="sm:col-span-2"><dt className="font-semibold">Participantes</dt><dd>{m.participants.length ? m.participants.map((p) => p.fullName).join(', ') : 'Ninguno'}</dd></div>
              {m.cancelledAt && <div><dt className="font-semibold">Cancelada el</dt><dd>{formatDateTime(m.cancelledAt)}</dd></div>}
            </dl>
            <div className="flex flex-wrap gap-3">
              {m.joinUrl && m.status !== 'CANCELLED' && <a href={m.joinUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-navy/30 bg-white px-4 py-2 font-semibold text-navy">Unirse a Teams<ExternalLink aria-hidden="true" className="size-4" /></a>}
              {m.recordingUrl && <a href={m.recordingUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-navy/30 bg-white px-4 py-2 font-semibold text-navy">Ver grabación<ExternalLink aria-hidden="true" className="size-4" /></a>}
            </div>
            {canManage && m.status !== 'CANCELLED' && (
              <div className="space-y-4 border-t border-navy/10 pt-4">
                <div className="flex flex-wrap gap-3">
                  {m.status === 'SCHEDULED' && <Button variant="secondary" disabled={busy} onClick={() => changeStatus('IN_PROGRESS')}>Marcar en proceso</Button>}
                  {m.status === 'IN_PROGRESS' && <Button variant="secondary" disabled={busy} onClick={() => changeStatus('FINISHED')}>Marcar finalizada</Button>}
                  {m.status !== 'FINISHED' && <Button variant="danger" disabled={busy} onClick={cancel}>Cancelar reunión</Button>}
                </div>
                <form onSubmit={saveRecording} className="flex flex-wrap items-end gap-3">
                  <div className="min-w-64 flex-1"><Field label="Enlace de la grabación" type="url" value={recording} onChange={(e) => setRecording(e.target.value)} hint="Opcional. Vacío borra el enlace." /></div>
                  <Button type="submit" disabled={busy}>Guardar enlace</Button>
                </form>
              </div>
            )}
            {notice && <p role="status" className="text-sm font-semibold">{notice}</p>}
            {error !== null && <ErrorNotice error={error} />}
          </div>
        );
      })()}
    </PanelCard>
  );
}
