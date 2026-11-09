import { useEffect, useMemo, useRef, useState } from 'react';

import { BarChart3, BookOpen, Building2, CalendarClock, ClipboardList, LayoutDashboard, LogOut, Megaphone, Menu, MessageCircle, Settings, Users, X } from 'lucide-react';

import type { LucideIcon } from 'lucide-react';
import type { CurrentUser } from '../types/auth';
import { createApiRequest } from '../lib/api';
import { roleLabel } from '../lib/roles';
import { BrandMark } from '../components/BrandMark';
import { AlertMessage } from '../components/AlertMessage';
import { ChangePasswordPage } from '../pages/ChangePasswordPage';
import { Button, PanelCard } from '../components/WorkspaceUi';
import { AcademicWorkspace } from '../features/academic';
import { AnalyticsWorkspace } from '../features/analytics';
import { EnrollmentsWorkspace, canManageEnrollments } from '../features/enrollments';
import { DashboardWorkspace } from '../features/dashboard';
import { InstitutionWorkspace } from '../features/institution';
import { InstitutionalWorkspace } from '../features/institutional';
import { MeetingsWorkspace } from '../features/meetings';
import type { InstitutionalSection } from '../features/institutional';


type Page = 'account' | 'academic' | 'analytics' | 'enrollments' | 'meetings' | 'institution' | InstitutionalSection;

interface NavigationItem { key: Page; label: string; icon: LucideIcon }
interface WorkspaceProps {
  user: CurrentUser;
  onSignOut: () => Promise<void>;
  onExpired: () => void;
  onRefresh: () => void;
  signingOut: boolean;
  error: string | null;
}

function getInitials(user: CurrentUser): string {
  const parts = user.fullName.trim().split(/\s+/).filter((part) => part.length > 0);
  if (parts.length >= 2) return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return user.email.trim().charAt(0).toUpperCase() || 'U';
}

