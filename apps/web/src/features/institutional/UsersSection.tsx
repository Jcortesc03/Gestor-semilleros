import { useCallback, useState } from 'react';
import type { CurrentUser } from '../../types/auth.ts';
import type { ApiRequest } from '../../types/api.ts';
import { EmptyState, PanelCard } from '../../components/WorkspaceUi';
import { CreateUserForm } from './CreateUserForm';
import { UserDetailPanel } from './UserDetailPanel';
import { UserDirectory } from './UserDirectory';
import { hasRole, Unavailable } from './shared';

/** Gestión de cuentas (ADR 0011): solo administradores. */
export function UsersSection({ user, request }: { user: CurrentUser; request: ApiRequest }) {
  if (!hasRole(user, 'ADMIN')) {
    return <Unavailable title="Gestión de usuarios" description="Solo un administrador puede crear y gestionar cuentas." />;
  }
  return <UserManagement user={user} request={request} />;
}

function UserManagement({ user, request }: { user: CurrentUser; request: ApiRequest }) {
  const [selectedId, setSelectedId] = useState<string>();
  const [refreshToken, setRefreshToken] = useState(0);
  // Cualquier cambio (alta, edición, estado) vuelve a consultar el listado con sus filtros actuales.
  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <UserDirectory request={request} selectedId={selectedId} refreshToken={refreshToken} onSelect={setSelectedId} />
        {selectedId ? (
          <UserDetailPanel key={selectedId} userId={selectedId} currentUserId={user.id} request={request} onChanged={refresh} />
        ) : (
          <PanelCard title="Detalle del usuario">
            <EmptyState title="Ningún usuario seleccionado" description="Elige una persona de la lista para editar su nombre, roles, estado o contraseña." />
          </PanelCard>
        )}
      </div>
      <CreateUserForm request={request} onCreated={refresh} />
    </div>
  );
}
