import { useId } from 'react';
import type { ReactNode } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { Button, inputClassName } from '../../components/WorkspaceUi.tsx';
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, addDays, toDateInputValue } from '../analytics';
import type { AnalyticsFilterOptions, NamedItem, ProjectStatus } from '../analytics';
import { AI_DEPTHS, AI_FOCUSES, AI_STYLES, defaultAiForm } from './api.ts';
import type { AiDepth, AiFocus, AiFormState, AiLimits, AiPerspective, AiStyle } from './api.ts';
import { DEPTH_LABELS, FOCUS_LABELS, STYLE_LABELS } from './labels.ts';

interface AiConfigFormProps {
  value: AiFormState;
  onChange: (next: AiFormState) => void;
  onSubmit: () => void;
  options: AnalyticsFilterOptions | null;
  limits: AiLimits;
  perspectives: Array<{ value: AiPerspective; label: string }>;
  configured: boolean;
  busy: boolean;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">{label}</label>
      {children(id)}
      {hint && <p className="text-sm leading-relaxed text-navy/70">{hint}</p>}
    </div>
  );
}

function NamedSelect({ label, value, items, disabled, onChange }: {
  label: string; value: string; items: NamedItem[]; disabled: boolean; onChange: (next: string) => void;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={inputClassName}>
          <option value="">Todos</option>
          {items.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      )}
    </Field>
  );
}

function NumberField({ label, value, min, max, disabled, hint, onChange }: {
  label: string; value: number; min: number; max: number; disabled: boolean; hint?: string; onChange: (next: number) => void;
}) {
  return (
    <Field label={label} hint={hint ?? `Entre ${min} y ${max}.`}>
      {(id) => (
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (event.target.value !== '' && Number.isFinite(parsed)) onChange(Math.trunc(parsed));
          }}
          className={inputClassName}
        />
      )}
    </Field>
  );
}

function Toggle({ label, checked, disabled, onChange }: {
  label: string; checked: boolean; disabled: boolean; onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 min-w-0 items-center gap-3 rounded-lg border border-navy/20 px-3 py-2 text-sm font-semibold text-navy">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="size-5 shrink-0 accent-navy" />
      <span className="min-w-0">{label}</span>
    </label>
  );
}

function GroupTitle({ children }: { children: string }) {
  return <h3 className="text-base font-bold tracking-tight text-navy">{children}</h3>;
}

