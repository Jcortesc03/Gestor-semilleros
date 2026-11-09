import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Bell, Plus, RefreshCw } from 'lucide-react';
import type { CurrentUser } from '../../types/auth.ts';
import type { ApiRequest } from '../../types/api.ts';
import { Button, EmptyState, ErrorNotice, LoadingState, PanelCard } from '../../components/WorkspaceUi';
import { getAnnouncements, type Announcement, type AnnouncementKind, type AnnouncementQuery } from './api';
import { AnnouncementCard } from './AnnouncementCard';
import { PublishAnnouncementForm } from './PublishAnnouncementForm';
import { hasRole } from './shared';

/** Filtro del listado: «Todas» no envía `kind`; el resto usa el tipo del contrato. */
type FeedFilter = 'ALL' | AnnouncementKind;

/** Tamaño de página: `limit=20`; una página más corta indica que no quedan novedades. */
const PAGE_SIZE = 20;

const FEED_TABS: readonly { value: FeedFilter; label: string; empty: string }[] = [
  { value: 'ALL', label: 'Todas', empty: 'No hay novedades visibles' },
  { value: 'NEWS', label: 'Noticias', empty: 'No hay noticias visibles' },
  { value: 'COMMUNICATION', label: 'Comunicados', empty: 'No hay comunicados visibles' },
  { value: 'CHANGE', label: 'Cambios', empty: 'No hay cambios visibles' },
  { value: 'NOTIFICATION', label: 'Notificaciones', empty: 'No hay notificaciones visibles' },
];

function feedQuery(filter: FeedFilter): AnnouncementQuery {
  return filter === 'ALL' ? {} : { kind: filter };
}

