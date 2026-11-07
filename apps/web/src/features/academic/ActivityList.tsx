import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, EmptyState, ErrorNotice, Field, LoadingState, PanelCard } from '../../components/WorkspaceUi.tsx';
import type { Activity, Board, Member } from './api.ts';
import { ActivityCard } from './ActivityCard.tsx';
import type { ActivityActions } from './ActivityCard.tsx';

interface ActivityListProps extends ActivityActions {
  board: Board;
  activities: Activity[];
  status: 'loading' | 'ready' | 'error';
  error: unknown;
  students: Member[];
  currentUserId: string;
  canManage: boolean;
  canReview: boolean;
  busy: boolean;
  onCreate: (title: string, description: string | null) => Promise<boolean>;
}

export function ActivityList({ board, activities, status, error, students, currentUserId, canManage, canReview, busy, onCreate, ...actions }: ActivityListProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onCreate(title.trim(), description.trim() || null)) { setTitle(''); setDescription(''); }
  };

  return (
    <PanelCard title={`Actividades de ${board.title}`} action={status === 'ready' ? <span className="text-sm text-navy/70">{activities.length} en el tablero</span> : undefined}>
      {canManage && (
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end" onSubmit={(event) => void submit(event)}>
          <Field label="Título de la actividad" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} required />
          <Field label="Descripción de la actividad" value={description} onChange={(event) => setDescription(event.target.value)} />
          <Button type="submit" disabled={busy}>Crear actividad</Button>
        </form>
      )}
      <div className={canManage ? 'mt-5' : ''}>
        {status === 'loading' && <LoadingState label="Cargando actividades…" />}
        {status === 'error' && <ErrorNotice error={error} />}
        {status === 'ready' && activities.length === 0 && <EmptyState title="Sin actividades" description="No hay actividades visibles en este tablero." />}
        {status === 'ready' && activities.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {activities.map((item) => (
              <ActivityCard key={item.id} activity={item} students={students} currentUserId={currentUserId} canManage={canManage} canReview={canReview} busy={busy} {...actions} />
            ))}
          </div>
        )}
      </div>
    </PanelCard>
  );
}
