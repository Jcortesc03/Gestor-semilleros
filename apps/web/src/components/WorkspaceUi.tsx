import { useId } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { AlertMessage } from './AlertMessage';
import { ApiError } from '../lib/api';

export const inputClassName = 'min-h-12 w-full rounded-lg border border-navy/50 bg-white px-3 py-2 text-base text-navy placeholder:text-navy/70 focus:outline-2 focus:outline-offset-2 focus:outline-navy disabled:cursor-not-allowed disabled:bg-canvas';

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const color = variant === 'primary' ? 'border-transparent bg-gold text-navy'
    : variant === 'danger' ? 'border-alert bg-alert text-white'
    : 'border-navy/30 bg-white text-navy';
  return <button type="button" {...props} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-4 py-2 font-semibold transition hover:-translate-y-0.5 active:translate-y-0 disabled:transform-none disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none ${color} ${className}`} />;
}

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const description = [props['aria-describedby'], hint ? `${id}-hint` : null].filter(Boolean).join(' ');
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      <input {...props} id={id} aria-describedby={description || undefined} className={`${inputClassName} ${props.className ?? ''}`} />
      {hint && <p id={`${id}-hint`} className="text-sm leading-relaxed text-navy/70">{hint}</p>}
    </div>
  );
}

export function PanelCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-navy/10 bg-white p-5 shadow-card sm:p-7">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-lg border border-dashed border-navy/30 bg-canvas/50 p-6"><p className="font-semibold">{title}</p><p className="mt-2 text-sm leading-relaxed text-navy/70">{description}</p></div>;
}

export function LoadingState({ label = 'Cargando información…' }: { label?: string }) {
  return <p role="status" className="flex items-center gap-3 py-6 text-sm text-navy/70"><LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />{label}</p>;
}

export function ErrorNotice({ error }: { error: unknown }) {
  return <AlertMessage message={error instanceof ApiError ? error.message : 'No pudimos completar la solicitud. Intenta de nuevo.'} />;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date);
}
