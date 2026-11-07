import { GraduationCap } from "lucide-react";

interface BrandMarkProps {
  /** "light" sobre fondos oscuros (azul marino); "dark" sobre fondos claros. */
  variant?: "light" | "dark";
  /** Tamaño del bloque: "md" por defecto; "sm" para cabeceras compactas. */
  size?: "sm" | "md";
}

/**
 * Marca del producto: icono de línea en contenedor circular dorado
 * junto al nombre real de la aplicación. Sin logotipos ajenos ni
 * nombres de instituciones inventados.
 *
 * Receta: `grid size-11 place-items-center rounded-full bg-gold
 * text-navy` + `GraduationCap size-6 strokeWidth 1.75`; el nombre
 * en 700 ajustado y el subtítulo en MAYÚSCULAS doradas sobre navy
 * o navy sobre claro (ver DESIGN.md).
 */
export function BrandMark({ variant = "dark", size = "md" }: BrandMarkProps) {
  const isLight = variant === "light";
  const isSm = size === "sm";

  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={
          isSm
            ? "grid size-9 shrink-0 place-items-center rounded-full bg-gold text-navy"
            : "grid size-11 shrink-0 place-items-center rounded-full bg-gold text-navy"
        }
      >
        <GraduationCap className={isSm ? "size-5" : "size-6"} strokeWidth={1.75} />
      </span>
      <span
        className={
          isLight
            ? "min-w-0 leading-tight text-white"
            : "min-w-0 leading-tight text-navy"
        }
      >
        <span className="block truncate text-base font-bold tracking-tight">
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
