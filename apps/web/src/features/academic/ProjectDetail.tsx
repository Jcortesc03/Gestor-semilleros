import { useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, Pencil } from 'lucide-react';
import { Button, Field, PanelCard, formatDate, inputClassName } from '../../components/WorkspaceUi.tsx';
import type { Project, ProjectStatus } from './api.ts';
import { PROJECT_STATUS_LABELS } from './labels.ts';

export interface ProjectChanges { title: string; description: string | null; status: ProjectStatus }

interface ProjectDetailProps {
  project: Project;
  canManage: boolean;
  busy: boolean;
  onSave: (changes: ProjectChanges) => Promise<boolean>;
  onDelete: () => void;
}

export function ProjectDetail({ project, canManage, busy, onSave, onDelete }: ProjectDetailProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? '');
  const [status, setStatus] = useState<ProjectStatus>(project.status);

  const startEditing = () => {
    setTitle(project.title);
    setDescription(project.description ?? '');
    setStatus(project.status);
    setEditing((current) => !current);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await onSave({ title: title.trim(), description: description.trim() || null, status });
    if (saved) setEditing(false);
  };

  return (
    <PanelCard
      title={project.title}
      action={(
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-gold/25 px-3 py-1 text-xs font-bold">{PROJECT_STATUS_LABELS[project.status]}</span>
          {canManage && <Button type="button" variant="secondary" onClick={startEditing}><Pencil aria-hidden="true" className="size-4" />Editar proyecto</Button>}
        </div>
      )}
    >
      <p className="leading-relaxed text-navy/75">{project.description || 'Este proyecto no tiene descripción registrada.'}</p>
      <p className="mt-3 text-sm text-navy/70">
        Área: {project.area.name} · Facultades: {project.faculties.map((item) => item.name).join(', ') || 'sin facultad'}
        {project.startsOn ? ` · Inicio: ${formatDate(project.startsOn)}` : ''}
        {project.endsOn ? ` · Fin: ${formatDate(project.endsOn)}` : ''}
      </p>
      {editing && canManage && (
        <form className="mt-6 grid gap-3 border-t border-navy/10 pt-5 md:grid-cols-2" onSubmit={(event) => void submit(event)}>
          <Field label="Título del proyecto" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} required />
          <Field label="Descripción del proyecto" value={description} onChange={(event) => setDescription(event.target.value)} />
          <label className="block space-y-2 text-sm font-semibold">Estado del proyecto
            <select className={inputClassName} value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)}>
              {(Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[]).map((value) => <option key={value} value={value}>{PROJECT_STATUS_LABELS[value]}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <Button type="submit" disabled={busy}>Guardar cambios</Button>
            <Button type="button" variant="danger" disabled={busy} onClick={onDelete}><Archive aria-hidden="true" className="size-4" />Archivar proyecto</Button>
          </div>
        </form>
      )}
    </PanelCard>
  );
}
