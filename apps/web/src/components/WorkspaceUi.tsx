import { useId } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { AlertMessage } from './AlertMessage';
import { ApiError } from '../lib/api';

/**
 * Campo de formulario: altura mínima 48 px, borde navy/50, foco
 * con outline navy de 2 px. El texto de ayuda usa navy/70 con
 * negrita en claves (ver DESIGN.md § Componentes).
 */
export const inputClassName = 'min-h-12 w-full rounded-lg border border-navy/50 bg-white px-3 py-2 text-base text-navy placeholder:text-navy/70 focus:border-navy focus:outline-2 focus:outline-offset-2 focus:outline-navy disabled:cursor-not-allowed disabled:bg-canvas disabled:text-navy/60';

/**
 * Botón del sistema: dorado sobre navy para la acción principal,
 * blanco con borde para la secundaria, rojo solo para el peligro.
 * Siempre 48 px de alto (objetivo táctil) y foco visible global.
 */
export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const color = variant === 'primary' ? 'border-transparent bg-gold text-navy'
    : variant === 'danger' ? 'border-alert bg-alert text-white'
    : 'border-navy/30 bg-white text-navy';
  return <button type="button" {...props} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-base font-semibold transition hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy motion-reduce:transform-none motion-reduce:shadow-none active:translate-y-0 disabled:transform-none disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none ${color} ${className}`} />;
}

/**
 * Campo con etiqueta visible y pista opcional: la etiqueta es el
 * nombre accesible; la pista se asocia con `aria-describedby`.
 */
export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const description = [props['aria-describedby'], hint ? `${id}-hint` : null].filter(Boolean).join(' ');
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">{label}</label>
      <input {...props} id={id} aria-describedby={description || undefined} className={`${inputClassName} ${props.className ?? ''}`} />
      {hint && <p id={`${id}-hint`} className="text-sm leading-relaxed text-navy/70">{hint}</p>}
    </div>
  );
}

/**
 * Tarjeta de contenido: contenedor blanco sobre beige, borde
 * navy/10 y sombra sutil. Título H2 en 700 y acción a la derecha.
 */
export function PanelCard({ title, children, action, className = '' }: { title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-navy/10 bg-white p-5 shadow-card sm:p-7 ${className}`}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="min-w-[min(100%,14rem)] flex-1 break-words text-xl font-bold tracking-tight text-navy">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * Estado vacío: borde discontinuo y fondo beige tenue para
 * distinguirlo de las tarjetas de contenido sin inventar datos.
 */
export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-dashed border-navy/30 bg-canvas/50 p-5 sm:p-6">
      <p className="font-semibold text-navy">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-navy/70">{description}</p>
    </div>
  );
}

/**
 * Carga con `role="status"`: el lector anuncia el texto sin mover
 * el foco. El giro se detiene con `prefers-reduced-motion`.
 */
export function LoadingState({ label = 'Cargando información…' }: { label?: string }) {
  return <p role="status" className="flex min-w-0 items-center gap-3 py-6 text-sm leading-relaxed text-navy/70"><LoaderCircle aria-hidden="true" className="size-5 shrink-0 animate-spin text-navy motion-reduce:animate-none" />{label}</p>;
}

/**
 * Error de una petición. Si el backend devolvió `errors` (validación),
 * se listan dentro del mismo `role="alert"` para que se anuncien juntos.
 */
export function ErrorNotice({ error }: { error: unknown }) {
  const message = error instanceof ApiError ? error.message : 'No pudimos completar la solicitud. Intenta de nuevo.';
  const errors = error instanceof ApiError ? error.errors ?? [] : [];
  if (errors.length === 0) return <AlertMessage message={message} />;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-alert/30 bg-alert/10 px-4 py-3">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-alert" strokeWidth={1.75} />
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-semibold leading-relaxed text-alert">{message}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-alert">
          {errors.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      </div>
    </div>
  );
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(date);
}
