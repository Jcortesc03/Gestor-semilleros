import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ApiRequest } from '../../types/api.ts';
import { Button, EmptyState, ErrorNotice, LoadingState, PanelCard } from '../../components/WorkspaceUi.tsx';
import type { AnalyticsData, AnalyticsFilterOptions, AnalyticsQuery } from './api.ts';
import { getAnalytics, getAnalyticsFilters } from './api.ts';
import { FilterBar } from './FilterBar.tsx';
import { KpiGrid } from './KpiGrid.tsx';
import { DeansTable, FacultyAreaRanking, MIN_ACTIVITIES_FOR_RANKING, PEOPLE_RANKING_SIZE, PeopleRankings, TutorsTable } from './RankingTables.tsx';
import { PatternsTable } from './PatternsTable.tsx';
import { Donut, LineChart, WeekdayColumns } from './charts.tsx';
import type { WeekdayMetric } from './charts.tsx';
import {
  ATTACHMENT_KIND_LABELS,
  DOCUMENT_FORMAT_LABELS,
  MEETING_STATUS_LABELS,
  PROGRESS_LABELS,
  RESULT_LABELS,
  addDays,
  formatBytes,
  formatDateRange,
  formatDecimal,
  formatNumber,
  monthLabel,
  toDateInputValue,
} from './labels.ts';

type OptionsState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: AnalyticsFilterOptions };

type DataState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: AnalyticsData };

function defaultQuery(): AnalyticsQuery {
  const now = new Date();
  return { from: toDateInputValue(addDays(now, -29)), to: toDateInputValue(now) };
}

function isEmpty(data: AnalyticsData): boolean {
  return (
    data.activities.total === 0
    && data.meetings.total === 0
    && data.attachments.total === 0
    && data.faculties.length === 0
    && data.areas.length === 0
    && data.tutors.length === 0
    && data.deans.length === 0
  );
}

const dateTime = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });

function generatedWhen(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : dateTime.format(date);
}

function Help({ children }: { children: string }) {
  return <p className="mt-4 text-sm leading-relaxed text-navy/70">{children}</p>;
}

