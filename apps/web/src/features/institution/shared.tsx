import { useCallback, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, inputClassName } from '../../components/WorkspaceUi.tsx';

export interface NameFormValues { name: string; description: string }

/** Ejecuta una mutación y expone `busy` y el último error; devuelve si terminó bien. */
export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      setError(cause);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run };
}

interface NameFormProps {
  /** Texto del botón de envío. */
  submitLabel: string;
  initialName?: string;
  initialDescription?: string;
  /** Solo para áreas: muestra también la descripción. */
  withDescription?: boolean;
  busy: boolean;
  /** Devuelve `true` si la operación terminó bien; entonces el formulario se vacía si `clearOnSuccess`. */
  onSubmit: (values: NameFormValues) => Promise<boolean>;
  onCancel?: () => void;
  clearOnSuccess?: boolean;
  /** Etiqueta del campo de nombre (p. ej. «Nombre del área»). */
  nameLabel: string;
  descriptionLabel?: string;
}

/**
 * Formulario de nombre (y descripción opcional). Los campos tienen etiqueta visible;
 * si el nombre queda vacío tras recortar espacios, el foco vuelve al campo.
 */
export function NameForm({
  submitLabel, initialName = '', initialDescription = '', withDescription = false, busy, onSubmit, onCancel,
  clearOnSuccess = false, nameLabel, descriptionLabel = 'Descripción',
}: NameFormProps) {
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const descriptionId = `${baseId}-description`;
  const errorId = `${baseId}-error`;
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [missing, setMissing] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed === '') {
      setMissing(true);
      document.getElementById(nameId)?.focus();
      return;
    }
    setMissing(false);
    const ok = await onSubmit({ name: trimmed, description: withDescription ? description.trim() : '' });
    if (ok && clearOnSuccess) {
      setName('');
      setDescription('');
    }
  }

  return (
    <form className="grid min-w-0 gap-4" onSubmit={submit} noValidate>
      <div className="min-w-0 space-y-2">
        <label htmlFor={nameId} className="block text-sm font-semibold text-navy">{nameLabel}</label>
        <input
          id={nameId}
          type="text"
          className={inputClassName}
          value={name}
          maxLength={150}
          disabled={busy}
          required
          aria-required="true"
          aria-invalid={missing || undefined}
          aria-describedby={missing ? errorId : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        {missing && <p id={errorId} className="text-sm font-semibold text-alert">Escribe un nombre.</p>}
      </div>
      {withDescription && (
        <div className="min-w-0 space-y-2">
          <label htmlFor={descriptionId} className="block text-sm font-semibold text-navy">{descriptionLabel} <span className="font-normal text-navy/70">(opcional)</span></label>
          <textarea
            id={descriptionId}
            className={`${inputClassName} min-h-28`}
            value={description}
            maxLength={2000}
            disabled={busy}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>{busy ? 'Guardando…' : submitLabel}</Button>
        {onCancel && <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancelar</Button>}
      </div>
    </form>
  );
}

/** Confirmación en línea (sin diálogo nativo). El foco entra en «Cancelar». */
export function ConfirmAction({ message, confirmLabel, busy, onConfirm, onCancel }: {
  message: string; confirmLabel: string; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div role="group" aria-label="Confirmación" className="min-w-0 space-y-4 rounded-lg border border-alert/30 bg-alert/5 p-4">
      <p className="text-sm font-semibold leading-relaxed text-navy">{message}</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="danger" disabled={busy} onClick={onConfirm}>{busy ? 'Procesando…' : confirmLabel}</Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel} autoFocus>Cancelar</Button>
      </div>
    </div>
  );
}
