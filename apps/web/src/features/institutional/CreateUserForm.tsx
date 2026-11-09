import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, UserPlus } from 'lucide-react';
import type { ApiRequest } from '../../types/api.ts';
import { ApiError } from '../../lib/api.ts';
import { Button, ErrorNotice, Field, PanelCard } from '../../components/WorkspaceUi';
import { createInstitutionalUser, type CreateUserInput, type GlobalRole } from './api';
import { passwordPolicyErrors, PASSWORD_POLICY_TEXT } from './password-policy';
import { ROLE_OPTIONS, SelectField } from './shared';

interface UserFormState {
  email: string;
  fullName: string;
  role: GlobalRole;
  password: string;
}

const INITIAL_FORM: UserFormState = { email: '', fullName: '', role: 'STUDENT', password: '' };

/** Alta de una cuenta (`POST /api/users`). `onCreated` permite refrescar el directorio. */
export function CreateUserForm({ request, onCreated }: { request: ApiRequest; onCreated: () => void }) {
  const [form, setForm] = useState<UserFormState>(INITIAL_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [createdEmail, setCreatedEmail] = useState<string>();

  function update<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const email = form.email.trim();
    // Misma política que el backend, validada antes de enviar; el campo conserva su valor para corregirlo.
    if (form.password) {
      const errors = passwordPolicyErrors(form.password, email);
      if (errors.length > 0) {
        setCreatedEmail(undefined);
        setError(new ApiError(400, { message: 'Datos inválidos.', errors }));
        return;
      }
    }
    const input: CreateUserInput = {
      email,
      fullName: form.fullName.trim(),
      roles: [form.role],
      ...(form.password ? { password: form.password } : {}),
    };
    setBusy(true);
    setError(undefined);
    setCreatedEmail(undefined);
    try {
      const created = await createInstitutionalUser(request, input);
      setCreatedEmail(created.email);
      onCreated();
    } catch (cause) {
      setError(cause);
    } finally {
      // La contraseña nunca se conserva en la pantalla después de un intento.
      setBusy(false);
      setForm((current) => ({ ...current, password: '' }));
    }
  }

  return (
    <PanelCard
      title="Crear cuenta institucional"
      action={<UserPlus aria-hidden="true" className="size-5 text-gold" />}
      help={{
        title: 'Crear cuenta institucional',
        description: 'Crea una cuenta con nombre, correo, roles y contraseña opcional. Si omites la contraseña, la cuenta queda disponible solo con Google cuando ese proveedor esté configurado.',
        roles: {
          ADMIN: 'Como administrador, creas cuentas con los roles que necesiten; la persona deberá cambiar la contraseña temporal en su primer acceso.',
        },
      }}
    >
      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-navy/75">
        El primer administrador se autoriza por separado desde la terminal. Si omites la contraseña, la cuenta queda disponible
        únicamente con Google cuando ese proveedor esté configurado.
      </p>
      <form className="grid gap-5 sm:grid-cols-2" onSubmit={submit}>
        <Field required type="email" label="Correo institucional" value={form.email} onChange={(e) => update('email', e.target.value)} />
        <Field required label="Nombre completo" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} />
        <SelectField label="Rol global" value={form.role} options={ROLE_OPTIONS} onChange={(role) => update('role', role)} />
        <Field
          type="password"
          autoComplete="new-password"
          label="Contraseña opcional"
          hint={PASSWORD_POLICY_TEXT}
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
        />
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</Button>
        </div>
      </form>
      {error !== undefined && <div className="mt-5"><ErrorNotice error={error} /></div>}
      {createdEmail !== undefined && (
        <p className="mt-5 flex items-center gap-2 rounded-lg bg-canvas p-4 text-sm font-semibold">
          <CheckCircle2 aria-hidden="true" className="size-5 text-gold" />
          Cuenta creada para {createdEmail}.
        </p>
      )}
    </PanelCard>
  );
}
