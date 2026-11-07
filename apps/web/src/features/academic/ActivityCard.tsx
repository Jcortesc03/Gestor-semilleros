import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, Link as LinkIcon, X } from 'lucide-react';
import { Button, Field, inputClassName } from '../../components/WorkspaceUi.tsx';
import type { Activity, ApprovalStatus, Member, ProgressStatus, ResultStatus } from './api.ts';
import { APPROVAL_LABELS, PROGRESS_LABELS, RESULT_LABELS } from './labels.ts';

export interface ActivityActions {
  onProgress: (activity: Activity, status: ProgressStatus) => void;
  onApproval: (activity: Activity, status: ApprovalStatus) => void;
  onResult: (activity: Activity, result: ResultStatus | null) => void;
  onDelete: (activity: Activity) => void;
  onAddAssignee: (activity: Activity, userId: string) => Promise<boolean>;
  onRemoveAssignee: (activity: Activity, userId: string) => void;
  onAddLink: (activity: Activity, url: string) => Promise<boolean>;
  onRemoveLink: (activity: Activity, attachmentId: string) => void;
}

interface ActivityCardProps extends ActivityActions {
  activity: Activity;
  students: Member[];
  currentUserId: string;
  canManage: boolean;
  canReview: boolean;
  busy: boolean;
}

const selectClassName = 'min-h-10 rounded-lg border border-navy/30 bg-white px-2 text-sm text-navy';

export function ActivityCard({ activity, students, currentUserId, canManage, canReview, busy, ...actions }: ActivityCardProps) {
  const [assigneeId, setAssigneeId] = useState('');
  const [url, setUrl] = useState('');
  const isAssignee = activity.assignees.some((item) => item.user.id === currentUserId);
  const canProgress = canManage || isAssignee;
  const canLinks = canManage || isAssignee;
  const assignedIds = new Set(activity.assignees.map((item) => item.user.id));
  const candidates = students.filter((item) => !assignedIds.has(item.user.id));
  const canDecide = activity.progressStatus === 'DONE';
  const approvalHintId = useId();

  const assign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await actions.onAddAssignee(activity, assigneeId)) setAssigneeId('');
  };
  const attach = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await actions.onAddLink(activity, url.trim())) setUrl('');
  };

  return (
    <article className="rounded-lg border border-navy/10 bg-canvas p-4">
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="font-bold">{activity.title}</h3>
          <p className="mt-1 text-sm text-navy/70">{activity.description || 'Sin descripción'}</p>
          <p className="mt-1 text-xs text-navy/70">Autor: {activity.author.fullName}</p>
        </div>
        <div className="shrink-0 space-y-1 text-right text-xs font-bold">
          <p>{APPROVAL_LABELS[activity.approvalStatus]}</p>
          <p className="font-semibold text-navy/70">{PROGRESS_LABELS[activity.progressStatus]}{activity.result ? ` · ${RESULT_LABELS[activity.result]}` : ''}</p>
        </div>
      </div>

      {(canProgress || canReview || canManage) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {canProgress && (
            <select aria-label={`Progreso de ${activity.title}`} className={selectClassName} disabled={busy} value={activity.progressStatus}
              onChange={(event) => actions.onProgress(activity, event.target.value as ProgressStatus)}>
              {(Object.keys(PROGRESS_LABELS) as ProgressStatus[])
                .filter((value) => canManage || value !== 'CANCELLED')
                .map((value) => <option key={value} value={value}>{PROGRESS_LABELS[value]}</option>)}
            </select>
          )}
          {canReview && (
            <>
              <select aria-label={`Aprobación de ${activity.title}`} aria-describedby={canDecide ? undefined : approvalHintId} className={selectClassName} disabled={busy} value={activity.approvalStatus}
                onChange={(event) => actions.onApproval(activity, event.target.value as ApprovalStatus)}>
                {(Object.keys(APPROVAL_LABELS) as ApprovalStatus[]).map((value) => (
                  // ADR 0010 sec. 5: aprobar o rechazar exige progreso DONE; reiniciar a PENDING siempre es posible.
                  <option key={value} value={value} disabled={value !== 'PENDING' && !canDecide}>{APPROVAL_LABELS[value]}</option>
                ))}
              </select>
              {!canDecide && (
                <p id={approvalHintId} className="w-full text-xs font-semibold text-navy/70">
                  Solo se puede aprobar o rechazar una actividad terminada (progreso Terminada).
                </p>
              )}
              <select aria-label={`Resultado de ${activity.title}`} className={selectClassName} disabled={busy} value={activity.result ?? ''}
                onChange={(event) => actions.onResult(activity, event.target.value === '' ? null : event.target.value as ResultStatus)}>
                <option value="">Sin resultado</option>
                {(Object.keys(RESULT_LABELS) as ResultStatus[]).map((value) => <option key={value} value={value}>{RESULT_LABELS[value]}</option>)}
              </select>
            </>
          )}
          {canManage && <Button type="button" variant="danger" disabled={busy} onClick={() => actions.onDelete(activity)}><Archive aria-hidden="true" className="size-4" />Eliminar actividad</Button>}
        </div>
      )}

      <div className="mt-4">
        <h4 className="text-sm font-semibold">Encargados</h4>
        {activity.assignees.length === 0 ? <p className="mt-1 text-sm text-navy/70">Sin encargados.</p> : (
          <ul className="mt-1 space-y-2 text-sm">
            {activity.assignees.map((item) => (
              <li key={item.user.id} className="flex items-center justify-between gap-2">
                <span>{item.user.fullName}</span>
                {canManage && <Button type="button" variant="secondary" disabled={busy} onClick={() => actions.onRemoveAssignee(activity, item.user.id)}><X aria-hidden="true" className="size-4" />Quitar a {item.user.fullName}</Button>}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <form className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(event) => void assign(event)}>
            <label className="block space-y-2 text-sm font-semibold">Estudiante encargado de {activity.title}
              <select className={inputClassName} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} required>
                <option value="">Seleccionar</option>
                {candidates.map((item) => <option key={item.user.id} value={item.user.id}>{item.user.fullName}</option>)}
              </select>
            </label>
            <Button type="submit" disabled={busy}>Asignar</Button>
          </form>
        )}
      </div>

      <div className="mt-4">
        <h4 className="text-sm font-semibold">Enlaces adjuntos</h4>
        {activity.attachments.length === 0 ? <p className="mt-1 text-sm text-navy/70">Sin enlaces.</p> : (
          <ul className="mt-1 space-y-2 text-sm">
            {activity.attachments.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2">
                {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="break-all text-navy underline">{item.url}</a> : <span>Documento no disponible</span>}
                {canLinks && <Button type="button" variant="secondary" disabled={busy} onClick={() => actions.onRemoveLink(activity, item.id)}><X aria-hidden="true" className="size-4" />Quitar enlace</Button>}
              </li>
            ))}
          </ul>
        )}
        {canLinks && (
          <form className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(event) => void attach(event)}>
            <Field label={`Enlace http(s) para ${activity.title}`} type="url" value={url} maxLength={2048} onChange={(event) => setUrl(event.target.value)} required />
            <Button type="submit" disabled={busy}><LinkIcon aria-hidden="true" className="size-4" />Adjuntar enlace</Button>
          </form>
        )}
      </div>
    </article>
  );
}
