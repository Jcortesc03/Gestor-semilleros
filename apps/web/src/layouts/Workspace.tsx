import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CalendarClock, LayoutDashboard, LogOut, Megaphone, Menu, MessageCircle, Settings, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CurrentUser } from '../types/auth';
import { createApiRequest } from '../lib/api';
import { roleLabel } from '../lib/roles';
import { BrandMark } from '../components/BrandMark';
import { AlertMessage } from '../components/AlertMessage';
import { Button, EmptyState, PanelCard } from '../components/WorkspaceUi';
import { AcademicWorkspace } from '../features/academic';
import { InstitutionalWorkspace } from '../features/institutional';
import { MeetingsWorkspace } from '../features/meetings';
import type { InstitutionalSection } from '../features/institutional';

type Page = 'account' | 'academic' | 'meetings' | InstitutionalSection;
interface NavigationItem { key: Page; label: string; icon: LucideIcon }
interface WorkspaceProps {
  user: CurrentUser;
  onSignOut: () => Promise<void>;
  onExpired: () => void;
  onRefresh: () => void;
  signingOut: boolean;
  error: string | null;
}

export function Workspace({ user, onSignOut, onExpired, onRefresh, signingOut, error }: WorkspaceProps) {
  const [page, setPage] = useState<Page>('account');
  const [menuOpen, setMenuOpen] = useState(false);
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
    const items: NavigationItem[] = [{ key: 'account', label: 'Mi cuenta', icon: LayoutDashboard }];
    if (user.roles.some((role) => ['ADMIN', 'DEAN', 'TUTOR', 'STUDENT'].includes(role))) {
      items.push({ key: 'academic', label: 'Proyectos y actividades', icon: BookOpen });
    }
    // GET /api/meetings admite cualquier sesión válida (docs/api/meetings.md).
    items.push({ key: 'meetings', label: 'Reuniones', icon: CalendarClock });
    if (user.roles.includes('ADMIN')) items.push({ key: 'users', label: 'Crear usuarios', icon: Users });
    items.push({ key: 'announcements', label: 'Novedades', icon: Megaphone });
    items.push({ key: 'preferences', label: 'Mis notificaciones', icon: Settings });
    if (user.roles.includes('ADMIN')) items.push({ key: 'whatsapp', label: 'Estado de WhatsApp', icon: MessageCircle });
    return items;
  }, [user.roles]);

  useEffect(() => {
    const update = () => {
      const hash = window.location.hash.slice(1);
      setPage(navigation.find((item) => item.key === hash)?.key ?? 'account');
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
    setPage(next);
    window.location.hash = next;
    setMenuOpen(false);
  }

  function renderNavigation() {
    return <>
      <BrandMark variant="light" />
      <div className="mt-8 rounded-xl bg-navy-soft p-4">
        <p className="break-words font-bold">{user.fullName}</p>
        <p className="mt-1 break-all text-sm text-white/80">{user.email}</p>
        <p className="mt-3 text-xs font-semibold leading-relaxed text-gold">{user.roles.map(roleLabel).join(' · ') || 'Sin roles asignados'}</p>
      </div>
      <nav aria-label="Secciones de la aplicación" className="mt-7 space-y-2">
        {navigation.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" disabled={signingOut} aria-current={page === key ? 'page' : undefined}
            onClick={() => navigate(key)} className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${page === key ? 'bg-gold text-navy' : 'text-white/85 hover:bg-white/10 hover:text-white'}`}>
            <Icon aria-hidden="true" className="size-5 shrink-0" />{label}
          </button>
        ))}
      </nav>
      <Button disabled={signingOut} onClick={() => void onSignOut()} className="mt-auto w-full">
        <LogOut aria-hidden="true" className="size-4" />{signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </Button>
    </>;
  }

  const title = navigation.find((item) => item.key === page)?.label ?? 'Mi cuenta';
  return (
    <div className="min-h-dvh bg-canvas text-navy lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="on-dark sticky top-0 hidden h-dvh flex-col gap-5 bg-navy p-6 text-white lg:flex">{renderNavigation()}</aside>
      <dialog ref={dialog} onClose={() => setMenuOpen(false)} aria-labelledby="mobile-menu-title"
        className="on-dark fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-navy p-6 text-white backdrop:bg-navy/60 sm:max-w-sm">
        <header className="mb-6 flex items-center justify-between gap-4"><h2 id="mobile-menu-title" className="font-bold">Navegación</h2><button type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar navegación" className="grid size-12 place-items-center rounded-lg hover:bg-white/10"><X aria-hidden="true" /></button></header>
        <div className="flex min-h-[calc(100dvh-110px)] flex-col gap-5">{renderNavigation()}</div>
      </dialog>
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-4 border-b border-navy/10 bg-white px-5 py-4 sm:px-8 lg:px-10">
          <p className="text-sm font-semibold">Gestor de Semilleros <span className="hidden text-navy/70 sm:inline">/ Espacio de trabajo</span></p>
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="Abrir navegación" aria-expanded={menuOpen} className="grid size-12 shrink-0 place-items-center rounded-lg border border-navy/30 lg:hidden"><Menu aria-hidden="true" /></button>
        </header>
        <main inert={signingOut} aria-busy={signingOut} className="mx-auto w-full max-w-7xl space-y-7 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-navy/70">Tu espacio de investigación</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1></div>
          {error && <AlertMessage message={error} />}
          {page === 'account' ? <>
            <PanelCard title={`Hola, ${user.fullName}`} action={<Button variant="secondary" onClick={onRefresh}>Actualizar cuenta</Button>}>
              <dl className="grid gap-6 sm:grid-cols-2">
                <div><dt className="text-sm text-navy/70">Correo electrónico</dt><dd className="mt-1 break-all font-semibold">{user.email}</dd></div>
                <div><dt className="text-sm text-navy/70">Roles asignados</dt><dd className="mt-1 font-semibold">{user.roles.map(roleLabel).join(' · ') || 'Sin roles asignados'}</dd></div>
              </dl>
              <p className="mt-6 text-sm leading-relaxed text-navy/70">Los accesos corresponden a los roles de tu cuenta. El servidor comprueba los permisos y el alcance de cada operación.</p>
            </PanelCard>
            <PanelCard title="Funciones disponibles">
              <div className="grid gap-3 sm:grid-cols-2">{navigation.filter((item) => item.key !== 'account').map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => navigate(key)} className="flex min-h-20 items-center gap-4 rounded-lg border border-navy/20 p-4 text-left font-semibold transition hover:-translate-y-0.5 hover:border-navy/50 focus-visible:outline-navy motion-reduce:transform-none"><Icon aria-hidden="true" className="size-6 shrink-0" />{label}</button>)}</div>
            </PanelCard>
            <EmptyState title="Módulos pendientes" description="La gestión de áreas y facultades, documentos, recordatorios y métricas todavía no dispone de API. No se muestran operaciones ficticias para esos módulos." />
          </> : page === 'academic'
            ? <AcademicWorkspace user={user} request={request} />
            : page === 'meetings'
            ? <MeetingsWorkspace user={user} request={request} />
            : <InstitutionalWorkspace user={user} request={request} section={page} />}
        </main>
      </div>
    </div>
  );
}
