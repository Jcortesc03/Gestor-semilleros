import { useId } from 'react';
import { EmptyState, PanelCard } from '../../components/WorkspaceUi';
import type { CurrentUser } from '../../types/auth.ts';
import {
  GLOBAL_ROLES,
  type AnnouncementKind,
  type GlobalRole,
  type NotificationChannel,
  type NotificationKind,
  type UserStatus,
} from './api';

export const ROLE_LABELS: Record<GlobalRole, string> = {
  ADMIN: 'Administrador',
  AREA_MANAGER: 'Encargado de área',
  DEAN: 'Decano',
  TUTOR: 'Tutor',
  STUDENT: 'Estudiante',
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
};

export const ANNOUNCEMENT_KIND_LABELS: Record<AnnouncementKind, string> = {
  NEWS: 'Noticia',
  COMMUNICATION: 'Comunicado',
  CHANGE: 'Cambio',
  NOTIFICATION: 'Notificación',
};

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  ...ANNOUNCEMENT_KIND_LABELS,
  MEETING: 'Reunión',
};

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  EMAIL: 'Correo',
  WHATSAPP: 'WhatsApp',
};

export const ROLE_OPTIONS = GLOBAL_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

/** Indica si el usuario tiene al menos uno de los roles globales. */
export function hasRole(user: CurrentUser, ...roles: GlobalRole[]): boolean {
  return roles.some((required) => user.roles.includes(required));
}

export const textAreaClassName = 'min-h-32 w-full rounded-lg border border-navy/50 bg-white p-3 text-base text-navy';

export function Unavailable({ title, description }: { title: string; description: string }) {
  return (
    <PanelCard
      title={title}
      help={{
        title,
        description: `${description} Esta sección requiere un rol con permiso; si crees que deberías verla, contacta con la administración.`,
      }}
    >
      <EmptyState title="Función no disponible para este rol" description={description} />
    </PanelCard>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** Selector con etiqueta asociada por `htmlFor`; el valor se devuelve tipado sin conversiones. */
export function SelectField<T extends string>({ label, value, options, onChange }: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      <select
        id={id}
        className="min-h-12 w-full rounded-lg border border-navy/50 bg-white px-3 text-base text-navy"
        value={value}
        onChange={(event) => {
          const selected = options.find((option) => option.value === event.target.value);
          if (selected) onChange(selected.value);
        }}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}
