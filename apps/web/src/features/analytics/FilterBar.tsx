import { useId } from 'react';
import type { ReactNode } from 'react';
import { Button, inputClassName } from '../../components/WorkspaceUi.tsx';
import type { AnalyticsFilterOptions, AnalyticsQuery, NamedItem, ProjectStatus } from './api.ts';
import { PROJECT_STATUSES } from './api.ts';
import { PROJECT_STATUS_LABELS, addDays, toDateInputValue } from './labels.ts';

interface FilterBarProps {
  options: AnalyticsFilterOptions;
  value: AnalyticsQuery;
  onChange: (next: AnalyticsQuery) => void;
  disabled?: boolean;
  timeZone?: string;
}

function SelectField({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName}
      >
        {children}
      </select>
    </div>
  );
}

function NamedOptions({ items }: { items: NamedItem[] }) {
  return (
    <>
      <option value="">Todos</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>{item.name}</option>
      ))}
    </>
  );
}

function today(): Date {
  return new Date();
}

/** Atajos de periodo: rangos inclusivos de días exactos hasta hoy. */
function shortcut(days: number): { from: string; to: string } {
  const now = today();
  return { from: toDateInputValue(addDays(now, -(days - 1))), to: toDateInputValue(now) };
}

export function FilterBar({ options, value, onChange, disabled = false, timeZone }: FilterBarProps) {
  const from = value.from ?? '';
  const to = value.to ?? '';
  const patch = (next: Partial<AnalyticsQuery>) => onChange({ ...value, ...next });

  const presets: Array<{ label: string; active: boolean; onPick: () => void }> = [
    { label: 'Últimos 30 días', active: false, onPick: () => patch(shortcut(30)) },
    { label: 'Últimos 90 días', active: false, onPick: () => patch(shortcut(90)) },
    {
      label: 'Este año',
      active: false,
      onPick: () => {
        const now = today();
        patch({ from: toDateInputValue(new Date(now.getFullYear(), 0, 1)), to: toDateInputValue(now) });
      },
    },
    { label: 'Todo', active: from === '' && to === '', onPick: () => patch({ from: null, to: null }) },
  ];
  // Marcar el atajo activo cuando el rango coincide con el actual.
  const marked = presets.map((preset) => {
    if (preset.label === 'Últimos 30 días') return { ...preset, active: from === shortcut(30).from && to === shortcut(30).to };
    if (preset.label === 'Últimos 90 días') return { ...preset, active: from === shortcut(90).from && to === shortcut(90).to };
    if (preset.label === 'Este año') {
      const now = today();
      return {
        ...preset,
        active: from === toDateInputValue(new Date(now.getFullYear(), 0, 1)) && to === toDateInputValue(now),
      };
    }
    return preset;
  });

  const hasFilters = Boolean(
    from || to || value.areaId || value.facultyId || value.projectId || value.tutorId || value.projectStatus,
  );

  return (
    <form
      aria-label="Filtros de analítica"
      className="min-w-0 rounded-xl border border-navy/10 bg-white p-5 shadow-card sm:p-7"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="min-w-0 space-y-5">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <label htmlFor="analytics-from" className="block text-sm font-semibold text-navy">Desde</label>
            <input
              id="analytics-from"
              type="date"
              value={from}
              disabled={disabled}
              onChange={(event) => patch({ from: event.target.value === '' ? null : event.target.value })}
              className={inputClassName}
            />
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="analytics-to" className="block text-sm font-semibold text-navy">Hasta</label>
            <input
              id="analytics-to"
              type="date"
              value={to}
              disabled={disabled}
              onChange={(event) => patch({ to: event.target.value === '' ? null : event.target.value })}
              className={inputClassName}
            />
          </div>
        </div>
        <p className="text-sm leading-relaxed text-navy/70">
          Las fechas son inclusivas y se interpretan en la zona horaria institucional
          {timeZone ? ` (${timeZone})` : ''}. El periodo se aplica a la creación de actividades y adjuntos,
          a la finalización de entregas y al inicio de reuniones.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Atajos de periodo">
          {marked.map((preset) => (
            <Button
              key={preset.label}
              variant="secondary"
              disabled={disabled}
              aria-pressed={preset.active}
              onClick={preset.onPick}
              className={preset.active ? 'border-navy bg-navy text-white' : undefined}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField
            label="Área"
            value={value.areaId ?? ''}
            disabled={disabled}
            onChange={(next) => patch({ areaId: next === '' ? null : next })}
          >
            <NamedOptions items={options.areas} />
          </SelectField>
          <SelectField
            label="Facultad"
            value={value.facultyId ?? ''}
            disabled={disabled}
            onChange={(next) => patch({ facultyId: next === '' ? null : next })}
          >
            <NamedOptions items={options.faculties} />
          </SelectField>
          <SelectField
            label="Proyecto"
            value={value.projectId ?? ''}
            disabled={disabled}
            onChange={(next) => patch({ projectId: next === '' ? null : next })}
          >
            <NamedOptions items={options.projects} />
          </SelectField>
          <SelectField
            label="Tutor"
            value={value.tutorId ?? ''}
            disabled={disabled}
            onChange={(next) => patch({ tutorId: next === '' ? null : next })}
          >
            <NamedOptions items={options.tutors} />
          </SelectField>
          <SelectField
            label="Estado del proyecto"
            value={value.projectStatus ?? ''}
            disabled={disabled}
            onChange={(next) => patch({ projectStatus: next === '' ? null : (next as ProjectStatus) })}
          >
            <option value="">Todos</option>
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>{PROJECT_STATUS_LABELS[status]}</option>
            ))}
          </SelectField>
          <div className="flex min-w-0 items-end">
            <Button
              variant="secondary"
              disabled={disabled || !hasFilters}
              onClick={() => onChange({ from: null, to: null, areaId: null, facultyId: null, projectId: null, tutorId: null, projectStatus: null })}
              className="w-full"
            >
              Limpiar filtros
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