export function AnalyticsWorkspace({ request }: { request: ApiRequest }) {
  const [query, setQuery] = useState<AnalyticsQuery>(defaultQuery);
  const [options, setOptions] = useState<OptionsState>({ status: 'loading' });
  const [state, setState] = useState<DataState>({ status: 'loading' });
  const [lastData, setLastData] = useState<AnalyticsData | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [weekdayMetric, setWeekdayMetric] = useState<WeekdayMetric>('completions');

  useEffect(() => {
    let active = true;
    setOptions({ status: 'loading' });
    getAnalyticsFilters(request).then(
      (data) => { if (active) setOptions({ status: 'ready', data }); },
      (error: unknown) => { if (active) setOptions({ status: 'error', error }); },
    );
    return () => { active = false; };
  }, [request]);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    getAnalytics(request, query).then(
      (data) => {
        if (active) {
          setState({ status: 'ready', data });
          setLastData(data);
        }
      },
      (error: unknown) => { if (active) setState({ status: 'error', error }); },
    );
    return () => { active = false; };
  }, [request, query, refreshTick]);

  const data = state.status === 'ready' ? state.data : lastData;
  const initialLoading = state.status === 'loading' && lastData === null;

  return (
    <div className="min-w-0 space-y-7">
      <header className="on-dark relative min-w-0 overflow-hidden rounded-xl bg-navy p-5 text-white sm:p-7">
        <div aria-hidden="true" className="texture-dots pointer-events-none absolute -right-10 -top-6 h-40 w-40 opacity-30" />
        <div className="relative min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Analítica institucional</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-3xl font-extrabold tracking-tight">Analítica de semilleros</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/85">
                Indicadores de usuarios, actividades, reuniones y adjuntos calculados por el backend en tu
                alcance. Ajusta el periodo y los filtros para comparar facultades, áreas, tutores y decanos.
              </p>
              {data && (
                <p className="mt-3 text-sm font-semibold text-white/80">
                  Periodo: {formatDateRange(data.period.from, data.period.to)} · Zona horaria: {data.timeZone} ·
                  Generado el <time dateTime={data.generatedAt}>{generatedWhen(data.generatedAt)}</time>
                </p>
              )}
            </div>
            <Button onClick={() => setRefreshTick((tick) => tick + 1)}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
              Actualizar
            </Button>
          </div>
          <div aria-hidden="true" className="hairline-gold mt-6" />
        </div>
      </header>

      {options.status === 'loading' && <LoadingState label="Cargando opciones de filtro…" />}
      {options.status === 'error' && <ErrorNotice error={options.error} />}
      {options.status === 'ready' && (
        <FilterBar
          options={options.data}
          value={query}
          onChange={setQuery}
          disabled={initialLoading}
          timeZone={data?.timeZone}
        />
      )}

      {initialLoading && <LoadingState label="Cargando analítica…" />}
      {state.status === 'error' && <ErrorNotice error={state.error} />}

      {state.status === 'loading' && data !== null && (
        <p role="status" className="text-sm font-semibold text-navy/70">Actualizando analítica…</p>
      )}

      {data !== null && isEmpty(data) && (
        <EmptyState
          title="Sin datos en este periodo"
          description="No hay actividades, reuniones ni adjuntos en el alcance y los filtros seleccionados. Prueba con un periodo más amplio o con menos filtros."
        />
      )}

      {data !== null && !isEmpty(data) && (
        <>
          <KpiGrid data={data} />
          <Help>
            {data.comparison
              ? `Las flechas comparan con el periodo anterior (${formatDateRange(data.comparison.previousPeriod.from, data.comparison.previousPeriod.to)}), de la misma duración y justo antes del actual.`
              : 'La comparación con el periodo anterior solo aparece cuando el periodo tiene fecha de inicio y de fin.'}
          </Help>

          <div className="grid min-w-0 gap-7 lg:grid-cols-2">
            <PanelCard title="Facultades por finalización">
              <FacultyAreaRanking items={data.faculties} ariaLabel="Tasa de finalización de actividades por facultad" />
              <Help>Ranking ordenado por el backend de mayor a menor finalización («—» cuando no hay actividades evaluables). Un proyecto de varias facultades cuenta en todas.</Help>
            </PanelCard>
            <PanelCard title="Áreas por finalización">
              <FacultyAreaRanking items={data.areas} ariaLabel="Tasa de finalización de actividades por área" />
              <Help>Ranking ordenado por el backend de mayor a menor finalización («—» cuando no hay actividades evaluables).</Help>
            </PanelCard>
          </div>

          <PanelCard title="Tutores: finalización y reuniones">
            {data.tutors.length > 0 && (
              <>
                <PeopleRankings people={data.tutors} noun="tutor" />
                <Help>{`Top ${PEOPLE_RANKING_SIZE} de cada ranking. En finalización solo entran tutores con al menos ${MIN_ACTIVITIES_FOR_RANKING} actividades en el periodo; la tabla de abajo los muestra a todos.`}</Help>
              </>
            )}
            <div className="mt-6">
              <TutorsTable tutors={data.tutors} />
            </div>
            <Help>Toca o haz clic en un encabezado de columna para ordenar la tabla; las tasas sin denominador se muestran como «—» y quedan al final.</Help>
          </PanelCard>

          <PanelCard title="Decanos: finalización y reuniones">
            {data.deans.length > 0 && (
              <>
                <PeopleRankings people={data.deans} noun="decano" />
                <Help>{`Top ${PEOPLE_RANKING_SIZE} de cada ranking. En finalización solo entran decanos con al menos ${MIN_ACTIVITIES_FOR_RANKING} actividades en el periodo; la tabla de abajo los muestra a todos.`}</Help>
              </>
            )}
            <div className="mt-6">
              <DeansTable deans={data.deans} />
            </div>
            <Help>Toca o haz clic en un encabezado de columna para ordenar la tabla; las tasas sin denominador se muestran como «—» y quedan al final.</Help>
          </PanelCard>

          <PanelCard
            title="Actividad por día de semana"
            action={
              <div className="min-w-0 space-y-2">
                <label htmlFor="analytics-weekday-metric" className="block text-sm font-semibold text-navy">Serie</label>
                <select
                  id="analytics-weekday-metric"
                  value={weekdayMetric}
                  onChange={(event) => setWeekdayMetric(event.target.value as WeekdayMetric)}
                  className="min-h-12 rounded-lg border border-navy/50 bg-white px-3 py-2 text-base text-navy focus:border-navy focus:outline-2 focus:outline-offset-2 focus:outline-navy"
                >
                  <option value="completions">Actividades hechas</option>
                  <option value="attachments">Adjuntos creados</option>
                  <option value="activitiesCreated">Actividades creadas</option>
                  <option value="meetings">Reuniones iniciadas</option>
                </select>
              </div>
            }
          >
            <WeekdayColumns
              data={data.weekdays}
              metric={weekdayMetric}
              ariaLabel={`Actividad por día de semana: ${weekdayMetric === 'completions' ? 'actividades hechas' : weekdayMetric === 'attachments' ? 'adjuntos creados' : weekdayMetric === 'activitiesCreated' ? 'actividades creadas' : 'reuniones iniciadas'}`}
            />
            <Help>Cambia la serie para ver cuándo se completan actividades, se crean adjuntos, se crean actividades o se inician reuniones.</Help>
          </PanelCard>

          <PanelCard title="Tendencia mensual">
            <LineChart
              categories={data.monthly.map((item) => monthLabel(item.month))}
              series={[
                { label: 'Actividades creadas', values: data.monthly.map((item) => item.activitiesCreated) },
                { label: 'Actividades hechas', values: data.monthly.map((item) => item.completions) },
                { label: 'Reuniones', values: data.monthly.map((item) => item.meetings) },
                { label: 'Adjuntos', values: data.monthly.map((item) => item.attachments) },
              ]}
              ariaLabel="Tendencia mensual de actividades creadas, actividades hechas, reuniones y adjuntos"
            />
            <Help>Cada línea es un conteo mensual; el eje vertical usa la misma escala para todas las series.</Help>
          </PanelCard>

          <PanelCard title="Distribuciones">
            <div className="grid min-w-0 gap-8 md:grid-cols-2 xl:grid-cols-3">
              <section aria-labelledby="dist-avance" className="min-w-0">
                <h3 id="dist-avance" className="mb-3 text-base font-bold text-navy">Actividades por avance</h3>
                <Donut
                  slices={Object.entries(data.activities.byProgress).map(([key, value]) => ({
                    label: PROGRESS_LABELS[key as keyof typeof PROGRESS_LABELS],
                    value,
                  }))}
                  ariaLabel="Distribución de actividades por avance"
                />
              </section>
              <section aria-labelledby="dist-resultado" className="min-w-0">
                <h3 id="dist-resultado" className="mb-3 text-base font-bold text-navy">Actividades por resultado</h3>
                <Donut
                  slices={Object.entries(data.activities.byResult).map(([key, value]) => ({
                    label: RESULT_LABELS[key as keyof typeof RESULT_LABELS],
                    value,
                  }))}
                  ariaLabel="Distribución de actividades por resultado"
                />
              </section>
              <section aria-labelledby="dist-reuniones" className="min-w-0">
                <h3 id="dist-reuniones" className="mb-3 text-base font-bold text-navy">Reuniones por estado</h3>
                <Donut
                  slices={Object.entries(data.meetings.byStatus).map(([key, value]) => ({
                    label: MEETING_STATUS_LABELS[key as keyof typeof MEETING_STATUS_LABELS],
                    value,
                  }))}
                  ariaLabel="Distribución de reuniones por estado"
                />
              </section>
              <section aria-labelledby="dist-adjuntos" className="min-w-0">
                <h3 id="dist-adjuntos" className="mb-3 text-base font-bold text-navy">Adjuntos por tipo</h3>
                <Donut
                  slices={Object.entries(data.attachments.byKind).map(([key, value]) => ({
                    label: ATTACHMENT_KIND_LABELS[key as keyof typeof ATTACHMENT_KIND_LABELS],
                    value,
                  }))}
                  ariaLabel="Distribución de adjuntos por tipo"
                />
              </section>
              <section aria-labelledby="dist-formatos" className="min-w-0">
                <h3 id="dist-formatos" className="mb-3 text-base font-bold text-navy">Documentos por formato</h3>
                <Donut
                  slices={Object.entries(data.attachments.byFormat).map(([key, value]) => ({
                    label: DOCUMENT_FORMAT_LABELS[key as keyof typeof DOCUMENT_FORMAT_LABELS],
                    value,
                  }))}
                  ariaLabel="Distribución de documentos por formato"
                />
              </section>
              <section aria-labelledby="dist-tableros" className="min-w-0">
                <h3 id="dist-tableros" className="mb-3 text-base font-bold text-navy">Tableros</h3>
                <p className="text-sm leading-relaxed text-navy/70">
                  {formatNumber(data.boards.total)} tableros en total, {formatNumber(data.boards.overdue)} vencidos.
                  De {formatNumber(data.boards.onTime.evaluated)} tableros terminados evaluados,{' '}
                  {formatNumber(data.boards.onTime.onTime)} llegaron a tiempo.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-navy/70">
                  Las reuniones suman {formatNumber(data.meetings.totalMinutes)} minutos en total
                  {data.meetings.avgParticipants !== null ? `, con un promedio de ${formatDecimal(data.meetings.avgParticipants)} participantes por reunión` : ''}.
                  Los documentos adjuntos suman {formatBytes(data.attachments.totalBytes)}.
                </p>
              </section>
            </div>
            <Help>Cada dona muestra conteos y porcentajes en texto; «Sin resultado» son actividades sin resultado registrado.</Help>
          </PanelCard>

          <PanelCard title="Patrones de éxito">
            <PatternsTable patterns={data.patterns} />
            <Help>En cada dimensión, el grupo con mayor finalización o mayor éxito lleva la etiqueta «Patrón con más éxito». Las tasas «—» no tienen denominador.</Help>
          </PanelCard>
        </>
      )}
    </div>
  );
}
