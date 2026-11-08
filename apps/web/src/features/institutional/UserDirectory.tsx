import { useEffect, useState } from 'react';
import type { ApiRequest } from '../../types/api.ts';
import { EmptyState, ErrorNotice, Field, LoadingState, PanelCard } from '../../components/WorkspaceUi';
import { listInstitutionalUsers, type AdminUserListItem, type GlobalRole, type UserStatusFilter } from './api';
import { ROLE_LABELS, ROLE_OPTIONS, SelectField, USER_STATUS_LABELS } from './shared';
import { useDebouncedValue } from './useDebouncedValue';

/** Espera tras la última tecla antes de consultar el servidor. */
export const SEARCH_DEBOUNCE_MS = 250;
/** La búsqueda por texto exige al menos 2 caracteres (`docs/api/users.md`). */
const MIN_SEARCH_CHARS = 2;
/** Máximo que admite el contrato; si se alcanza, el listado puede estar incompleto. */
export const DIRECTORY_LIMIT = 50;

type RoleFilter = 'ALL' | GlobalRole;

const ROLE_FILTER_OPTIONS: readonly { value: RoleFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos los roles' },
  ...ROLE_OPTIONS,
];

const STATUS_FILTER_OPTIONS: readonly { value: UserStatusFilter; label: string }[] = [
  { value: 'ACTIVE', label: 'Activos' },
  { value: 'INACTIVE', label: 'Inactivos' },
  { value: 'ALL', label: 'Todos' },
];

interface UserDirectoryProps {
  request: ApiRequest;
  selectedId: string | undefined;
  refreshToken: number;
  onSelect: (id: string) => void;
}

export function UserDirectory({ request, selectedId, refreshToken, onSelect }: UserDirectoryProps) {
  const [searchText, setSearchText] = useState('');
  const [role, setRole] = useState<RoleFilter>('ALL');
  const [status, setStatus] = useState<UserStatusFilter>('ACTIVE');
  const debouncedSearch = useDebouncedValue(searchText.trim(), SEARCH_DEBOUNCE_MS);
  const search = debouncedSearch.length >= MIN_SEARCH_CHARS ? debouncedSearch : undefined;
  const [items, setItems] = useState<AdminUserListItem[]>();
  const [loadError, setLoadError] = useState<unknown>();

  useEffect(() => {
    // Cada ejecución tiene su propia bandera: una respuesta de un filtro anterior no pisa la vista actual.
    let active = true;
    setItems(undefined);
    setLoadError(undefined);
    listInstitutionalUsers(request, {
      ...(search === undefined ? {} : { search }),
      ...(role === 'ALL' ? {} : { role }),
      status,
      limit: DIRECTORY_LIMIT,
    })
      .then((value) => {
        if (active) setItems(value);
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(cause);
      });
    return () => {
      active = false;
    };
  }, [request, search, role, status, refreshToken]);

  const shortSearch = searchText.trim().length === 1;

  return (
    <PanelCard title="Usuarios">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          type="search"
          autoComplete="off"
          label="Buscar por nombre o correo"
          hint={shortSearch ? 'Escribe al menos 2 caracteres para buscar.' : undefined}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <SelectField label="Rol" value={role} options={ROLE_FILTER_OPTIONS} onChange={setRole} />
        <SelectField label="Estado" value={status} options={STATUS_FILTER_OPTIONS} onChange={setStatus} />
      </div>

      <div className="mt-6">
        {loadError !== undefined && <ErrorNotice error={loadError} />}
        {loadError === undefined && items === undefined && <LoadingState label="Cargando usuarios…" />}
        {items?.length === 0 && (
          <EmptyState title="No hay usuarios con estos filtros" description="Cambia el texto, el rol o el estado para ver otras cuentas." />
        )}
        {items && items.length > 0 && (
          <ul aria-label="Usuarios" className="divide-y divide-navy/10 rounded-lg border border-navy/10">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={item.id === selectedId ? 'true' : undefined}
                  onClick={() => onSelect(item.id)}
                  className={`flex w-full min-w-0 flex-col gap-1 px-4 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-navy ${item.id === selectedId ? 'bg-gold/20' : 'hover:bg-canvas'}`}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words font-semibold text-navy">{item.fullName}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${item.status === 'ACTIVE' ? 'bg-navy/10 text-navy' : 'bg-alert/10 text-alert'}`}>
                      {USER_STATUS_LABELS[item.status]}
                    </span>
                  </span>
                  <span className="break-all text-sm text-navy/75">{item.email}</span>
                  <span className="text-sm text-navy/65">
                    {item.roles.length > 0 ? item.roles.map((value) => ROLE_LABELS[value]).join(', ') : 'Sin roles'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {items && items.length >= DIRECTORY_LIMIT && (
          <p className="mt-3 text-sm leading-relaxed text-navy/70">
            Se muestran los primeros {DIRECTORY_LIMIT} usuarios. Afina la búsqueda para ver más.
          </p>
        )}
      </div>
    </PanelCard>
  );
}
