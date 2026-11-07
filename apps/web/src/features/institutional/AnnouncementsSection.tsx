import { useEffect, useState } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import type { CurrentUser } from '../../types/auth.ts';
import type { ApiRequest } from '../../types/api.ts';
import { Button, EmptyState, ErrorNotice, LoadingState, PanelCard } from '../../components/WorkspaceUi';
import { getAnnouncements, type Announcement } from './api';
import { AnnouncementCard } from './AnnouncementCard';
import { PublishAnnouncementForm } from './PublishAnnouncementForm';
import { hasRole } from './shared';

export function AnnouncementsSection({ user, request }: { user: CurrentUser; request: ApiRequest }) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>();
  const [reloadToken, setReloadToken] = useState(0);
  const canPublish = hasRole(user, 'ADMIN', 'AREA_MANAGER', 'DEAN');

  useEffect(() => {
    // Cada ejecución del efecto tiene su propia bandera: con StrictMode la limpieza de la
    // primera ejecución descarta solo su respuesta, y la segunda ejecución sí actualiza la vista.
    let active = true;
    getAnnouncements(request)
      .then((value) => {
        if (!active) return;
        setItems(value);
        setLoadError(undefined);
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(cause);
      });
    return () => {
      active = false;
    };
  }, [request, reloadToken]);

  function handlePublished(created: Announcement) {
    setItems((current) => (current ? [created, ...current] : [created]));
  }

  function handleDeleted(id: string) {
    setItems((current) => current?.filter((item) => item.id !== id) ?? null);
  }

  return (
    <div className="space-y-6">
      <PanelCard
        title="Novedades visibles"
        action={
          <Button variant="secondary" onClick={() => setReloadToken((token) => token + 1)}>
            <RefreshCw aria-hidden="true" className="size-4" />
            Actualizar
          </Button>
        }
      >
        {loadError !== undefined && <ErrorNotice error={loadError} />}
        {items === null && loadError === undefined && <LoadingState label="Cargando novedades…" />}
        {items?.length === 0 && (
          <EmptyState title="No hay novedades visibles" description="El servidor no devolvió comunicaciones para tu audiencia." />
        )}
        {items && items.length > 0 && (
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
        )}
      </PanelCard>
      {canPublish && (
        <PanelCard title="Publicar novedad" action={<Bell aria-hidden="true" className="size-5 text-gold" />}>
          <PublishAnnouncementForm user={user} request={request} onPublished={handlePublished} />
        </PanelCard>
      )}
    </div>
  );
}
