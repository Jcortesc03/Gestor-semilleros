import { useCallback, useEffect, useState } from 'react';
import type { ApiRequest } from '../../types/api.ts';
import { listDocuments } from './api.ts';
import type { ProjectDocument } from './api.ts';

export type DocumentsStatus = 'loading' | 'ready' | 'error';

export interface ProjectDocumentsState {
  status: DocumentsStatus;
  items: ProjectDocument[];
  error: unknown;
  reload: () => void;
}

interface Snapshot { projectId: string; status: DocumentsStatus; items: ProjectDocument[]; error: unknown }

/**
 * Lista de documentos de un proyecto. Cada carga tiene su propia bandera `active` dentro del efecto:
 * al cambiar de proyecto, al recargar o al desmontar (incluido el doble montaje de StrictMode),
 * la respuesta anterior se descarta y nunca pisa a la actual.
 */
export function useProjectDocuments(request: ApiRequest, projectId: string): ProjectDocumentsState {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>({ projectId, status: 'loading', items: [], error: null });

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setSnapshot({ projectId, status: 'loading', items: [], error: null });
    listDocuments(request, projectId).then(
      (items) => { if (active) setSnapshot({ projectId, status: 'ready', items, error: null }); },
      (error: unknown) => { if (active) setSnapshot({ projectId, status: 'error', items: [], error }); },
    );
    return () => { active = false; };
  }, [request, projectId, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);

  // Sin proyecto seleccionado no hay nada que pedir.
  if (!projectId) return { status: 'ready', items: [], error: null, reload };
  // Si la selección ya cambió, el dato guardado pertenece a otro proyecto: se muestra como carga.
  if (snapshot.projectId !== projectId) return { status: 'loading', items: [], error: null, reload };
  return { status: snapshot.status, items: snapshot.items, error: snapshot.error, reload };
}
