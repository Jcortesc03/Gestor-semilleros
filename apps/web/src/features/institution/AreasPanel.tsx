import { useCallback, useId, useState } from 'react';
import type { ApiRequest } from '../../types/api.ts';
import { Button, EmptyState, ErrorNotice, LoadingState, PanelCard, formatDate } from '../../components/WorkspaceUi.tsx';
import { UserPicker, listAreas } from '../directory';
import type { Area, DirectoryUser } from '../directory';
import { useCatalog } from '../directory/useCatalog.ts';
import { assignAreaManager, createArea, deleteArea, listAreaManagers, removeAreaManager, updateArea, type AreaManager } from './api.ts';
import { ConfirmAction, NameForm, useMutation } from './shared.tsx';
import type { NameFormValues } from './shared.tsx';

interface AreasPanelProps {
  request: ApiRequest;
  /** ADMIN: crear, eliminar y asignar encargados. Encargado de área: solo editar. */
  admin: boolean;
}

/**
 * Áreas: `GET /api/areas` para el administrador y `GET /api/areas?scope=managed` para el encargado
 * (ADR 0010 §9). Edición para ambos roles y gestión completa para el administrador.
 */
export function AreasPanel({ request, admin }: AreasPanelProps) {
  const load = useCallback(() => listAreas(request, admin ? 'all' : 'managed'), [request, admin]);
  const [state, reload] = useCatalog(load);
  const mutation = useMutation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [managersId, setManagersId] = useState<string | null>(null);

  /** Ejecuta la operación y, si sale bien, recarga la lista. */
  async function mutate(action: () => Promise<unknown>): Promise<boolean> {
    const ok = await mutation.run(action);
    if (ok) reload();
    return ok;
  }

  const create = ({ name, description }: NameFormValues) => mutate(() => createArea(request, {
    name,
    ...(description ? { description } : {}),
  }));

  return (
    <PanelCard title="Áreas">
      {admin ? (
        <section aria-labelledby="areas-create-title" className="mb-8 min-w-0">
          <h3 id="areas-create-title" className="mb-4 text-base font-bold text-navy">Crear área</h3>
          <NameForm
            nameLabel="Nombre del área"
            submitLabel="Crear área"
            withDescription
            clearOnSuccess
            busy={mutation.busy}
            onSubmit={create}
          />
        </section>
      ) : null}

      {mutation.error !== null && <div className="mb-5"><ErrorNotice error={mutation.error} /></div>}

      {state.phase === 'loading' && <LoadingState label="Cargando áreas…" />}
      {state.phase === 'error' && (
        <div className="space-y-3">
          <ErrorNotice error={state.error} />
          <Button variant="secondary" onClick={reload}>Reintentar áreas</Button>
        </div>
      )}
      {state.phase === 'ready' && state.items.length === 0 && (admin ? (
        <EmptyState title="No hay áreas registradas" description="Crea la primera área con el formulario de arriba." />
      ) : (
        <EmptyState title="No tienes áreas asignadas." description="Cuando el administrador te asigne un área, aparecerá aquí." />
      ))}
      {state.phase === 'ready' && state.items.length > 0 && (
        <ul className="space-y-4">
          {state.items.map((area) => (
            <li key={area.id} className="min-w-0 rounded-lg border border-navy/15 p-4">
              <AreaItem
                area={area}
                request={request}
                admin={admin}
                busy={mutation.busy}
                editing={editingId === area.id}
                confirming={confirmingId === area.id}
                managersOpen={managersId === area.id}
                onToggleEdit={() => setEditingId(editingId === area.id ? null : area.id)}
                onStopEdit={() => setEditingId(null)}
                onAskDelete={() => setConfirmingId(area.id)}
                onCancelDelete={() => setConfirmingId(null)}
                onDelete={async () => { if (await mutate(() => deleteArea(request, area.id))) setConfirmingId(null); }}
                onToggleManagers={() => setManagersId(managersId === area.id ? null : area.id)}
                onSave={async (values) => {
                  const ok = await mutate(() => updateArea(request, area.id, { name: values.name, description: values.description || null }));
                  if (ok) setEditingId(null);
                  return ok;
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

interface AreaItemProps {
  area: Area;
  request: ApiRequest;
  admin: boolean;
  busy: boolean;
  editing: boolean;
  confirming: boolean;
  managersOpen: boolean;
  onToggleEdit: () => void;
  onStopEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => Promise<void>;
  onToggleManagers: () => void;
  onSave: (values: NameFormValues) => Promise<boolean>;
}

function AreaItem({ area, request, admin, busy, editing, confirming, managersOpen, onToggleEdit, onStopEdit, onAskDelete, onCancelDelete, onDelete, onToggleManagers, onSave }: AreaItemProps) {
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-bold text-navy">{area.name}</h3>
          <p className="mt-1 break-words text-sm leading-relaxed text-navy/75">{area.description ?? 'Sin descripción'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} aria-expanded={editing} aria-label={`Editar ${area.name}`} onClick={onToggleEdit}>Editar</Button>
          {admin && <Button variant="secondary" disabled={busy} aria-expanded={managersOpen} aria-label={`Encargados de ${area.name}`} onClick={onToggleManagers}>Encargados</Button>}
          {admin && <Button variant="danger" disabled={busy} aria-label={`Eliminar ${area.name}`} onClick={onAskDelete}>Eliminar</Button>}
        </div>
      </div>

      {editing && (
        <NameForm
          nameLabel="Nombre del área"
          submitLabel="Guardar cambios"
          initialName={area.name}
          initialDescription={area.description ?? ''}
          withDescription
          busy={busy}
          onSubmit={onSave}
          onCancel={onStopEdit}
        />
      )}

      {confirming && (
        <ConfirmAction
          message={`¿Eliminar el área «${area.name}»? Si tiene proyectos o novedades, el servidor no la eliminará y mostrará el motivo.`}
          confirmLabel="Sí, eliminar área"
          busy={busy}
          onCancel={onCancelDelete}
          onConfirm={() => void onDelete()}
        />
      )}

      {managersOpen && admin && <AreaManagers request={request} areaId={area.id} areaName={area.name} />}
    </div>
  );
}

/** Encargados de un área (solo ADMIN): lista, quitar y añadir con el buscador de personas. */
function AreaManagers({ request, areaId, areaName }: { request: ApiRequest; areaId: string; areaName: string }) {
  const headingId = useId();
  const load = useCallback(() => listAreaManagers(request, areaId), [request, areaId]);
  const [state, reload] = useCatalog(load);
  const mutation = useMutation();
  const [candidate, setCandidate] = useState<DirectoryUser | null>(null);

  async function mutate(action: () => Promise<unknown>) {
    if (await mutation.run(action)) reload();
  }

  const managers: AreaManager[] = state.phase === 'ready' ? state.items : [];

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-5 rounded-lg bg-canvas/60 p-4 sm:p-5">
      <h4 id={headingId} className="break-words text-base font-bold text-navy">Encargados de {areaName}</h4>

      {state.phase === 'loading' && <LoadingState label="Cargando encargados…" />}
      {state.phase === 'error' && (
        <div className="space-y-3">
          <ErrorNotice error={state.error} />
          <Button variant="secondary" onClick={reload}>Reintentar encargados</Button>
        </div>
      )}
      {state.phase === 'ready' && managers.length === 0 && (
        <p className="text-sm leading-relaxed text-navy/75">Esta área no tiene encargados asignados.</p>
      )}
      {managers.length > 0 && (
        <ul className="space-y-3">
          {managers.map((manager) => (
            <li key={manager.userId} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3">
              <span className="min-w-0">
                <strong className="block break-words text-navy">{manager.fullName}</strong>
                <span className="block break-all text-sm text-navy/75">{manager.email}</span>
                <span className="block text-xs text-navy/70">Asignado el {formatDate(manager.assignedAt)}</span>
              </span>
              <Button
                variant="secondary"
                disabled={mutation.busy}
                aria-label={`Quitar a ${manager.fullName} como encargado`}
                onClick={() => void mutate(() => removeAreaManager(request, areaId, manager.userId))}
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="min-w-0 space-y-4">
        <UserPicker
          request={request}
          label="Añadir encargado"
          role="AREA_MANAGER"
          excludeIds={managers.map((manager) => manager.userId)}
          selected={candidate}
          disabled={mutation.busy}
          hint="Solo aparecen personas con el rol de encargado de área."
          onSelect={setCandidate}
          onClear={() => setCandidate(null)}
        />
        <Button
          disabled={!candidate || mutation.busy}
          onClick={() => {
            if (!candidate) return;
            const userId = candidate.id;
            void mutation.run(() => assignAreaManager(request, areaId, userId)).then((ok) => {
              if (ok) { setCandidate(null); reload(); }
            });
          }}
        >
          Asignar encargado
        </Button>
      </div>
      {mutation.error !== null && <ErrorNotice error={mutation.error} />}
    </section>
  );
}
