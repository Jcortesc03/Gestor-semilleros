import { useState } from 'react';
import type { FormEvent } from 'react';
import { Pagination, useClientPagination } from '../../components/Pagination.tsx';
import { Button, EmptyState, ErrorNotice, Field, LoadingState, PanelCard } from '../../components/WorkspaceUi.tsx';
import type { Activity, Board, Member } from './api.ts';
import type { ProjectDocumentsState } from '../documents/index.ts';
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
  documents: ProjectDocumentsState;
  onCreate: (title: string, description: string | null) => Promise<boolean>;
}

export function ActivityList({ board, activities, status, error, students, currentUserId, canManage, canReview, busy, documents, onCreate, ...actions }: ActivityListProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Lista acotada por tablero: se pagina en el cliente y vuelve a la página 1 al cambiar de tablero (ADR 0017).
  const paginated = useClientPagination(activities, 10, board.id);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onCreate(title.trim(), description.trim() || null)) { setTitle(''); setDescription(''); }
  };

  return (
    <PanelCard
      title={`Actividades de ${board.title}`}
      action={status === 'ready' ? <span className="text-sm text-navy/70">{activities.length} en el tablero</span> : undefined}
      help={{
        title: 'Actividades',
        description: 'Son las tareas del tablero: el formulario crea una actividad con título y descripción; al editarla cambias sus datos; aprobarla marca que se completó y asignarla la reparte entre estudiantes.',
        roles: {
          ADMIN: 'Como administrador, puedes crear, editar, asignar y aprobar actividades en cualquier proyecto.',
          AREA_MANAGER: 'Como encargado de área, ves las actividades de los tableros de tus proyectos, pero crearlas, asignarlas o aprobarlas requiere ser tutor, líder o administrador del proyecto.',
          DEAN: 'Como decano, ves las actividades de los proyectos de tus facultades, pero crearlas o aprobarlas requiere ser tutor, líder o administrador.',
          TUTOR: 'Como tutor, puedes crear actividades, asignarlas y aprobar sus avances en el proyecto que tutorizas.',
          STUDENT: 'Como estudiante, ves las actividades asignadas y marcas tus avances; si eres líder del proyecto, además puedes crear y gestionar actividades.',
        },
      }}
    >
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
            {paginated.items.map((item) => (
              <ActivityCard key={item.id} activity={item} students={students} currentUserId={currentUserId} canManage={canManage} canReview={canReview} busy={busy} documents={documents} {...actions} />
            ))}
          </div>
        )}
      </div>
      <Pagination label="Actividades" page={paginated.page} pageSize={paginated.pageSize} total={paginated.total} onPageChange={paginated.setPage} />
    </PanelCard>
  );
}
