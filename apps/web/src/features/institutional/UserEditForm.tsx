import { useState } from 'react';
import type { FormEvent } from 'react';
import type { ApiRequest } from '../../types/api.ts';
import { ApiError } from '../../lib/api.ts';
import { Button, ErrorNotice, Field } from '../../components/WorkspaceUi';
import { GLOBAL_ROLES, updateInstitutionalUser, type GlobalRole, type UpdateUserInput, type UserDetail } from './api';
import { ROLE_LABELS } from './shared';

const MAX_NAME_LENGTH = 150;

/** Mismos roles en el mismo orden que el contrato, para comparar sin depender del orden recibido. */
function orderedRoles(roles: readonly GlobalRole[]): GlobalRole[] {
  return GLOBAL_ROLES.filter((role) => roles.includes(role));
}

interface UserEditFormProps {
  detail: UserDetail;
  isSelf: boolean;
  request: ApiRequest;
  onSaved: (detail: UserDetail) => void;
}

/** Edición de nombre y roles (`PATCH /api/users/:id`); solo envía los campos que cambian. */
export function UserEditForm({ detail, isSelf, request, onSaved }: UserEditFormProps) {
  const [fullName, setFullName] = useState(detail.fullName);
  const [roles, setRoles] = useState<GlobalRole[]>(detail.roles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [saved, setSaved] = useState(false);

  const trimmedName = fullName.trim();
  const body: UpdateUserInput = {};
  if (trimmedName !== detail.fullName) body.fullName = trimmedName;
  if (orderedRoles(roles).join() !== orderedRoles(detail.roles).join()) body.roles = orderedRoles(roles);
  const changed = Object.keys(body).length > 0;

  function toggleRole(role: GlobalRole, checked: boolean) {
    setSaved(false);
    setRoles((current) => (checked ? [...current, role] : current.filter((item) => item !== role)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !changed) return;
    setSaved(false);
    const errors: string[] = [];
    if (!trimmedName) errors.push('El nombre completo es obligatorio.');
    if (trimmedName.length > MAX_NAME_LENGTH) errors.push(`El nombre completo no puede superar ${MAX_NAME_LENGTH} caracteres.`);
    if (roles.length === 0) errors.push('Selecciona al menos un rol.');
    if (errors.length > 0) {
      setError(new ApiError(400, { message: 'Datos inválidos.', errors }));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const updated = await updateInstitutionalUser(request, detail.id, body);
      setFullName(updated.fullName);
      setRoles(updated.roles);
      setSaved(true);
      onSaved(updated);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={submit} aria-label="Editar nombre y roles">
      <Field
        required
        label="Nombre completo"
        maxLength={MAX_NAME_LENGTH}
        value={fullName}
        onChange={(event) => {
          setSaved(false);
          setFullName(event.target.value);
        }}
      />
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-navy">Roles globales</legend>
        <p className="text-sm leading-relaxed text-navy/70">Al menos un rol. Quitar un rol que la persona ejerce en un proyecto, facultad o área se bloquea.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {GLOBAL_ROLES.map((role) => (
            <label key={role} className="flex min-h-12 items-center gap-3 rounded-lg border border-navy/30 bg-white px-3 text-base text-navy">
              <input
                type="checkbox"
                className="size-5 accent-navy"
                checked={roles.includes(role)}
                onChange={(event) => toggleRole(role, event.target.checked)}
              />
              {ROLE_LABELS[role]}
            </label>
          ))}
        </div>
        {isSelf && <p className="text-sm leading-relaxed text-navy/70">Tu propio rol de administrador no puede quitarse.</p>}
      </fieldset>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={busy || !changed}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button>
        {saved && <p role="status" className="text-sm font-semibold text-navy">Cambios guardados.</p>}
      </div>
      {error !== undefined && <ErrorNotice error={error} />}
    </form>
  );
}
