import { CircleAlert } from "lucide-react";

interface AlertMessageProps {
  message: string;
  /** Identificador para asociar el mensaje con los campos (`aria-describedby`). */
  id?: string;
}

/**
 * Mensaje de error legible y anunciado a lectores de pantalla.
 * Rojo #C1272D sobre fondo claro (contraste superior a 4.5:1).
 */
export function AlertMessage({ message, id }: AlertMessageProps) {
  return (
    <div
      id={id}
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-alert/30 bg-alert/10 px-4 py-3"
    >
      <CircleAlert
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-alert"
        strokeWidth={1.75}
      />
      <p className="text-sm font-semibold leading-relaxed text-alert">{message}</p>
    </div>
  );
}
