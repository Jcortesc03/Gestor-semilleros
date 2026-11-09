import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ApiRequest } from '../../types/api.ts';
import { ApiError } from '../../lib/api.ts';
import { Button, ErrorNotice, Field } from '../../components/WorkspaceUi';
import { setTemporaryPassword, type UserDetail } from './api';
import { passwordPolicyErrors, PASSWORD_POLICY_TEXT } from './password-policy';

interface TemporaryPasswordFormProps {
  detail: UserDetail;
  request: ApiRequest;
  /** Se llama tras fijar la contraseña para reflejar `hasPassword` y `mustChangePassword`. */
  onSet: () => void;
}

/** Fija una contraseña temporal (`PUT /api/users/:id/password`); la persona deberá cambiarla al entrar. */
export function TemporaryPasswordForm({ detail, request, onSet }: TemporaryPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [doneFor, setDoneFor] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setDoneFor(undefined);
    const errors = passwordPolicyErrors(password, detail.email);
    if (errors.length > 0) {
      setError(new ApiError(400, { message: 'Datos inválidos.', errors }));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await setTemporaryPassword(request, detail.id, password);
      setDoneFor(detail.email);
      onSet();
    } catch (cause) {
      setError(cause);
    } finally {
      // La contraseña no se conserva en pantalla después de un intento.
      setBusy(false);
      setPassword('');
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} aria-label="Fijar contraseña temporal">
      <p className="text-sm leading-relaxed text-navy/75">
        Al entrar, la persona deberá cambiar esta contraseña antes de usar la plataforma.
      </p>
      <Field
        type="password"
        autoComplete="new-password"
        label="Nueva contraseña temporal"
        hint={PASSWORD_POLICY_TEXT}
        value={password}
        onChange={(event) => {
          setDoneFor(undefined);
          setPassword(event.target.value);
        }}
      />
      <Button type="submit" variant="secondary" disabled={busy}>{busy ? 'Fijando…' : 'Fijar contraseña temporal'}</Button>
      {error !== undefined && <ErrorNotice error={error} />}
      {doneFor !== undefined && (
        <p role="status" className="rounded-lg bg-canvas p-4 text-sm font-semibold">
          Contraseña temporal fijada para {doneFor}. Deberá cambiarla al entrar.
        </p>
      )}
    </form>
  );
}
