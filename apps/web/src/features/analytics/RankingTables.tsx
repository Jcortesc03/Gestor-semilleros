import { useMemo, useState } from 'react';
import type { AreaAnalytics, DeanAnalytics, FacultyAnalytics, TutorAnalytics } from './api.ts';
import { HorizontalBars } from './charts.tsx';
import { formatNumber, formatRate } from './labels.ts';
import { EmptyState } from '../../components/WorkspaceUi.tsx';
import { Pagination, useClientPagination } from '../../components/Pagination.tsx';

/** Filas por página de las tablas de la analítica (ADR 0017, paginación en el cliente). */
export const TABLE_PAGE_SIZE = 10;

type SortDirection = 'asc' | 'desc';

interface Column<T> {
  key: string;
  label: string;
  /** Valor ordenable; `null` siempre va al final. */
  value: (row: T) => number | string | null;
  render: (row: T) => string;
}

function SortableTable<T extends { id: string; name: string }>({
  rows,
  columns,
  caption,
  initialKey,
  label,
}: {
  rows: T[];
  columns: Array<Column<T>>;
  caption: string;
  initialKey: string;
  /** Nombre de la lista para la paginación («tutores», «decanos»). */
  label: string;
}) {
  const [sortKey, setSortKey] = useState(initialKey);
  const [direction, setDirection] = useState<SortDirection>('desc');

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const column = columns.find((item) => item.key === sortKey);
    if (!column) return 0;
    const valueA = column.value(a);
    const valueB = column.value(b);
    if (valueA === null && valueB === null) return a.name.localeCompare(b.name, 'es');
    if (valueA === null) return 1;
    if (valueB === null) return -1;
    const compared = typeof valueA === 'number' && typeof valueB === 'number'
      ? valueA - valueB
      : String(valueA).localeCompare(String(valueB), 'es');
    return direction === 'asc' ? compared : -compared;
  }), [rows, columns, sortKey, direction]);
  // Al reordenar o cambiar los datos se vuelve a la primera página.
  const paged = useClientPagination(sorted, TABLE_PAGE_SIZE, `${sortKey}:${direction}:${rows.length}`);

  const toggle = (key: string) => {
    if (key === sortKey) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Las tasas y conteos empiezan descendentes; el nombre, ascendente.
      setDirection(key === 'name' ? 'asc' : 'desc');
    }
  };

  return (
    <div className="min-w-0">
    <div className="min-w-0 overflow-x-auto">
      <table className="min-w-[44rem] w-full text-left text-sm text-navy">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b-2 border-navy/20">
            {columns.map((column) => {
              const active = column.key === sortKey;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="whitespace-nowrap px-2 py-3 font-bold"
                >
                  <button
                    type="button"
                    onClick={() => toggle(column.key)}
                    className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 font-bold text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy"
                    aria-label={`Ordenar por ${column.label.toLowerCase()}`}
                  >
                    {column.label}
                    <span aria-hidden="true">{active ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {paged.items.map((row) => (
            <tr key={row.id} className="border-b border-navy/10">
              {columns.map((column) => (
                <td key={column.key} className="min-w-0 break-words px-2 py-3">
                  {column.key === 'name' ? <span className="font-bold">{column.render(row)}</span> : column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      <Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onPageChange={paged.setPage} label={label} />
    </div>
  );
}

const rate = (value: number | null): string => formatRate(value);
const count = (value: number): string => formatNumber(value);

/** Ranking horizontal de facultades o áreas por tasa de finalización. */
export function FacultyAreaRanking({
  items,
  ariaLabel,
}: {
  items: Array<FacultyAnalytics | AreaAnalytics>;
  ariaLabel: string;
}) {
  if (items.length === 0) {
    return <EmptyState title="Sin datos en el ranking" description="No hay proyectos en este alcance para el periodo seleccionado." />;
  }
  return (
      <HorizontalBars
        items={items.map((item) => ({ label: item.name, value: item.completionRate }))}
        ariaLabel={ariaLabel}
        caption={`${ariaLabel}: tasa de finalización por nombre`}
      />
  );
}

/** Mínimo de actividades para entrar al ranking de finalización (evita el 100 % de 1 de 1). */
export const MIN_ACTIVITIES_FOR_RANKING = 5;
export const PEOPLE_RANKING_SIZE = 10;

interface RankablePerson {
  name: string;
  activities: number;
  completionRate: number | null;
  meetingsOrganized: number;
}

/** Top de finalización (con mínimo de actividades) y top de reuniones organizadas. */
export function rankPeople<T extends RankablePerson>(people: T[]): { completion: T[]; meetings: T[] } {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'es');
  const completion = people
    .filter((p) => p.completionRate !== null && p.activities >= MIN_ACTIVITIES_FOR_RANKING)
    .sort((a, b) => (b.completionRate as number) - (a.completionRate as number) || b.activities - a.activities || byName(a, b))
    .slice(0, PEOPLE_RANKING_SIZE);
  const meetings = people
    .filter((p) => p.meetingsOrganized > 0)
    .sort((a, b) => b.meetingsOrganized - a.meetingsOrganized || byName(a, b))
    .slice(0, PEOPLE_RANKING_SIZE);
  return { completion, meetings };
}

/** Dos rankings horizontales de una sola unidad cada uno, legibles con cualquier número de personas. */
export function PeopleRankings({ people, noun }: { people: RankablePerson[]; noun: 'tutor' | 'decano' }) {
  const { completion, meetings } = rankPeople(people);
  const plural = noun === 'tutor' ? 'tutores' : 'decanos';
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-2">
      <section className="min-w-0 space-y-3">
        <h3 className="text-sm font-bold text-navy">Mayor finalización</h3>
        {completion.length > 0
          ? <HorizontalBars
              items={completion.map((p) => ({ label: p.name, value: p.completionRate }))}
              ariaLabel={`${plural} con mayor tasa de finalización`}
            />
          : <p className="text-sm text-navy/70">Ningún {noun} tiene al menos {MIN_ACTIVITIES_FOR_RANKING} actividades en el periodo.</p>}
      </section>
      <section className="min-w-0 space-y-3">
        <h3 className="text-sm font-bold text-navy">Más reuniones organizadas</h3>
        {meetings.length > 0
          ? <HorizontalBars
              kind="count"
              valueLabel="Reuniones organizadas"
              items={meetings.map((p) => ({ label: p.name, value: p.meetingsOrganized }))}
              ariaLabel={`${plural} con más reuniones organizadas`}
            />
          : <p className="text-sm text-navy/70">Ningún {noun} organizó reuniones en el periodo.</p>}
      </section>
    </div>
  );
}

export function TutorsTable({ tutors }: { tutors: TutorAnalytics[] }) {
  if (tutors.length === 0) {
    return <EmptyState title="Sin tutores en el alcance" description="No hay tutores responsables de tableros en los proyectos filtrados." />;
  }
  const columns: Array<Column<TutorAnalytics>> = [
    { key: 'name', label: 'Tutor', value: (row) => row.name, render: (row) => row.name },
    { key: 'projects', label: 'Proyectos', value: (row) => row.projects, render: (row) => count(row.projects) },
    { key: 'boards', label: 'Tableros', value: (row) => row.boards, render: (row) => count(row.boards) },
    { key: 'activities', label: 'Actividades', value: (row) => row.activities, render: (row) => count(row.activities) },
    { key: 'done', label: 'Hechas', value: (row) => row.done, render: (row) => count(row.done) },
    { key: 'completionRate', label: 'Finalización', value: (row) => row.completionRate, render: (row) => rate(row.completionRate) },
    { key: 'onTimeRate', label: 'A tiempo', value: (row) => row.onTimeRate, render: (row) => rate(row.onTimeRate) },
    { key: 'approvalRate', label: 'Aprobación', value: (row) => row.approvalRate, render: (row) => rate(row.approvalRate) },
    { key: 'meetingsOrganized', label: 'Reuniones organizadas', value: (row) => row.meetingsOrganized, render: (row) => count(row.meetingsOrganized) },
    { key: 'meetingsAttended', label: 'Reuniones asistidas', value: (row) => row.meetingsAttended, render: (row) => count(row.meetingsAttended) },
  ];
  return <SortableTable rows={tutors} columns={columns} caption="Tutores con finalización, entregas a tiempo, aprobación y reuniones" initialKey="completionRate" label="tutores" />;
}

export function DeansTable({ deans }: { deans: DeanAnalytics[] }) {
  if (deans.length === 0) {
    return <EmptyState title="Sin decanos en el alcance" description="No hay decanos vigentes de las facultades presentes en los proyectos filtrados." />;
  }
  const columns: Array<Column<DeanAnalytics>> = [
    { key: 'name', label: 'Decano', value: (row) => row.name, render: (row) => row.name },
    { key: 'faculties', label: 'Facultades', value: (row) => row.faculties.join(', '), render: (row) => row.faculties.join(', ') },
    { key: 'projects', label: 'Proyectos', value: (row) => row.projects, render: (row) => count(row.projects) },
    { key: 'activities', label: 'Actividades', value: (row) => row.activities, render: (row) => count(row.activities) },
    { key: 'done', label: 'Hechas', value: (row) => row.done, render: (row) => count(row.done) },
    { key: 'completionRate', label: 'Finalización', value: (row) => row.completionRate, render: (row) => rate(row.completionRate) },
    { key: 'onTimeRate', label: 'A tiempo', value: (row) => row.onTimeRate, render: (row) => rate(row.onTimeRate) },
    { key: 'meetingsOrganized', label: 'Reuniones organizadas', value: (row) => row.meetingsOrganized, render: (row) => count(row.meetingsOrganized) },
    { key: 'meetingsAttended', label: 'Reuniones asistidas', value: (row) => row.meetingsAttended, render: (row) => count(row.meetingsAttended) },
  ];
  return <SortableTable rows={deans} columns={columns} caption="Decanos con finalización, entregas a tiempo y reuniones" initialKey="completionRate" label="decanos" />;
}