export function AiConfigForm({ value, onChange, onSubmit, options, limits, perspectives, configured, busy }: AiConfigFormProps) {
  const questionId = useId();
  const patch = (next: Partial<AiFormState>) => onChange({ ...value, ...next });
  const disabled = busy;

  const periodPresets: Array<{ label: string; range: () => { from: string; to: string } }> = [
    { label: 'Últimos 30 días', range: () => ({ from: toDateInputValue(addDays(new Date(), -29)), to: toDateInputValue(new Date()) }) },
    { label: 'Últimos 90 días', range: () => ({ from: toDateInputValue(addDays(new Date(), -89)), to: toDateInputValue(new Date()) }) },
    { label: 'Este año', range: () => ({ from: toDateInputValue(new Date(new Date().getFullYear(), 0, 1)), to: toDateInputValue(new Date()) }) },
  ];

  function toggleFocus(focus: AiFocus) {
    const selected = value.focuses.includes(focus);
    if (selected) {
      // Siempre debe quedar al menos un enfoque.
      if (value.focuses.length > 1) patch({ focuses: value.focuses.filter((entry) => entry !== focus) });
    } else if (value.focuses.length < limits.maxFocuses) {
      patch({ focuses: [...value.focuses, focus] });
    }
  }

  const focusLimitReached = value.focuses.length >= limits.maxFocuses;

  return (
    <form
      aria-label="Configuración del asistente de IA"
      className="min-w-0 space-y-8"
      onSubmit={(event) => { event.preventDefault(); if (configured && !busy) onSubmit(); }}
    >
      <fieldset className="min-w-0 space-y-5 border-0 p-0" disabled={disabled}>
        <legend className="mb-3"><GroupTitle>Datos</GroupTitle></legend>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field label="Desde">
            {(id) => <input id={id} type="date" value={value.from} max={value.to || undefined} onChange={(event) => patch({ from: event.target.value })} className={inputClassName} />}
          </Field>
          <Field label="Hasta">
            {(id) => <input id={id} type="date" value={value.to} min={value.from || undefined} onChange={(event) => patch({ to: event.target.value })} className={inputClassName} />}
          </Field>
        </div>
        <p className="text-sm leading-relaxed text-navy/70">
          El periodo admite como máximo 366 días. Sin fechas se analizan todos los datos de tu alcance.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Atajos de periodo">
          {periodPresets.map((preset) => {
            const range = preset.range();
            const active = value.from === range.from && value.to === range.to;
            return (
              <Button key={preset.label} variant="secondary" aria-pressed={active} onClick={() => patch(range)} className={active ? 'border-navy bg-navy text-white' : undefined}>
                {preset.label}
              </Button>
            );
          })}
          <Button variant="secondary" aria-pressed={value.from === '' && value.to === ''} onClick={() => patch({ from: '', to: '' })} className={value.from === '' && value.to === '' ? 'border-navy bg-navy text-white' : undefined}>
            Sin periodo
          </Button>
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NamedSelect label="Área" value={value.areaId} items={options?.areas ?? []} disabled={disabled || !options} onChange={(areaId) => patch({ areaId })} />
          <NamedSelect label="Facultad" value={value.facultyId} items={options?.faculties ?? []} disabled={disabled || !options} onChange={(facultyId) => patch({ facultyId })} />
          <NamedSelect label="Proyecto" value={value.projectId} items={options?.projects ?? []} disabled={disabled || !options} onChange={(projectId) => patch({ projectId })} />
          <NamedSelect label="Tutor" value={value.tutorId} items={options?.tutors ?? []} disabled={disabled || !options} onChange={(tutorId) => patch({ tutorId })} />
          <Field label="Estado del proyecto">
            {(id) => (
              <select id={id} value={value.projectStatus} onChange={(event) => patch({ projectStatus: event.target.value as ProjectStatus | '' })} className={inputClassName}>
                <option value="">Todos</option>
                {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{PROJECT_STATUS_LABELS[status]}</option>)}
              </select>
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="min-w-0 space-y-5 border-0 p-0" disabled={disabled}>
        <legend className="mb-3"><GroupTitle>Análisis</GroupTitle></legend>
        <div className="min-w-0 space-y-2">
          <p id="ai-focus-label" className="text-sm font-semibold text-navy">
            Enfoques <span className="font-normal text-navy/70">({value.focuses.length} de {limits.maxFocuses} como máximo)</span>
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="ai-focus-label">
            {AI_FOCUSES.map((focus) => {
              const selected = value.focuses.includes(focus);
              const blocked = !selected && focusLimitReached;
              return (
                <label
                  key={focus}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-navy ${selected ? 'border-navy bg-navy text-white' : 'border-navy/30 text-navy hover:bg-canvas'} ${blocked ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <input type="checkbox" checked={selected} disabled={blocked} onChange={() => toggleFocus(focus)} className="sr-only" />
                  {FOCUS_LABELS[focus]}
                </label>
              );
            })}
          </div>
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Profundidad">
            {(id) => (
              <select id={id} value={value.depth} onChange={(event) => patch({ depth: event.target.value as AiDepth })} className={inputClassName}>
                {AI_DEPTHS.map((depth) => <option key={depth} value={depth}>{DEPTH_LABELS[depth]}</option>)}
              </select>
            )}
          </Field>
          <Field label="Estilo">
            {(id) => (
              <select id={id} value={value.style} onChange={(event) => patch({ style: event.target.value as AiStyle })} className={inputClassName}>
                {AI_STYLES.map((style) => <option key={style} value={style}>{STYLE_LABELS[style]}</option>)}
              </select>
            )}
          </Field>
          {perspectives.length > 1 && (
            <Field label="Perspectiva" hint="Con «Automática» el backend elige según tus roles.">
              {(id) => (
                <select id={id} value={value.perspective} onChange={(event) => patch({ perspective: event.target.value as AiPerspective | '' })} className={inputClassName}>
                  <option value="">Automática</option>
                  {perspectives.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                </select>
              )}
            </Field>
          )}
          <NumberField
            label="Número de recomendaciones"
            value={value.maxRecommendations}
            min={limits.minRecommendations}
            max={limits.maxRecommendations}
            disabled={disabled}
            onChange={(maxRecommendations) => patch({ maxRecommendations })}
          />
        </div>

        <details className="min-w-0 rounded-lg border border-navy/15 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">Opciones avanzadas</summary>
          <div className="mt-4 min-w-0 space-y-5">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <NumberField
                label="Tamaño de los rankings: mejores y peores N"
                value={value.rankingSize}
                min={limits.minRankingSize}
                max={limits.maxRankingSize}
                disabled={disabled}
                hint={`Entre ${limits.minRankingSize} y ${limits.maxRankingSize}. Con 0 no se incluyen rankings.`}
                onChange={(rankingSize) => patch({ rankingSize })}
              />
              <NumberField
                label="Muestra mínima de actividades"
                value={value.minSample}
                min={limits.minSample}
                max={limits.maxSample}
                disabled={disabled}
                hint="Los grupos con menos actividades se excluyen de los rankings."
                onChange={(minSample) => patch({ minSample })}
              />
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Toggle label="Comparar con el periodo anterior" checked={value.includeComparison} disabled={disabled} onChange={(includeComparison) => patch({ includeComparison })} />
              <Toggle label="Serie mensual" checked={value.includeMonthly} disabled={disabled} onChange={(includeMonthly) => patch({ includeMonthly })} />
              <Toggle label="Días de la semana" checked={value.includeWeekdays} disabled={disabled} onChange={(includeWeekdays) => patch({ includeWeekdays })} />
              <Toggle label="Seudonimizar nombres de personas antes de enviarlos" checked={value.anonymize} disabled={disabled} onChange={(anonymize) => patch({ anonymize })} />
            </div>
            <p className="text-sm leading-relaxed text-navy/70">La comparación con el periodo anterior solo tiene efecto si indicas «Desde» y «Hasta».</p>
          </div>
        </details>

        <div className="min-w-0 space-y-2">
          <label htmlFor={questionId} className="block text-sm font-semibold text-navy">Pregunta específica (opcional)</label>
          <textarea
            id={questionId}
            rows={3}
            maxLength={limits.questionMaxLength}
            value={value.question}
            onChange={(event) => patch({ question: event.target.value })}
            aria-describedby={`${questionId}-count`}
            className={inputClassName}
          />
          <p id={`${questionId}-count`} className="text-right text-sm text-navy/70">{value.question.length} / {limits.questionMaxLength}</p>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!configured || busy} aria-busy={busy}>
          {busy
            ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
            : <Sparkles aria-hidden="true" className="size-4" />}
          {busy ? 'Generando…' : 'Generar recomendaciones'}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => onChange(defaultAiForm())}>Restablecer</Button>
      </div>
    </form>
  );
}
