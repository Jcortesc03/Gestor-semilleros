import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiRequest } from '../../types/api.ts';
import * as api from './api.ts';

type Status = 'loading' | 'ready' | 'error';
interface ProjectDetail { projectId: string; boards: api.Board[]; members: api.Member[] }
interface BoardActivities { boardId: string; items: api.Activity[] }

/**
 * Carga y selección del área académica. Cada respuesta se etiqueta con el proyecto o tablero que la pidió
 * y se descarta si la selección ya cambió, de modo que una respuesta tardía nunca se mezcla con otra vista.
 */
export function useAcademicData(request: ApiRequest) {
  const [projects, setProjects] = useState<api.Project[]>([]);
  const [listStatus, setListStatus] = useState<Status>('loading');
  const [listError, setListError] = useState<unknown>(null);
  const [projectId, setProjectId] = useState('');
  const [boardId, setBoardId] = useState('');
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<Status>('ready');
  const [detailError, setDetailError] = useState<unknown>(null);
  const [activityData, setActivityData] = useState<BoardActivities | null>(null);
  const [activitiesStatus, setActivitiesStatus] = useState<Status>('ready');
  const [activitiesError, setActivitiesError] = useState<unknown>(null);

  const mounted = useRef(false);
  const projectIdRef = useRef('');
  const boardIdRef = useRef('');
  const listVersion = useRef(0);

  const selectBoard = useCallback((id: string) => {
    boardIdRef.current = id;
    setBoardId(id);
  }, []);

  const selectProject = useCallback((id: string) => {
    if (projectIdRef.current === id) return;
    projectIdRef.current = id;
    boardIdRef.current = '';
    setProjectId(id);
    setBoardId('');
  }, []);

  /** Carga la lista; `preferredId` fuerza la selección (p. ej. el proyecto recién creado). */
  const loadProjects = useCallback(async (options: { preferredId?: string; silent?: boolean } = {}) => {
    const version = ++listVersion.current;
    if (!options.silent) { setListStatus('loading'); setListError(null); }
    try {
      const value = await api.listProjects(request);
      if (!mounted.current || version !== listVersion.current) return;
      setProjects(value);
      setListStatus('ready');
      const wanted = options.preferredId ?? projectIdRef.current;
      selectProject(value.some((item) => item.id === wanted) ? wanted : value[0]?.id ?? '');
    } catch (reason) {
      if (!mounted.current || version !== listVersion.current) return;
      setListError(reason);
      setListStatus('error');
    }
  }, [request, selectProject]);

  useEffect(() => {
    mounted.current = true;
    void loadProjects();
    return () => { mounted.current = false; listVersion.current++; };
  }, [loadProjects]);

  useEffect(() => {
    if (!projectId) { setDetail(null); setDetailStatus('ready'); return; }
    let current = true;
    setDetail(null);
    setDetailStatus('loading');
    setDetailError(null);
    Promise.all([api.listBoards(request, projectId), api.listMembers(request, projectId)]).then(([boards, members]) => {
      if (!current || projectIdRef.current !== projectId) return;
      setDetail({ projectId, boards, members });
      setDetailStatus('ready');
      selectBoard(boards[0]?.id ?? '');
    }, (reason: unknown) => {
      if (!current || projectIdRef.current !== projectId) return;
      setDetailError(reason);
      setDetailStatus('error');
    });
    return () => { current = false; };
  }, [projectId, request, selectBoard]);

  useEffect(() => {
    if (!boardId) { setActivityData(null); setActivitiesStatus('ready'); return; }
    let current = true;
    setActivityData(null);
    setActivitiesStatus('loading');
    setActivitiesError(null);
    api.listActivities(request, boardId).then((items) => {
      if (!current || boardIdRef.current !== boardId) return;
      setActivityData({ boardId, items });
      setActivitiesStatus('ready');
    }, (reason: unknown) => {
      if (!current || boardIdRef.current !== boardId) return;
      setActivitiesError(reason);
      setActivitiesStatus('error');
    });
    return () => { current = false; };
  }, [boardId, request]);

  /** Recarga tableros y participantes del proyecto que estaba seleccionado al pedirlo. */
  const reloadProject = useCallback(async () => {
    const requested = projectIdRef.current;
    if (!requested) return;
    const [boards, members] = await Promise.all([api.listBoards(request, requested), api.listMembers(request, requested)]);
    if (!mounted.current || projectIdRef.current !== requested) return;
    setDetail({ projectId: requested, boards, members });
    if (!boards.some((item) => item.id === boardIdRef.current)) selectBoard(boards[0]?.id ?? '');
  }, [request, selectBoard]);

  /** Recarga las actividades del tablero que estaba seleccionado al pedirlo. */
  const reloadActivities = useCallback(async () => {
    const requested = boardIdRef.current;
    if (!requested) return;
    const items = await api.listActivities(request, requested);
    if (!mounted.current || boardIdRef.current !== requested) return;
    setActivityData({ boardId: requested, items });
  }, [request]);

  const detailIsCurrent = detail !== null && detail.projectId === projectId;
  const activitiesAreCurrent = activityData !== null && activityData.boardId === boardId;

  return {
    projects,
    listStatus,
    listError,
    reloadList: loadProjects,
    projectId,
    selectProject,
    boardId,
    selectBoard,
    boards: detailIsCurrent ? detail.boards : [],
    members: detailIsCurrent ? detail.members : [],
    detailStatus,
    detailError,
    activities: activitiesAreCurrent ? activityData.items : [],
    activitiesStatus,
    activitiesError,
    reloadProject,
    reloadActivities,
  };
}

export type AcademicData = ReturnType<typeof useAcademicData>;
