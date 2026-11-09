import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Pagination } from '../../components/Pagination.tsx';
import { Button, EmptyState, ErrorNotice, LoadingState, PanelCard, inputClassName } from '../../components/WorkspaceUi.tsx';
import type { Project } from './api.ts';
import { PROJECT_STATUS_LABELS } from './labels.ts';

interface ProjectListProps {
  projects: Project[];
  selectedId: string;
  status: 'loading' | 'ready' | 'error';
  error: unknown;
  search: string;
  page: number;
  pageSize: number;
  total: number;
  onSelect: (projectId: string) => void;
  onRetry: () => void;
  onSearch: (search: string) => void;
  onPageChange: (page: number) => void;
}

export function ProjectList({ projects, selectedId, status, error, search, page, pageSize, total, onSelect, onRetry, onSearch, onPageChange }: ProjectListProps) {
  const [text, setText] = useState(search);
  // La búsqueda vive en el hook para que la compartan el listado y la paginación.
  useEffect(() => setText(search), [search]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(text);
  };

  return (
    <PanelCard
      title="Proyectos visibles"
      action={status === 'ready' ? <span className="text-sm text-navy/70">{total} en total</span> : undefined}
      help={{
        title: 'Proyectos visibles',
        description: 'Lista de proyectos según tu rol, por páginas; usa el buscador para filtrar por título. Al pulsar uno se cargan abajo su detalle, participantes, tableros, actividades y documentos; no se crea ni se borra nada desde aquí.',
        roles: {
          ADMIN: 'Como administrador, ves todos los proyectos de la plataforma. Al elegir uno se cargan su detalle, participantes, tableros y documentos para gestionarlos.',
          AREA_MANAGER: 'Como encargado de área, ves los proyectos de tus áreas asignadas. Al elegir uno se cargan su detalle, participantes, tableros y documentos para gestionarlos.',
          DEAN: 'Como decano, ves los proyectos de tus facultades. Al elegir uno se cargan su detalle, participantes, tableros y documentos para gestionarlos.',
          TUTOR: 'Como tutor, ves los proyectos en los que eres tutor. Al elegir uno se cargan su detalle, participantes, tableros y documentos para trabajar en él.',
          STUDENT: 'Como estudiante, ves los proyectos en los que participas. Al elegir uno se cargan su detalle, tableros, actividades y documentos para consultar y trabajar.',
        },
      }}
    >
      <form className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={submit}>
        <label className="block space-y-2 text-sm font-semibold">Buscar proyecto por título
          <input
            type="search"
            className={inputClassName}
            value={text}
            maxLength={100}
            placeholder="Título del proyecto"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <Button type="submit">Buscar</Button>
      </form>
      {status === 'loading' && <LoadingState label="Cargando proyectos académicos…" />}
      {status === 'error' && (
        <div className="space-y-4">
          <ErrorNotice error={error} />
          <Button type="button" variant="secondary" onClick={onRetry}>Reintentar</Button>
        </div>
      )}
      {status === 'ready' && projects.length === 0 && (
        search
          ? <EmptyState title="Sin resultados" description={`No hay proyectos que coincidan con «${search}».`} />
          : <EmptyState title="No hay proyectos visibles" description="Todavía no participas en ningún proyecto o no hay proyectos registrados para tu sesión." />
      )}
      {status === 'ready' && projects.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {projects.map((project) => {
            const selected = project.id === selectedId;
            return (
              <li key={project.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(project.id)}
                  className={`w-full rounded-lg border p-4 text-left transition ${selected ? 'border-navy bg-navy text-white' : 'border-navy/15 bg-canvas hover:border-navy/40'}`}
                >
                  <strong className="block">{project.title}</strong>
                  <span className="mt-2 block text-sm opacity-80">{PROJECT_STATUS_LABELS[project.status]} · {project.area.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {status === 'ready' && (
        <Pagination label="Proyectos" page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
      )}
    </PanelCard>
  );
}
