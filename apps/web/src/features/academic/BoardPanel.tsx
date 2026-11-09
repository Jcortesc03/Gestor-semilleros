import { useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, ClipboardList, Pencil } from 'lucide-react';
import { Button, EmptyState, Field, PanelCard, formatDate, inputClassName } from '../../components/WorkspaceUi.tsx';
import type { Board, Member, ProgressStatus } from './api.ts';
import { PROGRESS_LABELS } from './labels.ts';

export interface BoardValues { title: string; dueDate: string; tutorId: string; studentId: string; progressStatus: ProgressStatus }

interface BoardPanelProps {
  boards: Board[];
  selectedId: string;
  tutors: Member[];
  students: Member[];
  canManage: boolean;
  busy: boolean;
  onSelect: (boardId: string) => void;
  onCreate: (values: BoardValues) => Promise<boolean>;
  onUpdate: (board: Board, values: BoardValues) => Promise<boolean>;
  onDelete: (board: Board) => void;
}

const EMPTY: BoardValues = { title: '', dueDate: '', tutorId: '', studentId: '', progressStatus: 'PENDING' };

interface BoardFormProps {
  initial: BoardValues;
  tutors: Member[];
  students: Member[];
  busy: boolean;
  submitLabel: string;
  withProgress?: boolean;
  onSubmit: (values: BoardValues) => Promise<boolean>;
}

function BoardForm({ initial, tutors, students, busy, submitLabel, withProgress = false, onSubmit }: BoardFormProps) {
  const [values, setValues] = useState(initial);
  const set = <K extends keyof BoardValues>(key: K, value: BoardValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const suffix = withProgress ? ' del tablero' : '';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onSubmit(values) && !withProgress) setValues(EMPTY);
  };

  return (
    <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
      <Field label={`Título${suffix}`} value={values.title} maxLength={200} onChange={(event) => set('title', event.target.value)} required />
      <Field label={`Fecha límite${suffix}`} type="date" value={values.dueDate} onChange={(event) => set('dueDate', event.target.value)} required />
      <label className="block space-y-2 text-sm font-semibold">Tutor responsable{suffix}
        <select className={inputClassName} value={values.tutorId} onChange={(event) => set('tutorId', event.target.value)} required>
          <option value="">Seleccionar</option>
          {tutors.map((item) => <option key={item.user.id} value={item.user.id}>{item.user.fullName}</option>)}
        </select>
      </label>
      <label className="block space-y-2 text-sm font-semibold">Estudiante responsable{suffix}
        <select className={inputClassName} value={values.studentId} onChange={(event) => set('studentId', event.target.value)} required>
          <option value="">Seleccionar</option>
          {students.map((item) => <option key={item.user.id} value={item.user.id}>{item.user.fullName}</option>)}
        </select>
      </label>
      {withProgress && (
        <label className="block space-y-2 text-sm font-semibold">Progreso del tablero
          <select className={inputClassName} value={values.progressStatus} onChange={(event) => set('progressStatus', event.target.value as ProgressStatus)}>
            {(Object.keys(PROGRESS_LABELS) as ProgressStatus[]).map((value) => <option key={value} value={value}>{PROGRESS_LABELS[value]}</option>)}
          </select>
        </label>
      )}
      <Button type="submit" disabled={busy}>{submitLabel}</Button>
    </form>
  );
}

export function BoardPanel({ boards, selectedId, tutors, students, canManage, busy, onSelect, onCreate, onUpdate, onDelete }: BoardPanelProps) {
  const [editingId, setEditingId] = useState('');

  return (
    <PanelCard
      title="Tableros"
      action={<ClipboardList aria-hidden="true" className="size-5 text-gold" />}
      help={{
        title: 'Tableros',
        description: 'Cada tablero organiza las actividades de una etapa del proyecto: el formulario crea uno nuevo con título, fechas y responsables; al editarlo cambias esos datos; al archivarlo desaparece de la lista sin borrar sus actividades.',
        roles: {
          ADMIN: 'Como administrador, puedes crear tableros, asignar responsables, editarlos y archivarlos en cualquier proyecto.',
          AREA_MANAGER: 'Como encargado de área, ves los tableros de los proyectos de tus áreas, pero crearlos, asignar responsables o archivarlos requiere ser tutor del proyecto o administrador.',
          DEAN: 'Como decano, ves los tableros de los proyectos de tus facultades, pero crearlos o editarlos requiere ser tutor del proyecto o administrador.',
          TUTOR: 'Como tutor del proyecto, puedes crear tableros, asignar responsables, editarlos y archivarlos.',
          STUDENT: 'Como estudiante, ves los tableros del proyecto en el que participas y sus actividades, pero no puedes crearlos ni editarlos.',
        },
      }}
    >
      {canManage && <BoardForm initial={EMPTY} tutors={tutors} students={students} busy={busy} submitLabel="Crear tablero" onSubmit={onCreate} />}
      {boards.length === 0 ? (
        <div className={canManage ? 'mt-5' : ''}><EmptyState title="Sin tableros" description="Los tableros del proyecto aparecerán aquí." /></div>
      ) : (
        <ul className="mt-5 space-y-2">
          {boards.map((board) => {
            const selected = board.id === selectedId;
            return (
              <li key={board.id} className={`rounded-lg border p-4 ${selected ? 'border-navy bg-navy text-white' : 'border-navy/15 bg-canvas'}`}>
                <button type="button" aria-pressed={selected} className="w-full text-left" onClick={() => onSelect(board.id)}>
                  <strong>{board.title}</strong>
                  <span className="mt-1 block text-sm opacity-80">{PROGRESS_LABELS[board.progressStatus]} · {formatDate(board.dueDate)} · {board.activityCount} actividades</span>
                  <span className="mt-1 block text-sm opacity-80">Tutor: {board.responsibleTutor.fullName} · Estudiante: {board.responsibleStudent.fullName}</span>
                </button>
                {canManage && selected && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={() => setEditingId(editingId === board.id ? '' : board.id)}><Pencil aria-hidden="true" className="size-4" />Editar tablero</Button>
                    <Button type="button" variant="danger" disabled={busy} onClick={() => onDelete(board)}><Archive aria-hidden="true" className="size-4" />Archivar tablero</Button>
                  </div>
                )}
                {canManage && selected && editingId === board.id && (
                  <div className="mt-3 rounded-lg bg-paper p-4 text-navy">
                    <BoardForm
                      key={board.id}
                      initial={{ title: board.title, dueDate: board.dueDate, tutorId: board.responsibleTutor.id, studentId: board.responsibleStudent.id, progressStatus: board.progressStatus }}
                      tutors={tutors}
                      students={students}
                      busy={busy}
                      withProgress
                      submitLabel="Guardar tablero"
                      onSubmit={async (values) => { const saved = await onUpdate(board, values); if (saved) setEditingId(''); return saved; }}
                    />
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
