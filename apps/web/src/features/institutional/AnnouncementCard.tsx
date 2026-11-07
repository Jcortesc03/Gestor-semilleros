import { useState } from 'react';
import type { ApiRequest } from '../../types/api.ts';
import { Button, ErrorNotice, formatDate } from '../../components/WorkspaceUi';
import {
  GLOBAL_ROLES,
  getAnnouncementDeliveries,
  removeAnnouncement,
  type Announcement,
  type AnnouncementAudience,
  type DeliverySummary,
  type NotificationChannel,
} from './api';
import { ANNOUNCEMENT_KIND_LABELS, CHANNEL_LABELS, ROLE_LABELS } from './shared';

const CONFIRM_DELETE = '¿Eliminar esta novedad? La eliminación es lógica y no se puede deshacer desde aquí.';

interface AnnouncementCardProps {
  item: Announcement;
  canManage: boolean;
  request: ApiRequest;
  onDeleted: (id: string) => void;
}

export function AnnouncementCard({ item, canManage, request, onDeleted }: AnnouncementCardProps) {
  const [deliveries, setDeliveries] = useState<DeliverySummary>();
  const [pending, setPending] = useState<'deliveries' | 'delete'>();
  const [error, setError] = useState<unknown>();

  async function loadDeliveries() {
    if (pending) return;
    setPending('deliveries');
    setError(undefined);
    try {
      setDeliveries(await getAnnouncementDeliveries(request, item.id));
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(undefined);
    }
  }

  async function remove() {
    if (pending || !window.confirm(CONFIRM_DELETE)) return;
    setPending('delete');
    setError(undefined);
    try {
      await removeAnnouncement(request, item.id);
      onDeleted(item.id);
    } catch (cause) {
      setError(cause);
      setPending(undefined);
    }
  }

  return (
    <article className="rounded-lg border border-navy/10 bg-canvas/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-widest text-navy/65">{ANNOUNCEMENT_KIND_LABELS[item.kind]}</span>
        <time dateTime={item.publishedAt} className="text-sm text-navy/65">{formatDate(item.publishedAt)}</time>
      </div>
      <h3 className="mt-3 text-lg font-bold">{item.title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{item.content}</p>
      <p className="mt-4 text-xs text-navy/65">
        Publicado por {item.author.fullName} · Audiencia: {item.audiences.map(audienceLabel).join(', ')}
      </p>

      {canManage && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={loadDeliveries} disabled={pending !== undefined}>
            {pending === 'deliveries' ? 'Consultando…' : 'Ver resumen de entregas'}
          </Button>
          <Button variant="danger" onClick={remove} disabled={pending !== undefined}>
            {pending === 'delete' ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </div>
      )}

      {deliveries && <DeliverySummaryView summary={deliveries} />}
      {error !== undefined && <div className="mt-4"><ErrorNotice error={error} /></div>}
    </article>
  );
}

function DeliverySummaryView({ summary }: { summary: DeliverySummary }) {
  const channels: NotificationChannel[] = ['EMAIL', 'WHATSAPP'];
  return (
    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      {channels.map((channel) => {
        const counts = summary[channel];
        return (
          <p key={channel} className="rounded-lg bg-white p-3">
            <strong className="block">{CHANNEL_LABELS[channel]}</strong>
            Enviados: {counts.SENT} · Pendientes: {counts.PENDING} · Fallidos: {counts.FAILED} · Omitidos: {counts.SKIPPED}
          </p>
        );
      })}
    </div>
  );
}

function audienceLabel(audience: AnnouncementAudience): string {
  switch (audience.type) {
    case 'ALL': return 'todos los usuarios';
    case 'ROLE': {
      const role = GLOBAL_ROLES.find((item) => item === audience.role);
      return role ? `rol ${ROLE_LABELS[role]}` : 'rol';
    }
    case 'FACULTY': return `facultad ${audience.faculty?.name ?? ''}`.trim();
    case 'AREA': return `área ${audience.area?.name ?? ''}`.trim();
    case 'PROJECT': return `proyecto ${audience.project?.title ?? ''}`.trim();
  }
}
