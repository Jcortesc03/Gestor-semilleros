import { useMemo } from 'react';
import type { CurrentUser } from '../../types/auth.ts';
import type { ApiRequest } from '../../types/api.ts';
import { ErrorNotice, LoadingState } from '../../components/WorkspaceUi.tsx';
import * as api from './api.ts';
import { ActivityList } from './ActivityList.tsx';
import { BoardPanel } from './BoardPanel.tsx';
import { CreateProjectForm } from './CreateProjectForm.tsx';
import { MembersPanel } from './MembersPanel.tsx';
import { ProjectDetail } from './ProjectDetail.tsx';
import { ProjectList } from './ProjectList.tsx';
import { canCreateProject, resolvePermissions } from './permissions.ts';
import { useAcademicData } from './useAcademicData.ts';
import { useAction } from './useAction.ts';
import { useProjectDocuments } from '../documents/index.ts';

export interface AcademicWorkspaceProps { user: CurrentUser; request: ApiRequest }

const confirmAction = (message: string) => window.confirm(message);

export function AcademicWorkspace({ user, request }: AcademicWorkspaceProps) {
  const data = useAcademicData(request);
  const documents = useProjectDocuments(request, data.projectId);
  const { busy, error: actionError, run } = useAction();
  const { projects, projectId, boardId, boards, members, activities } = data;

  const project = projects.find((item) => item.id === projectId);
  const board = boards.find((item) => item.id === boardId);
  const can = useMemo(() => resolvePermissions(user, members), [user, members]);
  const tutors = useMemo(() => members.filter((item) => item.status === 'ACTIVE' && item.projectRole === 'TUTOR'), [members]);
  const students = useMemo(() => members.filter((item) => item.status === 'ACTIVE' && item.projectRole !== 'TUTOR'), [members]);

  const reloadBoth = async () => { await data.reloadActivities(); await data.reloadProject(); };

  return (
    <div className="space-y-8">
      <header className="rounded-xl bg-navy p-6 text-white shadow-card sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold">Trabajo académico</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Proyectos y seguimiento</h1>
        <p className="mt-3 max-w-2xl text-white/80">Gestiona semilleros, tableros y actividades según tu participación en cada proyecto.</p>
      </header>

      {actionError !== null && <ErrorNotice error={actionError} />}

      {canCreateProject(user) && (
        <CreateProjectForm
          request={request}
          user={user}
          busy={busy}
          onCreate={async (values) => {
            let createdId = '';
            const ok = await run(
              async () => {
                const created = await api.createProject(request, {
                  title: values.title.trim(),
                  ...(values.description.trim() ? { description: values.description.trim() } : {}),
                  areaId: values.areaId,
                  facultyIds: values.facultyIds,
                });
                createdId = created.id;
              },
              () => data.reloadList({ preferredId: createdId, silent: true }),
            );
            return ok;
          }}
        />
      )}

      <ProjectList
        projects={projects}
        selectedId={projectId}
        status={data.listStatus}
        error={data.listError}
        onSelect={data.selectProject}
        onRetry={() => void data.reloadList()}
      />

      {project && (
        <>
          <ProjectDetail
            key={project.id}
            request={request}
            user={user}
            project={project}
            canManage={can.manageProject}
            canDeleteAnyDocument={can.deleteAnyDocument}
            busy={busy}
            onSave={(changes) => run(
              () => api.updateProject(request, project.id, changes),
              () => data.reloadList({ silent: true }),
            )}
            onDocumentsChanged={documents.reload}
            onDelete={() => {
              if (!confirmAction('¿Archivar este proyecto? Dejará de aparecer en los listados.')) return;
              void run(() => api.deleteProject(request, project.id), () => data.reloadList({ silent: true }));
            }}
          />

          {data.detailStatus === 'loading' && <LoadingState label="Cargando tableros y participantes…" />}
          {data.detailStatus === 'error' && <ErrorNotice error={data.detailError} />}

          {data.detailStatus === 'ready' && (
            <>
              <div className="grid gap-6 xl:grid-cols-2">
                <MembersPanel
                  request={request}
                  members={members}
                  canManageTutors={can.manageTutors}
                  canManageStudents={can.manageStudents}
                  busy={busy}
                  onAdd={(userId, projectRole) => run(() => api.addMember(request, project.id, { userId, projectRole }), data.reloadProject)}
                  onRemove={(member) => {
                    if (!confirmAction(`¿Retirar a ${member.user.fullName} del proyecto?`)) return;
                    void run(() => api.deleteMember(request, project.id, member.id), data.reloadProject);
                  }}
                  onTogglePrimary={(member) => void run(() => api.updateMember(request, project.id, member.id, { isPrimary: !member.isPrimary }), data.reloadProject)}
                  onToggleLeader={(member) => void run(
                    () => api.updateMember(request, project.id, member.id, { projectRole: member.projectRole === 'STUDENT' ? 'STUDENT_LEADER' : 'STUDENT' }),
                    data.reloadProject,
                  )}
                />
                <BoardPanel
                  boards={boards}
                  selectedId={boardId}
                  tutors={tutors}
                  students={students}
                  canManage={can.manageBoards}
                  busy={busy}
                  onSelect={data.selectBoard}
                  onCreate={(values) => run(
                    () => api.createBoard(request, project.id, {
                      title: values.title.trim(),
                      dueDate: values.dueDate,
                      responsibleTutorId: values.tutorId,
                      responsibleStudentId: values.studentId,
                    }),
                    data.reloadProject,
                  )}
                  onUpdate={(target, values) => run(
                    () => api.updateBoard(request, target.id, {
                      title: values.title.trim(),
                      dueDate: values.dueDate,
                      progressStatus: values.progressStatus,
                      responsibleTutorId: values.tutorId,
                      responsibleStudentId: values.studentId,
                    }),
                    data.reloadProject,
                  )}
                  onDelete={(target) => {
                    if (!confirmAction(`¿Archivar el tablero "${target.title}"?`)) return;
                    void run(() => api.deleteBoard(request, target.id), data.reloadProject);
                  }}
                />
              </div>

              {board && (
                <ActivityList
                  key={board.id}
                  board={board}
                  activities={activities}
                  status={data.activitiesStatus}
                  error={data.activitiesError}
                  students={students}
                  currentUserId={user.id}
                  canManage={can.manageActivities}
                  canReview={can.review}
                  busy={busy}
                  documents={documents}
                  onCreate={(title, description) => run(() => api.createActivity(request, board.id, { title, description }), reloadBoth)}
                  onProgress={(item, status) => void run(() => api.updateActivity(request, item.id, { progressStatus: status }), data.reloadActivities)}
                  onApproval={(item, status) => void run(() => api.approveActivity(request, item.id, status), data.reloadActivities)}
                  onResult={(item, result) => void run(() => api.updateActivity(request, item.id, { result }), data.reloadActivities)}
                  onDelete={(item) => {
                    if (!confirmAction(`¿Eliminar la actividad "${item.title}"?`)) return;
                    void run(() => api.deleteActivity(request, item.id), reloadBoth);
                  }}
                  onAddAssignee={(item, userId) => run(() => api.addAssignee(request, item.id, userId), data.reloadActivities)}
                  onRemoveAssignee={(item, userId) => void run(() => api.removeAssignee(request, item.id, userId), data.reloadActivities)}
                  onAddLink={(item, url) => run(() => Promise.resolve().then(() => api.addAttachment(request, item.id, url)), data.reloadActivities)}
                  onAddDocument={(item, documentId) => run(() => api.addDocumentAttachment(request, item.id, documentId), data.reloadActivities)}
                  onRemoveLink={(item, attachmentId) => void run(() => api.removeAttachment(request, item.id, attachmentId), data.reloadActivities)}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
