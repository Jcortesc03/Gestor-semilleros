import { useState } from 'react';
import type { FormEvent } from 'react';
import { Users } from 'lucide-react';
import { Button, EmptyState, PanelCard, inputClassName } from '../../components/WorkspaceUi.tsx';
import type { ApiRequest } from '../../types/api.ts';
import { UserPicker } from '../directory/index.ts';
import type { DirectoryUser } from '../directory/index.ts';
import type { Member, ProjectRole } from './api.ts';
import { PROJECT_ROLE_LABELS } from './labels.ts';

interface MembersPanelProps {
  request: ApiRequest;
  members: Member[];
  canManageTutors: boolean;
  canManageStudents: boolean;
  busy: boolean;
  onAdd: (userId: string, projectRole: ProjectRole) => Promise<boolean>;
  onRemove: (member: Member) => void;
  onTogglePrimary: (member: Member) => void;
  onToggleLeader: (member: Member) => void;
}

export function MembersPanel({ request, members, canManageTutors, canManageStudents, busy, onAdd, onRemove, onTogglePrimary, onToggleLeader }: MembersPanelProps) {
  const [picked, setPicked] = useState<DirectoryUser | null>(null);
  const [role, setRole] = useState<ProjectRole>('STUDENT');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (picked && await onAdd(picked.id, role)) setPicked(null);
  };

  return (
    <PanelCard
      title="Participantes"
      action={<Users aria-hidden="true" className="size-5 text-gold" />}
      help={{
        title: 'Participantes',
        description: 'Busca una persona, elige su rol en el proyecto y pulsa «Añadir participante» para incorporarla. En cada participante: «Hacer líder» lo convierte en líder estudiante; «Quitar liderazgo» lo deja como estudiante normal sin sacarlo del proyecto; «Retirar a …» lo elimina por completo del proyecto (deja de participar y de verlo). Si es tutor, «Marcar principal» lo designa tutor principal y «Quitar principal» le quita esa marca.',
        roles: {
          ADMIN: 'Como administrador, gestionas todos los participantes de cualquier proyecto, tutores y estudiantes. Busca una persona, elige su rol (Estudiante, Líder estudiante o Tutor) y pulsa «Añadir participante» para incorporarla. En cada participante: «Hacer líder» lo convierte en líder; «Quitar liderazgo» lo deja como estudiante normal sin sacarlo; «Retirar a …» lo saca por completo del proyecto. No hay nada que no puedas hacer aquí.',
          AREA_MANAGER: 'Como encargado de área, gestionas los participantes de los proyectos de tus áreas. Igual que el administrador: buscas, eliges rol y añades; «Quitar liderazgo» deja a la persona como estudiante normal y «Retirar a …» la saca del proyecto. No puedes crear tableros ni actividades en estos proyectos (eso requiere ser tutor o administrador).',
          DEAN: 'Como decano, gestionas los participantes de los proyectos de tus facultades, igual que el encargado de área en sus áreas. «Quitar liderazgo» deja a la persona como estudiante normal; «Retirar a …» la saca del proyecto. No creas tableros ni actividades sin ser tutor o administrador.',
          TUTOR: 'Como tutor, solo puedes añadir y retirar estudiantes del proyecto que tutorizas; no puedes gestionar tutores ni cambiar su tutor principal. «Quitar liderazgo» deja a un estudiante como normal y «Retirar a …» lo saca de tu proyecto.',
          STUDENT: 'Como estudiante solo ves la lista de participantes y sus roles; no puedes añadir ni retirar a nadie, aunque seas líder. Los botones de gestión no aparecen para tu rol.',
        },
      }}
    >
      {canManageStudents && (
        <form className="grid gap-3 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto] sm:items-start" onSubmit={(event) => void submit(event)}>
          <UserPicker
            request={request}
            label="Persona a añadir"
            role={role === 'TUTOR' ? 'TUTOR' : 'STUDENT'}
            excludeIds={members.map((item) => item.user.id)}
            selected={picked}
            onSelect={setPicked}
            onClear={() => setPicked(null)}
            disabled={busy}
          />
          <label className="block space-y-2 text-sm font-semibold">
            <span className="block whitespace-nowrap">Rol en el proyecto</span>
            <select className={inputClassName} value={role} onChange={(event) => setRole(event.target.value as ProjectRole)}>
              <option value="STUDENT">{PROJECT_ROLE_LABELS.STUDENT}</option>
              <option value="STUDENT_LEADER">{PROJECT_ROLE_LABELS.STUDENT_LEADER}</option>
              {canManageTutors && <option value="TUTOR">{PROJECT_ROLE_LABELS.TUTOR}</option>}
            </select>
          </label>
          <Button type="submit" className="sm:mt-7" disabled={busy || !picked}>Añadir participante</Button>
        </form>
      )}
      {members.length === 0 ? (
        <div className="mt-5"><EmptyState title="Sin participantes" description="No hay participantes activos visibles en este proyecto." /></div>
      ) : (
        <ul className="mt-5 divide-y divide-navy/10">
          {members.map((item) => {
            const isTutor = item.projectRole === 'TUTOR';
            const canManage = isTutor ? canManageTutors : canManageStudents;
            return (
              <li key={item.id} className="space-y-3 py-3">
                <div>
                  <strong>{item.user.fullName}</strong>
                  <p className="text-sm text-navy/70">{item.user.email} · {PROJECT_ROLE_LABELS[item.projectRole]}{item.isPrimary ? ' · tutor principal' : ''}</p>
                </div>
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    {isTutor
                      ? <Button type="button" variant="secondary" disabled={busy} onClick={() => onTogglePrimary(item)}>{item.isPrimary ? 'Quitar principal' : 'Marcar principal'}</Button>
                      : <Button type="button" variant="secondary" disabled={busy} onClick={() => onToggleLeader(item)}>{item.projectRole === 'STUDENT' ? 'Hacer líder' : 'Quitar liderazgo'}</Button>}
                    <Button type="button" variant="danger" disabled={busy} onClick={() => onRemove(item)}>Retirar a {item.user.fullName}</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PanelCard>
  );
}
