import { GraduationCap } from "lucide-react";

interface BrandMarkProps {
  /** "light" sobre fondos oscuros (azul marino); "dark" sobre fondos claros. */
  variant?: "light" | "dark";
}

/**
 * Marca del producto: icono de línea en contenedor circular dorado
 * junto al nombre real de la aplicación. Sin logotipos ajenos ni
 * nombres de instituciones inventados.
 */
export function BrandMark({ variant = "dark" }: BrandMarkProps) {
  const isLight = variant === "light";

  return (
    <span className="inline-flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-gold text-navy"
      >
        <GraduationCap className="size-6" strokeWidth={1.75} />
      </span>
      <span
        className={
          isLight
            ? "leading-tight text-white"
            : "leading-tight text-navy"
        }
      >
        <span className="block text-base font-bold tracking-tight">
          Gestor de Semilleros
        </span>
        <span
          className={
            isLight
              ? "block text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-gold"
              : "block text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-navy/70"
          }
        >
          Universitarios
        </span>
      </span>
    </span>
  );
}
