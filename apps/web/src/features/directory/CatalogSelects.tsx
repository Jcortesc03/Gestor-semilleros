import { useCallback, useId } from 'react';
import type { ApiRequest } from '../../types/api.ts';
import { Button, ErrorNotice, LoadingState, inputClassName } from '../../components/WorkspaceUi.tsx';
import { listAreas, listFaculties } from './api.ts';
import type { AreaScope, FacultyScope } from './api.ts';
import { useCatalog } from './useCatalog.ts';

interface AreaSelectProps { request: ApiRequest; label?: string; value: string; onChange: (areaId: string) => void; required?: boolean; disabled?: boolean; scope?: AreaScope }

/** Selector de área cargado de `GET /api/areas`. */
export function AreaSelect({ request, label = 'Área', value, onChange, required = false, disabled = false, scope = 'all' }: AreaSelectProps) {
  const id = useId();
  const load = useCallback(() => listAreas(request, scope), [request, scope]);
  const [state, reload] = useCatalog(load);

  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">{label}</label>
      <select id={id} className={inputClassName} value={value} required={required} disabled={disabled || state.phase !== 'ready'} onChange={(event) => onChange(event.target.value)}>
        <option value="">{state.phase === 'loading' ? 'Cargando áreas…' : 'Seleccionar'}</option>
        {state.phase === 'ready' && state.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {state.phase === 'loading' && <LoadingState label="Cargando áreas…" />}
      {state.phase === 'error' && <div className="space-y-2"><ErrorNotice error={state.error} /><Button variant="secondary" onClick={reload}>Reintentar áreas</Button></div>}
      {state.phase === 'ready' && state.items.length === 0 && <p className="text-sm text-navy/70">{scope === 'managed' ? 'No tienes áreas asignadas.' : 'No hay áreas registradas.'}</p>}
    </div>
  );
}

interface FacultyMultiSelectProps { request: ApiRequest; label?: string; value: string[]; onChange: (facultyIds: string[]) => void; disabled?: boolean; scope?: FacultyScope }

/** Casillas de facultades cargadas de `GET /api/faculties`; la selección conserva el orden del catálogo. */
export function FacultyMultiSelect({ request, label = 'Facultades', value, onChange, disabled = false, scope = 'all' }: FacultyMultiSelectProps) {
  const load = useCallback(() => listFaculties(request, scope), [request, scope]);
  const [state, reload] = useCatalog(load);

  const toggle = (facultyId: string, checked: boolean) => {
    const next = checked ? [...value, facultyId] : value.filter((item) => item !== facultyId);
    onChange(state.phase === 'ready' ? state.items.map((item) => item.id).filter((item) => next.includes(item)) : next);
  };

  return (
    <fieldset className="min-w-0 space-y-2" aria-busy={state.phase === 'loading'}>
      <legend className="text-sm font-semibold text-navy">{label}</legend>
      {state.phase === 'loading' && <LoadingState label="Cargando facultades…" />}
      {state.phase === 'error' && <div className="space-y-2"><ErrorNotice error={state.error} /><Button variant="secondary" onClick={reload}>Reintentar facultades</Button></div>}
      {state.phase === 'ready' && state.items.length === 0 && <p className="text-sm text-navy/70">{scope === 'dean' ? 'No eres decano vigente de ninguna facultad.' : 'No hay facultades registradas.'}</p>}
      {state.phase === 'ready' && state.items.map((item) => (
        <label key={item.id} className="flex min-h-10 items-center gap-3 text-sm text-navy">
          <input type="checkbox" className="size-5" disabled={disabled} checked={value.includes(item.id)} onChange={(event) => toggle(item.id, event.target.checked)} />
          {item.name}
        </label>
      ))}
    </fieldset>
  );
}
