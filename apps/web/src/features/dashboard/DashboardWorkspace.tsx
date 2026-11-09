import { useEffect, useState } from 'react';
import { CalendarClock, Megaphone } from 'lucide-react';
import type { CurrentUser } from '../../types/auth';
import type { ApiRequest } from '../../types/api';
import { Button, EmptyState, ErrorNotice, LoadingState } from '../../components/WorkspaceUi';
import {
  getDashboard, getRecentAnnouncements, getUpcomingMeetings,
} from './api.ts';
import type { DashboardAnnouncement, DashboardData, DashboardMeeting, DashboardProject, DashboardSection } from './api.ts';
import { Distribution, Eyebrow, Figure, Meter, PROGRESS_LABELS, STATUS_LABELS } from './parts.tsx';

interface DashboardWorkspaceProps {
  user: CurrentUser;
  request: ApiRequest;
  onNavigate: (page: string) => void;
}

type Remote<T> = { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; data: T };
const LOADING = { status: 'loading' } as const;

function useRemote<T>(load: () => Promise<T>, deps: unknown[]): Remote<T> {
  const [state, setState] = useState<Remote<T>>(LOADING);
  useEffect(() => {
    let active = true;
    setState(LOADING);
    load().then(
      (data) => { if (active) setState({ status: 'ready', data }); },
      (error: unknown) => { if (active) setState({ status: 'error', error }); },
    );
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

const dateTime = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
function when(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : dateTime.format(date);
}

const card = 'min-w-0 rounded-xl border border-navy/10 bg-white p-5 shadow-card sm:p-7';
const darkCard = 'on-dark relative min-w-0 overflow-hidden rounded-xl bg-navy p-5 text-white sm:p-7';

function Nav({ children, page, onNavigate }: { children: string; page: string; onNavigate: (page: string) => void }) {
  return <Button variant="secondary" onClick={() => onNavigate(page)}>{children}</Button>;
}

function ProjectRow({ project, showRole }: { project: DashboardProject; showRole?: boolean }) {
  return (
    <li className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <p className="break-words font-bold text-navy">{project.title}</p>
        <p className="mt-1 text-sm text-navy/70">
          {STATUS_LABELS[project.status].replace(/s$/, '')} · {project.boards} {project.boards === 1 ? 'tablero' : 'tableros'}
          {showRole && project.projectRole === 'STUDENT_LEADER' && <span className="ml-2 inline-block rounded-full bg-gold px-2.5 py-0.5 text-xs font-semibold text-navy">Líder del proyecto</span>}
        </p>
      </div>
      <Meter done={project.activitiesDone} total={project.activities} label="Avance" />
    </li>
  );
}

function ProjectList({ section, showRole, title = 'Proyectos' }: { section: DashboardSection; showRole?: boolean; title?: string }) {
  const { items, total } = section.projects;
  return (
    <div className="min-w-0">
      <h3 className="text-base font-bold text-navy">{title} <span className="font-semibold text-navy/70">({total})</span></h3>
      {items.length === 0
        ? <div className="mt-3"><EmptyState title="Sin proyectos" description="Aún no hay proyectos en este alcance." /></div>
        : <ul className="mt-2 divide-y divide-navy/10">{items.map((p) => <ProjectRow key={p.id} project={p} showRole={showRole} />)}</ul>}
      {total > items.length && <p className="mt-2 text-sm text-navy/70">Se muestran {items.length} de {total} proyectos.</p>}
    </div>
  );
}

function AdminBlock({ section, onNavigate }: { section: DashboardSection; onNavigate: (page: string) => void }) {
  return (
    <div className={darkCard}>
      <div aria-hidden="true" className="texture-dots pointer-events-none absolute -right-10 -top-6 h-40 w-40 opacity-30" />
      <div className="relative grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Eyebrow dark>Visión institucional</Eyebrow>
          <h2 id="dash-ADMIN" className="mt-2 text-2xl font-extrabold tracking-tight">Toda la institución</h2>
          <dl className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Figure tone="dark" value={section.projects.total} label="Proyectos" />
            <Figure tone="dark" value={section.boards.overdue} label="Tableros vencidos" alert />
            <Figure tone="dark" value={section.activities.pendingApproval} label="Actividades por aprobar" alert />
          </dl>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={() => onNavigate('users')}>Crear usuarios</Button>
            <Button onClick={() => onNavigate('whatsapp')}>Estado de WhatsApp</Button>
          </div>
        </div>
        <div className="min-w-0 rounded-xl bg-navy-soft p-5">
          <h3 className="mb-4 text-sm font-bold">Proyectos por estado</h3>
          <Distribution tone="dark" counts={section.projects.byStatus} labels={STATUS_LABELS} total={section.projects.total} />
        </div>
      </div>
    </div>
  );
}

function AreaBlock({ section, onNavigate }: { section: DashboardSection; onNavigate: (page: string) => void }) {
  return (
    <div className={card}>
      <Eyebrow>Encargado de área</Eyebrow>
      <h2 id="dash-AREA_MANAGER" className="mt-2 text-xl font-bold tracking-tight text-navy">Mis áreas</h2>
      {section.scope.areas.length === 0
        ? <p className="mt-3 text-sm text-navy/70">No tienes áreas asignadas.</p>
        : <ul className="mt-3 flex flex-wrap gap-2">{section.scope.areas.map((a) => <li key={a.id} className="rounded-full border border-navy/30 px-3 py-1 text-sm font-semibold text-navy">{a.name}</li>)}</ul>}
      <dl className="mt-6 grid grid-cols-3 gap-4 border-y border-navy/10 py-5">
        <Figure value={section.projects.total} label="Proyectos" />
        <Figure value={section.activities.total} label="Actividades" />
        <Figure value={section.boards.overdue} label="Tableros vencidos" alert />
      </dl>
      <div className="mt-6"><ProjectList section={section} /></div>
      <div className="mt-5"><Nav page="announcements" onNavigate={onNavigate}>Ver novedades</Nav></div>
    </div>
  );
}

function DeanBlock({ section, onNavigate }: { section: DashboardSection; onNavigate: (page: string) => void }) {
  return (
    <div className={card}>
      <Eyebrow>Decanatura</Eyebrow>
      <h2 id="dash-DEAN" className="mt-2 text-xl font-bold tracking-tight text-navy">Mis facultades</h2>
      {section.scope.faculties.length === 0
        ? <p className="mt-3 text-sm text-navy/70">No tienes facultades vigentes.</p>
        : <ul className="mt-3 divide-y divide-navy/10 border-y border-navy/10">{section.scope.faculties.map((f) => <li key={f.id} className="py-3 text-lg font-bold text-navy">{f.name}</li>)}</ul>}
      <div className="mt-6"><ProjectList section={section} title="Proyectos con su avance" /></div>
      <div className="mt-5"><Nav page="academic" onNavigate={onNavigate}>Ver proyectos</Nav></div>
    </div>
  );
}

function TutorBlock({ section, onNavigate }: { section: DashboardSection; onNavigate: (page: string) => void }) {
  const pending = section.activities.pendingApproval;
  const overdue = section.boards.overdue;
  return (
    <div className={card}>
      <Eyebrow>Tutoría</Eyebrow>
      <h2 id="dash-TUTOR" className="mt-2 text-xl font-bold tracking-tight text-navy">Mis proyectos como tutor</h2>
      <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
        <p className={`min-w-0 rounded-lg border-l-4 p-4 ${pending > 0 ? 'border-gold bg-gold/15' : 'border-navy/20 bg-canvas'}`}>
          <span className="block text-3xl font-extrabold text-navy">{pending}</span>
          <span className="text-sm font-semibold text-navy">{pending === 1 ? 'actividad pendiente de aprobación' : 'actividades pendientes de aprobación'}</span>
        </p>
        <p className={`min-w-0 rounded-lg border-l-4 p-4 ${overdue > 0 ? 'border-alert bg-alert/10' : 'border-navy/20 bg-canvas'}`}>
          <span className={`block text-3xl font-extrabold ${overdue > 0 ? 'text-alert' : 'text-navy'}`}>{overdue}</span>
          <span className="text-sm font-semibold text-navy">{overdue === 1 ? 'tablero vencido' : 'tableros vencidos'}</span>
        </p>
      </div>
      <div className="mt-6"><ProjectList section={section} /></div>
      <div className="mt-5"><Nav page="academic" onNavigate={onNavigate}>Ver proyectos</Nav></div>
    </div>
  );
}

function StudentBlock({ section, onNavigate }: { section: DashboardSection; onNavigate: (page: string) => void }) {
  const done = section.activities.byProgress.DONE;
  return (
    <div className={card}>
      <Eyebrow>Participación</Eyebrow>
      <h2 id="dash-STUDENT" className="mt-2 text-xl font-bold tracking-tight text-navy">Mis actividades asignadas</h2>
      <div className="mt-5 grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Meter done={done} total={section.activities.total} label="Hechas" />
          <Distribution counts={section.activities.byProgress} labels={PROGRESS_LABELS} total={section.activities.total} />
        </div>
        <ProjectList section={section} showRole />
      </div>
      <div className="mt-5"><Nav page="academic" onNavigate={onNavigate}>Ver proyectos</Nav></div>
    </div>
  );
}

function renderSection(section: DashboardSection, onNavigate: (page: string) => void) {
  switch (section.role) {
    case 'ADMIN': return <AdminBlock section={section} onNavigate={onNavigate} />;
    case 'AREA_MANAGER': return <AreaBlock section={section} onNavigate={onNavigate} />;
    case 'DEAN': return <DeanBlock section={section} onNavigate={onNavigate} />;
    case 'TUTOR': return <TutorBlock section={section} onNavigate={onNavigate} />;
    case 'STUDENT': return <StudentBlock section={section} onNavigate={onNavigate} />;
  }
}

function MeetingsCard({ state, onNavigate, canCreate }: { state: Remote<DashboardMeeting[]>; onNavigate: (page: string) => void; canCreate: boolean }) {
  return (
    <section aria-labelledby="dash-meetings" className={card}>
      <h2 id="dash-meetings" className="flex items-center gap-2 text-xl font-bold tracking-tight text-navy"><CalendarClock aria-hidden="true" className="size-5" strokeWidth={1.75} />Próximas reuniones</h2>
      <div className="mt-4">
        {state.status === 'loading' ? <LoadingState label="Cargando reuniones…" />
          : state.status === 'error' ? <ErrorNotice error={state.error} />
          : state.data.length === 0 ? <EmptyState title="Sin reuniones próximas" description="No tienes reuniones programadas." />
          : <ul className="divide-y divide-navy/10">{state.data.slice(0, 5).map((m) => (
            <li key={m.id} className="min-w-0 py-3">
              <p className="break-words font-semibold text-navy">{m.reason}</p>
              <p className="text-sm text-navy/70">{when(m.startsAt)}{m.project ? ` · ${m.project.title}` : ''}</p>
            </li>))}</ul>}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Nav page="meetings" onNavigate={onNavigate}>Ver reuniones</Nav>
        {canCreate && <Button onClick={() => onNavigate('meetings')}>Nueva reunión</Button>}
      </div>
    </section>
  );
}

function AnnouncementsCard({ state, onNavigate }: { state: Remote<DashboardAnnouncement[]>; onNavigate: (page: string) => void }) {
  return (
    <section aria-labelledby="dash-news" className={card}>
      <h2 id="dash-news" className="flex items-center gap-2 text-xl font-bold tracking-tight text-navy"><Megaphone aria-hidden="true" className="size-5" strokeWidth={1.75} />Novedades recientes</h2>
      <div className="mt-4">
        {state.status === 'loading' ? <LoadingState label="Cargando novedades…" />
          : state.status === 'error' ? <ErrorNotice error={state.error} />
          : state.data.length === 0 ? <EmptyState title="Sin novedades" description="Aún no hay novedades para ti." />
          : <ul className="divide-y divide-navy/10">{state.data.slice(0, 3).map((a) => (
            <li key={a.id} className="min-w-0 py-3">
              <p className="break-words font-semibold text-navy">{a.title}</p>
              <p className="text-sm text-navy/70">{when(a.publishedAt)} · {a.author}</p>
            </li>))}</ul>}
      </div>
      <div className="mt-4"><Nav page="announcements" onNavigate={onNavigate}>Ver todas las novedades</Nav></div>
    </section>
  );
}

export function DashboardWorkspace({ user, request, onNavigate }: DashboardWorkspaceProps) {
  const dashboard: Remote<DashboardData> = useRemote(() => getDashboard(request), [request, user.id]);
  const meetings = useRemote(() => getUpcomingMeetings(request), [request, user.id]);
  const news = useRemote(() => getRecentAnnouncements(request), [request, user.id]);

  return (
    <div className="min-w-0 space-y-7">
      {dashboard.status === 'loading' ? <LoadingState label="Cargando tu panel…" />
        : dashboard.status === 'error' ? <ErrorNotice error={dashboard.error} />
        : dashboard.data.sections.length === 0
          ? <EmptyState title="Sin información para tu panel" description="Tu cuenta no tiene roles que muestren métricas todavía." />
          : dashboard.data.sections.map((section) => (
            <section key={section.role} aria-labelledby={`dash-${section.role}`} data-role={section.role} className="min-w-0">
              {renderSection(section, onNavigate)}
            </section>))}
      <div className="grid min-w-0 gap-7 lg:grid-cols-2">
        <MeetingsCard state={meetings} onNavigate={onNavigate} canCreate={['ADMIN', 'TUTOR', 'DEAN', 'AREA_MANAGER'].some((role) => user.roles.includes(role))} />
        <AnnouncementsCard state={news} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
