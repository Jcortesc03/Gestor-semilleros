import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, UserPlus } from 'lucide-react';
import type { CurrentUser } from '../../types/auth.ts';
import type { ApiRequest } from '../../types/api.ts';
import { Button, ErrorNotice, Field, PanelCard } from '../../components/WorkspaceUi';
import { createInstitutionalUser, type CreateUserInput, type GlobalRole } from './api';
import { hasRole, ROLE_OPTIONS, SelectField, Unavailable } from './shared';

interface UserFormState {
  email: string;
  fullName: string;
  role: GlobalRole;
  password: string;
}

const INITIAL_FORM: UserFormState = { email: '', fullName: '', role: 'STUDENT', password: '' };

export function UsersSection({ user, request }: { user: CurrentUser; request: ApiRequest }) {
  if (!hasRole(user, 'ADMIN')) {
    return <Unavailable title="Alta de usuarios" description="Solo un administrador puede crear cuentas." />;
  }
  return <UserForm request={request} />;
}

function UserForm({ request }: { request: ApiRequest }) {
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
    const input: CreateUserInput = {
      email: form.email.trim(),
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
    } catch (cause) {
      setError(cause);
    } finally {
      // La contraseña nunca se conserva en la pantalla después de un intento.
      setBusy(false);
      setForm((current) => ({ ...current, password: '' }));
    }
  }

  return (
    <PanelCard title="Crear cuenta institucional" action={<UserPlus aria-hidden="true" className="size-5 text-gold" />}>
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
          label="Contraseña opcional"
          hint="Se limpia después de cada intento; mínimo 8 caracteres si la usas."
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
