import { Button, EmptyState, ErrorNotice, LoadingState, PanelCard } from '../../components/WorkspaceUi.tsx';
import type { Project } from './api.ts';
import { PROJECT_STATUS_LABELS } from './labels.ts';

interface ProjectListProps {
  projects: Project[];
  selectedId: string;
  status: 'loading' | 'ready' | 'error';
  error: unknown;
  onSelect: (projectId: string) => void;
  onRetry: () => void;
}

export function ProjectList({ projects, selectedId, status, error, onSelect, onRetry }: ProjectListProps) {
  return (
    <PanelCard title="Proyectos visibles" action={status === 'ready' ? <span className="text-sm text-navy/70">{projects.length} en total</span> : undefined}>
      {status === 'loading' && <LoadingState label="Cargando proyectos académicos…" />}
      {status === 'error' && (
        <div className="space-y-4">
          <ErrorNotice error={error} />
          <Button type="button" variant="secondary" onClick={onRetry}>Reintentar</Button>
        </div>
      )}
      {status === 'ready' && projects.length === 0 && (
        <EmptyState title="No hay proyectos visibles" description="Todavía no participas en ningún proyecto o no hay proyectos registrados para tu sesión." />
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
    </PanelCard>
  );
}