export function AnnouncementsSection({ user, request }: { user: CurrentUser; request: ApiRequest }) {
  const [filter, setFilter] = useState<FeedFilter>('ALL');
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<unknown>();
  const [loadError, setLoadError] = useState<unknown>();
  const [reloadToken, setReloadToken] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [publishedCount, setPublishedCount] = useState<number>();
  const tabsId = useId();
  const composerId = useId();
  // Cada carga de la primera página (cambio de pestaña o recarga) avanza la versión; una respuesta de
  // «Cargar más» solo se aplica si la versión sigue siendo la misma cuando llega.
  const feedVersion = useRef(0);
  // ADR 0010 sec. 8: cada rol publica dentro de su alcance; el formulario decide las audiencias.
  const canPublish = hasRole(user, 'ADMIN', 'AREA_MANAGER', 'DEAN', 'TUTOR');
  const activeTab = FEED_TABS.find((tab) => tab.value === filter) ?? FEED_TABS[0];

  useEffect(() => {
    // Cada ejecución del efecto tiene su propia bandera: al cambiar de pestaña o con StrictMode, la
    // limpieza descarta la respuesta obsoleta y solo la ejecución vigente actualiza la vista.
    let active = true;
    feedVersion.current += 1;
    getAnnouncements(request, { ...feedQuery(filter), limit: PAGE_SIZE })
      .then((value) => {
        if (!active) return;
        setItems(value);
        setHasMore(value.length === PAGE_SIZE);
        setLoadError(undefined);
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(cause);
      });
    return () => {
      active = false;
    };
  }, [request, filter, reloadToken]);

  function selectFilter(next: FeedFilter) {
    if (next === filter) return;
    setFilter(next);
    setItems(null);
    setLoadError(undefined);
    setHasMore(false);
    setLoadingMore(false);
    setMoreError(undefined);
  }

  function reload() {
    setLoadingMore(false);
    setMoreError(undefined);
    setReloadToken((token) => token + 1);
  }

  async function loadMore() {
    const last = items && items.length > 0 ? items[items.length - 1] : undefined;
    if (!last || loadingMore) return;
    const version = feedVersion.current;
    setLoadingMore(true);
    setMoreError(undefined);
    try {
      const page = await getAnnouncements(request, { ...feedQuery(filter), limit: PAGE_SIZE, before: last.publishedAt });
      if (version !== feedVersion.current) return;
      setItems((current) => [...(current ?? []), ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (cause) {
      if (version === feedVersion.current) setMoreError(cause);
    } finally {
      if (version === feedVersion.current) setLoadingMore(false);
    }
  }

  function toggleComposer() {
    if (!composerOpen) setPublishedCount(undefined);
    setComposerOpen(!composerOpen);
  }

  function handlePublished(created: Announcement) {
    // Tras publicar se pliega el formulario, se confirma el envío y se recarga la pestaña activa.
    setPublishedCount(created.queuedDeliveries ?? 0);
    setComposerOpen(false);
    reload();
  }

  function handleDeleted(id: string) {
    setItems((current) => current?.filter((item) => item.id !== id) ?? null);
  }

  return (
    <div className="space-y-6">
      <PanelCard
        title="Novedades visibles"
        help={{
          title: 'Novedades visibles',
          description: 'Son los comunicados que tu audiencia puede ver. Las pestañas filtran por tipo (Noticias, Comunicados, Cambios, Notificaciones); «Actualizar» recarga la lista y «Cargar más» trae las siguientes. Cada novedad muestra autor, fecha y audiencia.',
          roles: {
            ADMIN: 'Como administrador, ves todas las novedades y puedes publicar nuevas con «Nueva novedad», eligiendo su tipo, audiencia y adjuntos. Sin publicar, nadie las ve.',
            AREA_MANAGER: 'Como encargado de área, ves las novedades de tu audiencia y puedes publicar nuevas dirigidas a tus áreas o roles permitidos.',
            DEAN: 'Como decano, ves las novedades de tu audiencia y puedes publicar nuevas dirigidas a tus facultades o roles permitidos.',
            TUTOR: 'Como tutor, ves las novedades de tu audiencia y puedes publicar nuevas dirigidas a tus proyectos o roles permitidos.',
            STUDENT: 'Como estudiante, solo ves las novedades dirigidas a tu audiencia; no puedes publicar nuevas.',
          },
        }}
        action={
          <div className="flex flex-wrap gap-3">
            {canPublish && (
              <Button
                variant="primary"
                aria-expanded={composerOpen}
                aria-controls={composerId}
                onClick={toggleComposer}
              >
                <Plus aria-hidden="true" className="size-4" />
                Nueva novedad
              </Button>
            )}
            <Button variant="secondary" onClick={reload}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Actualizar
            </Button>
          </div>
        }
      >
        {canPublish && (
          <div id={composerId} className="mb-6 space-y-4">
            {composerOpen && (
              <div className="rounded-lg border border-navy/10 bg-canvas/50 p-5">
                <h3 className="mb-5 flex items-center justify-between gap-4 text-lg font-bold tracking-tight text-navy">
                  Publicar novedad
                  <Bell aria-hidden="true" className="size-5 text-gold" />
                </h3>
                <PublishAnnouncementForm user={user} request={request} onPublished={handlePublished} />
              </div>
            )}
            {publishedCount !== undefined && (
              <p role="status" className="rounded-lg bg-canvas p-4 text-sm font-semibold">
                Novedad publicada. Copias encoladas: {publishedCount}.
              </p>
            )}
          </div>
        )}
        <FeedTabs selected={filter} idPrefix={tabsId} onSelect={selectFilter} />
        <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-tab-${filter}`} className="min-w-0">
          {loadError !== undefined && <ErrorNotice error={loadError} />}
          {items === null && loadError === undefined && <LoadingState label="Cargando novedades…" />}
          {items?.length === 0 && (
            <EmptyState title={activeTab.empty} description="No hay novedades de este tipo para tu audiencia." />
          )}
          {items && items.length > 0 && (
            <>
              <div className="space-y-4">
                {items.map((item) => (
                  <AnnouncementCard
                    key={item.id}
                    item={item}
                    canManage={hasRole(user, 'ADMIN') || item.author.id === user.id}
                    request={request}
                    onDeleted={handleDeleted}
                  />
                ))}
              </div>
              {hasMore && (
                <div className="mt-5 space-y-3">
                  {moreError !== undefined && <ErrorNotice error={moreError} />}
                  <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
                    Cargar más
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </PanelCard>
    </div>
  );
}

interface FeedTabsProps {
  selected: FeedFilter;
  /** Prefijo de los identificadores: `${idPrefix}-tab-<valor>` y `${idPrefix}-panel`. */
  idPrefix: string;
  onSelect: (value: FeedFilter) => void;
}

/**
 * Pestañas por tipo de novedad (`role="tablist"`). Flechas, Inicio y Fin mueven el foco y eligen la pestaña;
 * en móvil la fila se desplaza dentro de su propio contenedor, sin scroll horizontal de la página.
 */
function FeedTabs({ selected, idPrefix, onSelect }: FeedTabsProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = FEED_TABS.length - 1;
    const next = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    onSelect(FEED_TABS[next].value);
    buttons.current[next]?.focus();
  }

  return (
    <div className="-mx-2 mb-5 overflow-x-auto px-2 py-2">
      <div role="tablist" aria-label="Tipo de novedad" className="flex w-max gap-2">
        {FEED_TABS.map((tab, index) => {
          const isSelected = tab.value === selected;
          return (
            <button
              key={tab.value}
              ref={(node) => { buttons.current[index] = node; }}
              id={`${idPrefix}-tab-${tab.value}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${idPrefix}-panel`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onSelect(tab.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`inline-flex min-h-12 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy motion-reduce:transition-none ${
                isSelected ? 'border-navy bg-navy text-white' : 'border-navy/30 bg-white text-navy hover:border-navy/50'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
