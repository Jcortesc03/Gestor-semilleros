import { useCallback, useId, useState } from 'react';
import type { ApiRequest } from '../../types/api.ts';
import { Button, EmptyState, ErrorNotice, LoadingState, PanelCard, formatDate } from '../../components/WorkspaceUi.tsx';
import { UserPicker, listFaculties } from '../directory';
import type { DirectoryUser, Faculty } from '../directory';
import { useCatalog } from '../directory/useCatalog.ts';
import { assignFacultyDean, closeFacultyDean, createFaculty, deleteFaculty, listFacultyDeans, renameFaculty, type FacultyDean } from './api.ts';
import { ConfirmAction, NameForm, useMutation } from './shared.tsx';
import type { NameFormValues } from './shared.tsx';

/** Facultades y decanos (solo ADMIN). Los decanos se asignan y cierran en el panel de cada facultad. */
export function FacultiesPanel({ request }: { request: ApiRequest }) {
  const load = useCallback(() => listFaculties(request), [request]);
  const [state, reload] = useCatalog(load);
  const mutation = useMutation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deansId, setDeansId] = useState<string | null>(null);

  async function mutate(action: () => Promise<unknown>): Promise<boolean> {
    const ok = await mutation.run(action);
    if (ok) reload();
    return ok;
  }

  return (
    <PanelCard title="Facultades">
      <section aria-labelledby="faculties-create-title" className="mb-8 min-w-0">
        <h3 id="faculties-create-title" className="mb-4 text-base font-bold text-navy">Crear facultad</h3>
        <NameForm
          nameLabel="Nombre de la facultad"
          submitLabel="Crear facultad"
          clearOnSuccess
          busy={mutation.busy}
          onSubmit={({ name }: NameFormValues) => mutate(() => createFaculty(request, name))}
        />
      </section>

      {mutation.error !== null && <div className="mb-5"><ErrorNotice error={mutation.error} /></div>}

      {state.phase === 'loading' && <LoadingState label="Cargando facultades…" />}
      {state.phase === 'error' && (
        <div className="space-y-3">
          <ErrorNotice error={state.error} />
          <Button variant="secondary" onClick={reload}>Reintentar facultades</Button>
        </div>
      )}
      {state.phase === 'ready' && state.items.length === 0 && (
        <EmptyState title="No hay facultades registradas" description="Crea la primera facultad con el formulario de arriba." />
      )}
      {state.phase === 'ready' && state.items.length > 0 && (
        <ul className="space-y-4">
          {state.items.map((faculty) => (
            <li key={faculty.id} className="min-w-0 space-y-4 rounded-lg border border-navy/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="min-w-0 break-words text-lg font-bold text-navy">{faculty.name}</h3>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={mutation.busy} aria-expanded={editingId === faculty.id} aria-label={`Renombrar ${faculty.name}`}
                    onClick={() => setEditingId(editingId === faculty.id ? null : faculty.id)}>Renombrar</Button>
                  <Button variant="secondary" disabled={mutation.busy} aria-expanded={deansId === faculty.id} aria-label={`Decanos de ${faculty.name}`}
                    onClick={() => setDeansId(deansId === faculty.id ? null : faculty.id)}>Decanos</Button>
                  <Button variant="danger" disabled={mutation.busy} aria-label={`Eliminar ${faculty.name}`} onClick={() => setConfirmingId(faculty.id)}>Eliminar</Button>
                </div>
              </div>

              {editingId === faculty.id && (
                <NameForm
                  nameLabel="Nombre de la facultad"
                  submitLabel="Guardar nombre"
                  initialName={faculty.name}
                  busy={mutation.busy}
                  onCancel={() => setEditingId(null)}
                  onSubmit={async ({ name }) => {
                    const ok = await mutate(() => renameFaculty(request, faculty.id, name));
                    if (ok) setEditingId(null);
                    return ok;
                  }}
                />
              )}

              {confirmingId === faculty.id && (
                <ConfirmAction
                  message={`¿Eliminar la facultad «${faculty.name}»? Se borrará también su historial de decanos. Si tiene proyectos o novedades, el servidor no la eliminará.`}
                  confirmLabel="Sí, eliminar facultad"
                  busy={mutation.busy}
                  onCancel={() => setConfirmingId(null)}
                  onConfirm={async () => { if (await mutate(() => deleteFaculty(request, faculty.id))) setConfirmingId(null); }}
                />
              )}

              {deansId === faculty.id && <FacultyDeans request={request} faculty={faculty} />}
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

/** Historial de decanos de una facultad: el vigente destacado, asignación y cierre con confirmación. */
function FacultyDeans({ request, faculty }: { request: ApiRequest; faculty: Faculty }) {
  const headingId = useId();
  const load = useCallback(() => listFacultyDeans(request, faculty.id), [request, faculty.id]);
  const [state, reload] = useCatalog(load);
  const mutation = useMutation();
  const [candidate, setCandidate] = useState<DirectoryUser | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  async function mutate(action: () => Promise<unknown>): Promise<boolean> {
    const ok = await mutation.run(action);
    if (ok) reload();
    return ok;
  }

  const deans: FacultyDean[] = state.phase === 'ready' ? state.items : [];
  const current = deans.find((dean) => dean.endsAt === null) ?? null;

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-5 rounded-lg bg-canvas/60 p-4 sm:p-5">
      <h4 id={headingId} className="break-words text-base font-bold text-navy">Decanos de {faculty.name}</h4>

      {state.phase === 'loading' && <LoadingState label="Cargando decanos…" />}
      {state.phase === 'error' && (
        <div className="space-y-3">
          <ErrorNotice error={state.error} />
          <Button variant="secondary" onClick={reload}>Reintentar decanos</Button>
        </div>
      )}

      {state.phase === 'ready' && (
        <>
          {current ? (
            <div className="min-w-0 space-y-3 rounded-lg border-2 border-gold bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy/75">Decano vigente</p>
              <p className="break-words text-lg font-bold text-navy">{current.fullName}</p>
              <p className="break-all text-sm text-navy/75">{current.email}</p>
              <p className="text-sm text-navy/75">Desde {formatDate(current.startsAt)}</p>
              {confirmingClose ? (
                <ConfirmAction
                  message={`¿Cerrar el decanato de ${current.fullName}? La facultad quedará sin decano vigente. El historial se conserva.`}
                  confirmLabel="Sí, cerrar decanato"
                  busy={mutation.busy}
                  onCancel={() => setConfirmingClose(false)}
                  onConfirm={async () => { if (await mutate(() => closeFacultyDean(request, faculty.id))) setConfirmingClose(false); }}
                />
              ) : (
                <Button variant="secondary" disabled={mutation.busy} onClick={() => setConfirmingClose(true)}>Cerrar decanato</Button>
              )}
            </div>
          ) : (
            <p className="text-sm font-semibold leading-relaxed text-navy">Esta facultad no tiene decano vigente.</p>
          )}

          {deans.length > 0 && (
            <div className="min-w-0">
              <h5 className="mb-3 text-sm font-bold text-navy">Historial</h5>
              <ol className="space-y-2">
                {deans.map((dean) => (
                  <li key={dean.id} className={`min-w-0 rounded-lg p-3 text-sm ${dean.endsAt === null ? 'bg-white font-semibold text-navy' : 'bg-white/70 text-navy/80'}`}>
                    <span className="break-words">{dean.fullName}</span>{' '}
                    <span className="break-all text-navy/75">({dean.email})</span>
                    <span className="block text-navy/75">
                      {formatDate(dean.startsAt)} – {dean.endsAt === null ? 'vigente' : formatDate(dean.endsAt)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="min-w-0 space-y-4">
            <UserPicker
              request={request}
              label="Nuevo decano"
              role="DEAN"
              selected={candidate}
              disabled={mutation.busy}
              hint="El decanato vigente, si existe, se cerrará y quedará en el historial."
              onSelect={setCandidate}
              onClear={() => setCandidate(null)}
            />
            <Button
              disabled={!candidate || mutation.busy}
              onClick={() => {
                if (!candidate) return;
                const userId = candidate.id;
                void mutation.run(() => assignFacultyDean(request, faculty.id, userId)).then((ok) => {
                  if (ok) { setCandidate(null); reload(); }
                });
              }}
            >
              Asignar decano
            </Button>
          </div>
        </>
      )}
      {mutation.error !== null && <ErrorNotice error={mutation.error} />}
    </section>
  );
}
