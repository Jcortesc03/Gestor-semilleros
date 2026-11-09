import { useId, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import { Eye, EyeOff, KeyRound, LogOut } from "lucide-react";
import type { ApiRequest } from "../types/api";
import { Button, ErrorNotice, inputClassName } from "../components/WorkspaceUi";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  changeOwnPassword,
  validatePasswordChange,
} from "../services/password";
import type { PasswordField, PasswordFieldErrors } from "../services/password";

interface ChangePasswordBaseProps {
  /** Correo del usuario (la contraseña no puede coincidir con él). */
  email: string;
  request: ApiRequest;
  /** Se llama tras un cambio correcto; el padre decide qué hacer a continuación. */
  onChanged: () => void;
}

type ChangePasswordPageProps = ChangePasswordBaseProps & (
  | {
      /** Contraseña temporal: sin cancelar; solo se puede cambiar o cerrar sesión. */
      mode: "required";
      onSignOut: () => void;
    }
  | {
      /** Cambio voluntario desde la cuenta. */
      mode: "voluntary";
      onCancel: () => void;
    }
);

interface PasswordFieldProps {
  id: string;
  label: string;
  /** Nombre del campo para los botones de mostrar/ocultar, p. ej. "la nueva contraseña". */
  toggleName: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  error?: string;
  hint?: string;
  autoComplete: string;
  inputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
}

function PasswordField({ id, label, toggleName, value, onChange, visible, onToggle, error, hint, autoComplete, inputRef, disabled }: PasswordFieldProps) {
  const hintId = useId();
  const errorId = useId();
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">{label}</label>
      {hint && <p id={hintId} className="text-sm leading-relaxed text-navy/70">{hint}</p>}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className={`${inputClassName} pr-14`}
        />
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={visible}
          aria-label={`${visible ? "Ocultar" : "Mostrar"} ${toggleName}`}
          className="absolute right-1 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-lg text-navy/70 transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:cursor-not-allowed disabled:opacity-60"
        >
          {visible
            ? <EyeOff aria-hidden="true" className="size-5" strokeWidth={1.75} />
            : <Eye aria-hidden="true" className="size-5" strokeWidth={1.75} />}
        </button>
      </div>
      {error && <p id={errorId} className="text-sm font-semibold leading-relaxed text-alert">{error}</p>}
    </div>
  );
}

/**
 * Formulario de cambio de contraseña propia (`PUT /api/me/password`, ADR 0011).
 *
 * - `required`: contraseña temporal; la actual es obligatoria y no hay botón de cancelar.
 * - `voluntary`: la actual es obligatoria solo si el usuario ya tiene contraseña; el
 *   backend lo decide, así que aquí se envía únicamente si se escribe.
 */
export function ChangePasswordPage(props: ChangePasswordPageProps) {
  const { mode, email, request, onChanged } = props;
  const requireCurrent = mode === "required";
  const idPrefix = useId();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmation: false,
  });
  const [fieldErrors, setFieldErrors] = useState<PasswordFieldErrors>({});
  const [submitError, setSubmitError] = useState<unknown>(undefined);
  const [pending, setPending] = useState(false);

  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const refs: Record<PasswordField, RefObject<HTMLInputElement | null>> = {
    currentPassword: currentRef,
    newPassword: newRef,
    confirmation: confirmationRef,
  };

  function toggle(field: PasswordField) {
    setVisible((state) => ({ ...state, [field]: !state[field] }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const errors = validatePasswordChange(
      { email, currentPassword, newPassword, confirmation },
      requireCurrent,
    );
    setFieldErrors(errors);
    setSubmitError(undefined);

    const firstInvalid = (["currentPassword", "newPassword", "confirmation"] as const).find((field) => errors[field] !== undefined);
    if (firstInvalid !== undefined) {
      refs[firstInvalid].current?.focus();
      return;
    }

    setPending(true);
    try {
      await changeOwnPassword(request, {
        currentPassword: currentPassword === "" ? undefined : currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      onChanged();
    } catch (cause) {
      setSubmitError(cause);
    } finally {
      setPending(false);
    }
  }

  const fieldsDisabled = pending;
  const title = mode === "required" ? "Cambia tu contraseña" : "Cambiar contraseña";

  return (
    <section
      aria-labelledby={`${idPrefix}-title`}
      className="w-full max-w-lg min-w-0 rounded-xl border border-navy/10 bg-white p-6 shadow-card sm:p-8"
    >
      <div className="mb-6 flex items-start gap-3">
        <KeyRound aria-hidden="true" className="mt-1 size-6 shrink-0 text-navy" strokeWidth={1.75} />
        <div className="min-w-0">
          <h2 id={`${idPrefix}-title`} className="text-xl font-bold tracking-tight text-navy sm:text-2xl">{title}</h2>
          <p className="mt-2 text-base leading-relaxed text-navy/70">
            {mode === "required"
              ? "Tu contraseña es temporal. Cámbiala antes de continuar; hasta entonces no podrás usar el resto de la aplicación."
              : "Escribe tu contraseña actual y la nueva. Si aún no tienes contraseña, puedes dejar la actual vacía."}
          </p>
        </div>
      </div>

      {submitError !== undefined && <div className="mb-6"><ErrorNotice error={submitError} /></div>}

      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-5">
        <PasswordField
          id={`${idPrefix}-current`}
          label="Contraseña actual"
          toggleName="la contraseña actual"
          value={currentPassword}
          onChange={setCurrentPassword}
          visible={visible.currentPassword}
          onToggle={() => toggle("currentPassword")}
          error={fieldErrors.currentPassword}
          hint={requireCurrent ? undefined : "Obligatoria si ya tienes una contraseña."}
          autoComplete="current-password"
          inputRef={currentRef}
          disabled={fieldsDisabled}
        />
        <PasswordField
          id={`${idPrefix}-new`}
          label="Nueva contraseña"
          toggleName="la nueva contraseña"
          value={newPassword}
          onChange={setNewPassword}
          visible={visible.newPassword}
          onToggle={() => toggle("newPassword")}
          error={fieldErrors.newPassword}
          hint={`Entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres, con al menos una letra y un número. No puede ser tu correo electrónico.`}
          autoComplete="new-password"
          inputRef={newRef}
          disabled={fieldsDisabled}
        />
        <PasswordField
          id={`${idPrefix}-confirmation`}
          label="Confirmar nueva contraseña"
          toggleName="la confirmación"
          value={confirmation}
          onChange={setConfirmation}
          visible={visible.confirmation}
          onToggle={() => toggle("confirmation")}
          error={fieldErrors.confirmation}
          autoComplete="new-password"
          inputRef={confirmationRef}
          disabled={fieldsDisabled}
        />

        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
          {props.mode === "voluntary" && (
            <Button variant="secondary" onClick={props.onCancel} disabled={fieldsDisabled}>Cancelar</Button>
          )}
          {props.mode === "required" && (
            <Button variant="secondary" onClick={props.onSignOut} disabled={fieldsDisabled}>
              <LogOut aria-hidden="true" className="size-4" />Cerrar sesión
            </Button>
          )}
          <Button type="submit" disabled={fieldsDisabled}>
            {pending ? "Guardando…" : "Guardar contraseña"}
          </Button>
        </div>
      </form>
    </section>
  );
}
