import { useEffect, useRef, useState } from 'react';
import type { ApiRequest } from '../../types/api.ts';
import { Button, ErrorNotice, LoadingState, PanelCard } from '../../components/WorkspaceUi';
import { getInstitutionalUser, setInstitutionalUserActive, type UserDetail } from './api';
import { TemporaryPasswordForm } from './TemporaryPasswordForm';
import { UserEditForm } from './UserEditForm';
import { USER_STATUS_LABELS } from './shared';

interface UserDetailPanelProps {
  userId: string;
  currentUserId: string;
  request: ApiRequest;
  onChanged: () => void;
}

/**
 * Detalle y acciones de una cuenta. El padre la monta con `key={userId}`, así cada selección
 * empieza sin estado heredado. El foco pasa al panel para que lectores de pantalla anuncien la cuenta.
 */
export function UserDetailPanel({ userId, currentUserId, request, onChanged }: UserDetailPanelProps) {
  const [detail, setDetail] = useState<UserDetail>();
  const [loadError, setLoadError] = useState<unknown>();
  const regionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getInstitutionalUser(request, userId)
      .then((value) => {
        if (!active) return;
        setDetail(value);
        setLoadError(undefined);
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(cause);
      });
    return () => {
      active = false;
    };
  }, [request, userId]);

  useEffect(() => {
    regionRef.current?.focus();
  }, []);

  function handleChanged(next: UserDetail) {
    setDetail(next);
    onChanged();
  }

  return (
    <div ref={regionRef} tabIndex={-1} className="min-w-0 focus:outline-none">
      <PanelCard
        title={detail?.fullName ?? 'Detalle del usuario'}
        help={{
          title: 'Detalle del usuario',
          description: 'Muestra el usuario elegido con su correo, estado y roles. Permite editar nombre y roles, desactivar o reactivar la cuenta y fijar una contraseña temporal que la persona deberá cambiar al entrar.',
          roles: {
            ADMIN: 'Como administrador, gestionas la cuenta elegida: nombre, roles, estado y contraseña temporal. Desactivar le quita el acceso al instante sin borrar su historial.',
          },
        }}
      >
        {loadError !== undefined && <ErrorNotice error={loadError} />}
        {detail === undefined && loadError === undefined && <LoadingState label="Cargando usuario…" />}
        {detail && (
          <div className="space-y-8">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="font-semibold text-navy/75">Correo</dt>
                <dd className="break-all">{detail.email}</dd>
              </div>
              <div>
                <dt className="font-semibold text-navy/75">Estado</dt>
                <dd>{USER_STATUS_LABELS[detail.status]}</dd>
              </div>
              <div>
                <dt className="font-semibold text-navy/75">Contraseña</dt>
                <dd>{detail.hasPassword ? 'Tiene contraseña.' : 'Sin contraseña: solo puede entrar con Google, si está configurado.'}</dd>
              </div>
              {detail.mustChangePassword && (
                <div>
                  <dt className="font-semibold text-navy/75">Cambio pendiente</dt>
                  <dd>Debe cambiar su contraseña al entrar.</dd>
                </div>
              )}
            </dl>

            <section aria-labelledby="user-edit-heading" className="space-y-4 border-t border-navy/10 pt-6">
              <h3 id="user-edit-heading" className="text-lg font-bold text-navy">Nombre y roles</h3>
              <UserEditForm
                detail={detail}
                isSelf={detail.id === currentUserId}
                request={request}
                onSaved={handleChanged}
              />
            </section>

            <StatusSection detail={detail} isSelf={detail.id === currentUserId} request={request} onChanged={handleChanged} />

            <section aria-labelledby="user-password-heading" className="space-y-4 border-t border-navy/10 pt-6">
              <h3 id="user-password-heading" className="text-lg font-bold text-navy">Contraseña temporal</h3>
              <TemporaryPasswordForm
                detail={detail}
                request={request}
                onSet={() => setDetail((current) => (current ? { ...current, hasPassword: true, mustChangePassword: true } : current))}
              />
            </section>
          </div>
        )}
      </PanelCard>
    </div>
  );
}

interface StatusSectionProps {
  detail: UserDetail;
  isSelf: boolean;
  request: ApiRequest;
  onChanged: (next: UserDetail) => void;
}

/** Desactivar o reactivar con confirmación. Quien administra no puede desactivarse a sí mismo. */
function StatusSection({ detail, isSelf, request, onChanged }: StatusSectionProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const active = detail.status === 'ACTIVE';
  const blockedSelf = isSelf && active;

  async function toggle() {
    if (busy || blockedSelf) return;
    const question = active
      ? `¿Desactivar a ${detail.fullName}? Perderá el acceso de inmediato. Su historial y sus participaciones se conservan.`
      : `¿Reactivar a ${detail.fullName}? Recuperará el acceso y todo lo que tenía.`;
    if (!window.confirm(question)) return;
    setBusy(true);
    setError(undefined);
    try {
      onChanged(await setInstitutionalUserActive(request, detail.id, !active));
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="user-status-heading" className="space-y-4 border-t border-navy/10 pt-6">
      <h3 id="user-status-heading" className="text-lg font-bold text-navy">Acceso</h3>
      <p className="text-sm leading-relaxed text-navy/75">
        {active
          ? 'Una cuenta desactivada no inicia sesión, no aparece en el directorio y no recibe copias externas.'
          : 'La cuenta está desactivada. Al reactivarla recupera su acceso y sus participaciones.'}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button variant={active ? 'danger' : 'secondary'} onClick={toggle} disabled={busy || blockedSelf}>
          {busy ? 'Guardando…' : active ? 'Desactivar cuenta' : 'Reactivar cuenta'}
        </Button>
        {blockedSelf && <p className="text-sm text-navy/75">No puedes desactivar tu propia cuenta.</p>}
      </div>
      {error !== undefined && <ErrorNotice error={error} />}
    </section>
  );
}
