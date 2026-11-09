import type { WeekdayAnalytics } from './api.ts';
import { formatNumber, formatRate, weekdayLabel } from './labels.ts';

/**
 * Gráficos SVG sin dependencias. Solo usa los colores del sistema
 * (navy, navy-soft, gold, alert, canvas, paper); las series se
 * diferencian por relleno y por sus etiquetas, nunca solo por color.
 */
export const SERIES_COLORS = [
  'var(--color-navy)',
  'var(--color-gold)',
  'var(--color-navy-soft)',
  'var(--color-alert)',
  'var(--color-canvas)',
] as const;
const INK = 'var(--color-navy)';
const MUTED = 'var(--color-navy-soft)';
const GRID = 'var(--color-navy)';

function truncate(text: string, max = 26): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Tabla oculta para lectores de pantalla con los mismos valores del gráfico. */
function HiddenData({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: string[][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (cellIndex === 0
              ? <th key={cellIndex} scope="row">{cell}</th>
              : <td key={cellIndex}>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-navy" aria-hidden="true">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span className="inline-block size-3 rounded-sm border border-navy/30" style={{ backgroundColor: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export interface BarItem {
  label: string;
  /** Tasa 0..1 o `null` (sin denominador). */
  value: number | null;
}

/**
 * Ranking horizontal de una sola serie: tasas 0..1 (`rate`, escala fija al 100 %)
 * o conteos (`count`, escala al máximo de la lista).
 */
export function HorizontalBars({
  items,
  ariaLabel,
  caption,
  kind = 'rate',
  valueLabel = 'Finalización',
}: {
  items: BarItem[];
  ariaLabel: string;
  caption?: string;
  kind?: 'rate' | 'count';
  valueLabel?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value ?? 0));
  const format = (value: number | null) => (kind === 'rate' ? formatRate(value) : value === null ? '—' : formatNumber(value));
  const rowHeight = 36;
  const labelWidth = 190;
  const barMax = 300;
  const valueWidth = 90;
  const width = labelWidth + barMax + valueWidth + 20;
  const height = Math.max(1, items.length) * rowHeight + 8;
  return (
    <figure className="min-w-0">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={ariaLabel} className="h-auto w-full">
        <title>{ariaLabel}</title>
        {items.map((item, index) => {
          const y = index * rowHeight + 6;
          const ratio = item.value === null ? 0 : kind === 'rate' ? item.value : item.value / max;
          const barWidth = Math.max(0, Math.min(1, ratio)) * barMax;
          return (
            <g key={`${item.label}-${index}`}>
              <text x={0} y={y + 16} fontSize={13} fontWeight={600} fill={INK}>
                <title>{item.label}</title>
                {truncate(item.label)}
              </text>
              <rect x={labelWidth} y={y + 4} width={barMax} height={16} rx={4} fill="var(--color-canvas)" stroke={GRID} strokeOpacity={0.15} />
              {barWidth > 0 && <rect x={labelWidth} y={y + 4} width={barWidth} height={16} rx={4} fill={index === 0 ? 'var(--color-navy)' : 'var(--color-navy-soft)'} />}
              <text x={labelWidth + barMax + 10} y={y + 16} fontSize={13} fontWeight={700} fill={INK}>
                {format(item.value)}
              </text>
            </g>
          );
        })}
      </svg>
      <HiddenData
        caption={caption ?? ariaLabel}
        columns={['Nombre', valueLabel]}
        rows={items.map((item) => [item.label, format(item.value)])}
      />
      {items.length === 0 && <p className="text-sm text-navy/70">Sin datos para este ranking.</p>}
    </figure>
  );
}

export type WeekdayMetric = 'completions' | 'attachments' | 'activitiesCreated' | 'meetings';

export const WEEKDAY_METRICS: Array<{ key: WeekdayMetric; label: string }> = [
  { key: 'completions', label: 'Actividades hechas' },
  { key: 'attachments', label: 'Adjuntos creados' },
  { key: 'activitiesCreated', label: 'Actividades creadas' },
  { key: 'meetings', label: 'Reuniones iniciadas' },
];

/** Columnas de lunes a domingo para una serie seleccionable. */
export function WeekdayColumns({
  data,
  metric,
  ariaLabel,
  caption,
}: {
  data: WeekdayAnalytics[];
  metric: WeekdayMetric;
  ariaLabel: string;
  caption?: string;
}) {
  const ordered = [1, 2, 3, 4, 5, 6, 7].map((day) => data.find((item) => item.day === day) ?? null);
  const max = Math.max(1, ...ordered.map((item) => item?.[metric] ?? 0));
  const width = 560;
  const chartHeight = 200;
  const topPad = 30;
  const height = topPad + chartHeight + 30;
  const slot = width / 7;
  const barWidth = Math.min(44, slot * 0.55);
  return (
    <figure className="min-w-0">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={ariaLabel} className="h-auto w-full">
        <title>{ariaLabel}</title>
        <line x1={0} x2={width} y1={topPad + chartHeight} y2={topPad + chartHeight} stroke={GRID} strokeOpacity={0.25} />
        {ordered.map((item, index) => {
          const value = item?.[metric] ?? 0;
          const barHeight = (value / max) * chartHeight;
          const x = index * slot + (slot - barWidth) / 2;
          const y = topPad + chartHeight - barHeight;
          const day = index + 1;
          return (
            <g key={day}>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx={4} fill={day <= 5 ? 'var(--color-navy)' : 'var(--color-navy-soft)'} />
              <text x={x + barWidth / 2} y={Math.max(topPad - 8, y - 6)} fontSize={12} fontWeight={700} fill={INK} textAnchor="middle">
                {formatNumber(value)}
              </text>
              <text x={index * slot + slot / 2} y={topPad + chartHeight + 20} fontSize={12} fontWeight={600} fill={INK} textAnchor="middle">
                {weekdayLabel(day).slice(0, 3).toLowerCase()}
              </text>
            </g>
          );
        })}
      </svg>
      <HiddenData
        caption={caption ?? ariaLabel}
        columns={['Día', WEEKDAY_METRICS.find((item) => item.key === metric)?.label ?? metric]}
        rows={ordered.map((item, index) => [weekdayLabel(index + 1), formatNumber(item?.[metric] ?? 0)])}
      />
      <p className="mt-2 text-sm text-navy/70">Días de lunes a domingo, en la zona horaria institucional.</p>
    </figure>
  );
}

export interface LineSeries {
  label: string;
  values: number[];
}

/** Líneas mensuales con leyenda; los valores también van en una tabla oculta. */
export function LineChart({
  categories,
  series,
  ariaLabel,
  caption,
}: {
  categories: string[];
  series: LineSeries[];
  ariaLabel: string;
  caption?: string;
}) {
  const width = 640;
  const chartHeight = 220;
  const leftPad = 48;
  const rightPad = 12;
  const topPad = 16;
  const bottomPad = 34;
  const height = topPad + chartHeight + bottomPad;
  const plotWidth = width - leftPad - rightPad;
  const max = Math.max(1, ...series.flatMap((item) => item.values));
  const x = (index: number): number =>
    categories.length <= 1 ? leftPad + plotWidth / 2 : leftPad + (index / (categories.length - 1)) * plotWidth;
  const y = (value: number): number => topPad + chartHeight - (value / max) * chartHeight;
  const step = categories.length > 8 ? Math.ceil(categories.length / 8) : 1;
  return (
    <figure className="min-w-0">
      <Legend items={series.map((item, index) => ({ label: item.label, color: SERIES_COLORS[index % SERIES_COLORS.length] }))} />
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={ariaLabel} className="mt-3 h-auto w-full">
        <title>{ariaLabel}</title>
        {[0, 0.5, 1].map((fraction) => {
          const lineY = topPad + chartHeight - fraction * chartHeight;
          return (
            <g key={fraction}>
              <line x1={leftPad} x2={width - rightPad} y1={lineY} y2={lineY} stroke={GRID} strokeOpacity={0.12} />
              <text x={leftPad - 6} y={lineY + 4} fontSize={10} fill={MUTED} textAnchor="end">
                {formatNumber(max * fraction)}
              </text>
            </g>
          );
        })}
        {series.map((item, seriesIndex) => {
          const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
          const points = item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
          return (
            <g key={item.label}>
              <polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {item.values.map((value, index) => (
                <circle key={index} cx={x(index)} cy={y(value)} r={3.5} fill={color} stroke="var(--color-paper)" strokeWidth={1.5} />
              ))}
            </g>
          );
        })}
        {categories.map((category, index) =>
          index % step === 0 ? (
            <text key={category} x={x(index)} y={topPad + chartHeight + 20} fontSize={10} fontWeight={600} fill={INK} textAnchor="middle">
              {category}
            </text>
          ) : null,
        )}
      </svg>
      <HiddenData
        caption={caption ?? ariaLabel}
        columns={['Mes', ...series.map((item) => item.label)]}
        rows={categories.map((category, index) => [category, ...series.map((item) => formatNumber(item.values[index] ?? 0))])}
      />
      {categories.length === 0 && <p className="text-sm text-navy/70">Sin datos mensuales para este periodo.</p>}
    </figure>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
}

/** Dona de distribución con lista visible de valores (cuenta y porcentaje). */
export function Donut({ slices, ariaLabel, caption }: { slices: DonutSlice[]; ariaLabel: string; caption?: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const fraction = total > 0 ? slice.value / total : 0;
      const segment = { slice, fraction, start: offset };
      offset += fraction;
      return segment;
    });
  return (
    <figure className="min-w-0">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <div className="w-40 shrink-0">
          <svg viewBox="0 0 160 160" width="100%" role="img" aria-label={ariaLabel} className="h-auto w-full">
            <title>{ariaLabel}</title>
            <circle cx={80} cy={80} r={radius} fill="none" stroke="var(--color-canvas)" strokeWidth={26} />
            {segments.map((segment, index) => (
              <circle
                key={segment.slice.label}
                cx={80}
                cy={80}
                r={radius}
                fill="none"
                stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                strokeWidth={26}
                strokeDasharray={`${segment.fraction * circumference} ${circumference}`}
                strokeDashoffset={-segment.start * circumference}
                transform="rotate(-90 80 80)"
              />
            ))}
            <text x={80} y={76} fontSize={24} fontWeight={800} fill={INK} textAnchor="middle">
              {formatNumber(total)}
            </text>
            <text x={80} y={96} fontSize={11} fontWeight={600} fill={MUTED} textAnchor="middle">
              en total
            </text>
          </svg>
        </div>
        <ul className="min-w-0 flex-1 space-y-2 text-sm text-navy">
          {slices.map((slice, index) => (
            <li key={slice.label} className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 font-semibold">
                <span className="inline-block size-3 shrink-0 rounded-sm border border-navy/30" style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} aria-hidden="true" />
                <span className="break-words">{slice.label}</span>
              </span>
              <span className="shrink-0 font-bold">{formatNumber(slice.value)} ({total > 0 ? formatRate(slice.value / total) : '—'})</span>
            </li>
          ))}
        </ul>
      </div>
      <HiddenData
        caption={caption ?? ariaLabel}
        columns={['Categoría', 'Cantidad', 'Porcentaje']}
        rows={slices.map((slice) => [slice.label, formatNumber(slice.value), total > 0 ? formatRate(slice.value / total) : '—'])}
      />
    </figure>
  );
}
