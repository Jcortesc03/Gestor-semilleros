import type { ReactNode } from 'react';
import type { ProgressCounts, StatusCounts } from './api.ts';

export const STATUS_LABELS: Record<keyof StatusCounts, string> = { ACTIVE: 'Activos', FINISHED: 'Finalizados', CANCELLED: 'Cancelados' };
export const PROGRESS_LABELS: Record<keyof ProgressCounts, string> = { PENDING: 'Pendientes', IN_PROGRESS: 'En curso', DONE: 'Hechas', CANCELLED: 'Canceladas' };

export function percent(done: number, total: number): number {
  return total <= 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
}

/** Medidor accesible: el número va en texto; la barra es solo apoyo visual. */
export function Meter({ done, total, label, tone = 'light' }: { done: number; total: number; label: string; tone?: 'light' | 'dark' }) {
  const value = percent(done, total);
  const dark = tone === 'dark';
  return (
    <div className="min-w-0">
      <p className={`text-sm font-semibold ${dark ? 'text-white' : 'text-navy'}`}>
        {label}: {done} de {total} <span className={dark ? 'text-white/75' : 'text-navy/70'}>({value} %)</span>
      </p>
      <div aria-hidden="true" className={`mt-2 h-2 overflow-hidden rounded-full ${dark ? 'bg-white/20' : 'bg-navy/10'}`}>
        <div className={`h-full rounded-full ${dark ? 'bg-gold' : 'bg-navy'}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** Cifra editorial con etiqueta en texto. */
export function Figure({ value, label, tone = 'light', alert = false }: { value: number; label: string; tone?: 'light' | 'dark'; alert?: boolean }) {
  const dark = tone === 'dark';
  const color = alert && value > 0 ? (dark ? 'text-gold' : 'text-alert') : dark ? 'text-white' : 'text-navy';
  return (
    <div className="min-w-0">
      <dd className={`text-4xl font-extrabold leading-none tracking-tight ${color}`}>{value}</dd>
      <dt className={`mt-2 text-sm font-semibold ${dark ? 'text-white/80' : 'text-navy/70'}`}>{label}</dt>
    </div>
  );
}

/** Distribución como lista de texto con proporción; cada fila es legible sin color. */
export function Distribution<K extends string>({ counts, labels, total, tone = 'light' }: { counts: Record<K, number>; labels: Record<K, string>; total: number; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  const keys = Object.keys(labels) as K[];
  return (
    <ul className="space-y-3">
      {keys.map((key) => (
        <li key={key} className="min-w-0">
          <div className={`flex items-baseline justify-between gap-3 text-sm font-semibold ${dark ? 'text-white' : 'text-navy'}`}>
            <span>{labels[key]}</span><span>{counts[key]}</span>
          </div>
          <div aria-hidden="true" className={`mt-1.5 h-1.5 overflow-hidden rounded-full ${dark ? 'bg-white/20' : 'bg-navy/10'}`}>
            <div className={`h-full rounded-full ${dark ? 'bg-gold' : 'bg-navy'}`} style={{ width: `${percent(counts[key], total)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${dark ? 'text-gold' : 'text-navy/70'}`}>{children}</p>;
}

export const linkButton = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-base font-semibold transition hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transform-none motion-reduce:shadow-none active:translate-y-0';
