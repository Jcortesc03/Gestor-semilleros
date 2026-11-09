import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiRequest } from '../../types/api.ts';
import { DOCUMENTS_PAGE_SIZE, listDocuments } from './api.ts';
import type { ProjectDocument } from './api.ts';

export type DocumentsStatus = 'loading' | 'ready' | 'error';

export interface ProjectDocumentsOptions {
  /** Documentos por página; el selector de adjuntos usa 100 (ADR 0017) y la sección, 20. */
  pageSize?: number;
}

export interface ProjectDocumentsState {
  status: DocumentsStatus;
  items: ProjectDocument[];
  total: number;
  page: number;
  pageSize: number;
  error: unknown;
  reload: () => void;
  setPage: (page: number) => void;
}

interface Snapshot { projectId: string; page: number; status: DocumentsStatus; items: ProjectDocument[]; total: number; pageSize: number; error: unknown }
interface Selection { projectId: string; page: number }

/**
 * Lista paginada de documentos de un proyecto (ADR 0017). Cada carga tiene su propia bandera `active`:
 * al cambiar de proyecto, de página, al recargar o al desmontar (incluido el doble montaje de StrictMode),
 * la respuesta anterior se descarta y nunca pisa a la actual.
 */
export function useProjectDocuments(request: ApiRequest, projectId: string, options: ProjectDocumentsOptions = {}): ProjectDocumentsState {
  const pageSize = options.pageSize ?? DOCUMENTS_PAGE_SIZE;
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<Selection>({ projectId, page: 1 });
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  // Al cambiar de proyecto se vuelve a la página 1 sin pedir una página del proyecto anterior.
  const currentPage = selection.projectId === projectId ? selection.page : 1;
  useEffect(() => {
    if (selection.projectId !== projectId) setSelection({ projectId, page: 1 });
  }, [projectId, selection.projectId]);

  const [snapshot, setSnapshot] = useState<Snapshot>({ projectId, page: 1, status: 'loading', items: [], total: 0, pageSize, error: null });

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    setSnapshot((previous) => (previous.projectId === projectId && previous.page === currentPage
      ? { ...previous, status: 'loading', error: null }
      : { projectId, page: currentPage, status: 'loading', items: [], total: 0, pageSize, error: null }));
    listDocuments(request, projectId, {
      page: currentPage,
      pageSize: pageSize === DOCUMENTS_PAGE_SIZE ? undefined : pageSize,
    }).then(
      (result) => {
        if (!active) return;
        // Si la página quedó vacía tras borrar su último documento, se retrocede una página.
        if (result.items.length === 0 && result.total > 0 && result.page > 1) {
          setSelection({ projectId, page: result.page - 1 });
          return;
        }
        setSnapshot({ projectId, page: result.page, status: 'ready', items: result.items, total: result.total, pageSize: result.pageSize, error: null });
      },
      (error: unknown) => {
        if (active) setSnapshot({ projectId, page: currentPage, status: 'error', items: [], total: 0, pageSize, error });
      },
    );
    return () => { active = false; };
  }, [request, projectId, currentPage, pageSize, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const setPage = useCallback((page: number) => setSelection({ projectId: projectIdRef.current, page }), []);

  // Sin proyecto seleccionado no hay nada que pedir.
  if (!projectId) return { status: 'ready', items: [], total: 0, page: 1, pageSize, error: null, reload, setPage };
  // Si la selección ya cambió, el dato guardado pertenece a otra página o proyecto: se muestra como carga.
  if (snapshot.projectId !== projectId || snapshot.page !== currentPage) {
    return { status: 'loading', items: [], total: 0, page: currentPage, pageSize, error: null, reload, setPage };
  }
  return { status: snapshot.status, items: snapshot.items, total: snapshot.total, page: snapshot.page, pageSize: snapshot.pageSize, error: snapshot.error, reload, setPage };
}