export function Workspace({ user, onSignOut, onExpired, onRefresh, signingOut, error }: WorkspaceProps) {
  const [page, setPage] = useState<Page>('account');
  const [meetingProjectId, setMeetingProjectId] = useState<string | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const request = useMemo(() => createApiRequest(globalThis.fetch, () => {
    if (mounted.current) onExpired();
  }), [onExpired]);

  const navigation = useMemo<NavigationItem[]>(() => {
    const items: NavigationItem[] = [{ key: 'account', label: 'Mi panel', icon: LayoutDashboard }];
    if (user.roles.some((role) => ['ADMIN', 'AREA_MANAGER', 'DEAN', 'TUTOR', 'STUDENT'].includes(role))) {
      items.push({ key: 'academic', label: 'Proyectos y actividades', icon: BookOpen });
    }
    if (user.roles.some((role) => ['ADMIN', 'AREA_MANAGER', 'DEAN'].includes(role))) {
      items.push({ key: 'analytics', label: 'Analítica', icon: BarChart3 });
    }
    // «Inscripciones» solo para ADMIN y AREA_MANAGER; el backend también lo exige.
    if (canManageEnrollments(user.roles)) items.push({ key: 'enrollments', label: 'Inscripciones', icon: ClipboardList });
    // GET /api/meetings admite cualquier sesión válida (docs/api/meetings.md).
    items.push({ key: 'meetings', label: 'Reuniones', icon: CalendarClock });
    if (user.roles.some((role) => role === 'ADMIN' || role === 'AREA_MANAGER')) items.push({ key: 'institution', label: 'Áreas y facultades', icon: Building2 });
    if (user.roles.includes('ADMIN')) items.push({ key: 'users', label: 'Usuarios', icon: Users });
    items.push({ key: 'announcements', label: 'Novedades', icon: Megaphone });
    items.push({ key: 'preferences', label: 'Mis notificaciones', icon: Settings });
    if (user.roles.includes('ADMIN')) items.push({ key: 'whatsapp', label: 'Estado de WhatsApp', icon: MessageCircle });
    return items;
  }, [user.roles]);

  useEffect(() => {
    const update = () => {
      const hash = window.location.hash.slice(1);
      const key = navigation.find((item) => item.key === hash)?.key ?? 'account';
      setPage(key);
      if (key !== 'meetings') setMeetingProjectId(undefined);
    };
    update();
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, [navigation]);

  useEffect(() => {
    const element = dialog.current;
    if (!menuOpen || !element) return;
    if (!element.open) element.showModal();
    return () => { if (element.open) element.close(); };
  }, [menuOpen]);

  function navigate(next: Page) {
    setMeetingProjectId(undefined);
    setPage(next);
    window.location.hash = next;
    setMenuOpen(false);
  }

  function goToMeetings(projectId?: string) {
    setMeetingProjectId(projectId);
    setPage('meetings');
    window.location.hash = 'meetings';
    setMenuOpen(false);
  }

  function goTo(key: string) {
    const target = navigation.find((item) => item.key === key);
    if (target) navigate(target.key);
  }

  function renderNavigation() {
    return <>
      <BrandMark variant="light" />
      <div className="mt-8 min-w-0 rounded-xl bg-navy-soft p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-gold text-sm font-bold text-navy"
          >
            {getInitials(user)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{user.fullName}</p>
            <p className="truncate text-xs text-white/75">{user.email}</p>
          </div>
        </div>
        <p className="mt-3 border-t border-white/10 pt-3 text-[0.6875rem] font-semibold uppercase leading-relaxed tracking-[0.18em] text-gold">{user.roles.map(roleLabel).join(' · ') || 'Sin roles asignados'}</p>
      </div>
      <nav aria-label="Secciones de la aplicación" className="mt-7 space-y-1.5">
        {navigation.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" disabled={signingOut} aria-current={page === key ? 'page' : undefined}
            onClick={() => navigate(key)} className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${page === key ? 'bg-gold text-navy' : 'text-white/85 hover:bg-white/10 hover:text-white'}`}>
            <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.75} /><span className="min-w-0">{label}</span>
          </button>
        ))}
      </nav>
      <Button disabled={signingOut} onClick={() => void onSignOut()} className="mt-auto w-full">
        <LogOut aria-hidden="true" className="size-4" />{signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </Button>
    </>;
  }

  const title = navigation.find((item) => item.key === page)?.label ?? 'Mi panel';
  return (
    <div className="min-h-dvh overflow-x-clip bg-canvas text-navy lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="on-dark relative hidden h-dvh flex-col gap-5 overflow-hidden bg-navy p-6 text-white lg:flex">
        <div aria-hidden="true" className="texture-dots pointer-events-none absolute -right-12 top-0 h-44 w-44 opacity-30" />
        <div className="relative flex min-h-0 flex-1 flex-col gap-5">{renderNavigation()}</div>
      </aside>
      <dialog ref={dialog} onClose={() => setMenuOpen(false)} aria-labelledby="mobile-menu-title"
        className="on-dark fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto border-0 bg-navy p-6 text-white backdrop:bg-navy/60 sm:max-w-sm">
        <header className="mb-6 flex items-center justify-between gap-4"><h2 id="mobile-menu-title" className="font-bold">Navegación</h2><button type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar navegación" className="grid size-12 shrink-0 place-items-center rounded-lg transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"><X aria-hidden="true" /></button></header>
        <div className="flex min-h-[calc(100dvh-110px)] flex-col gap-5">{renderNavigation()}</div>
      </dialog>
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-4 border-b border-navy/10 bg-white px-5 py-4 sm:px-8 lg:px-10">
          <p className="min-w-0 text-sm font-bold tracking-tight">Gestor de Semilleros <span className="hidden font-semibold text-navy/70 sm:inline">/ Espacio de trabajo</span></p>
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir navegación" aria-expanded={menuOpen} className="grid size-12 shrink-0 place-items-center rounded-lg border border-navy/30 text-navy transition hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy lg:hidden"><Menu aria-hidden="true" /></button>
        </header>
        <main inert={signingOut} aria-busy={signingOut} className="mx-auto w-full max-w-7xl space-y-7 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy/70">Tu espacio de investigación</p>
            <h1 className="mt-2 text-balance text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">{title}</h1>
            <div aria-hidden="true" className="hairline-gold mt-4" />
          </div>
          {error && <AlertMessage message={error} />}
          {page === 'account' ? <>
            <DashboardWorkspace user={user} request={request} onNavigate={goTo} />
            <PanelCard title={`Hola, ${user.fullName}`} action={<>
              <Button variant="secondary" onClick={onRefresh}>Actualizar cuenta</Button>
              <Button variant="secondary" onClick={() => { setPasswordChanged(false); setChangingPassword(true); }}>Cambiar contraseña</Button>
            </>}>
              <dl className="grid gap-6 sm:grid-cols-2">
                <div className="min-w-0"><dt className="text-sm text-navy/70">Correo electrónico</dt><dd className="mt-1 break-all font-semibold text-navy">{user.email}</dd></div>
                <div className="min-w-0"><dt className="text-sm text-navy/70">Roles asignados</dt><dd className="mt-1 font-semibold text-navy">{user.roles.map(roleLabel).join(' · ') || 'Sin roles asignados'}</dd></div>
              </dl>
            </PanelCard>
            {passwordChanged && <AlertMessage variant="plain" message="Tu contraseña se actualizó." />}
            {changingPassword && (
              <ChangePasswordPage
                mode="voluntary"
                email={user.email}
                request={request}
                onCancel={() => setChangingPassword(false)}
                onChanged={() => { setChangingPassword(false); setPasswordChanged(true); }}
              />
            )}
          </> : page === 'academic'
            ? <AcademicWorkspace user={user} request={request} onCreateMeeting={(projectId) => goToMeetings(projectId)} />
            : page === 'analytics'
            ? <AnalyticsWorkspace request={request} />
            : page === 'enrollments'
            ? <EnrollmentsWorkspace user={user} request={request} />
            : page === 'meetings'
            ? <MeetingsWorkspace user={user} request={request} initialProjectId={meetingProjectId} />
            : page === 'institution'
            ? <InstitutionWorkspace user={user} request={request} />
            : <InstitutionalWorkspace user={user} request={request} section={page} />}
        </main>
      </div>
    </div>
  );
}
