import { CircleAlert } from "lucide-react";

interface AlertMessageProps {
  message: string;
  /** Identificador para asociar el mensaje con los campos (`aria-describedby`). */
  id?: string;
  /** Variante visual opcional: "error" por defecto; "plain" sin tinte. */
  variant?: "error" | "plain";
}

/**
 * Mensaje de error legible y anunciado a lectores de pantalla.
 * Rojo #C1272D con negrita sobre fondo claro teñido (contraste AA).
 * Con `role="alert"` el mensaje se anuncia sin necesidad de foco.
 *
 * Receta: `flex items-start gap-3 rounded-xl border border-alert/30
 * bg-alert/10 px-4 py-3` + icono de línea `size-5 text-alert` +
 * texto `text-sm font-semibold leading-relaxed text-alert`.
 */
export function AlertMessage({ message, id, variant = "error" }: AlertMessageProps) {
  return (
    <div
      id={id}
      role="alert"
      className={
        variant === "error"
          ? "flex items-start gap-3 rounded-xl border border-alert/30 bg-alert/10 px-4 py-3"
          : "flex items-start gap-3 rounded-xl border border-navy/15 bg-canvas px-4 py-3"
      }
    >
      <CircleAlert
        aria-hidden="true"
        className={
          variant === "error"
            ? "mt-0.5 size-5 shrink-0 text-alert"
            : "mt-0.5 size-5 shrink-0 text-navy"
        }
        strokeWidth={1.75}
      />
      <p
        className={
          variant === "error"
            ? "text-sm font-semibold leading-relaxed text-alert"
            : "text-sm font-semibold leading-relaxed text-navy"
        }
      >
        {message}
      </p>
    </div>
  );
}
