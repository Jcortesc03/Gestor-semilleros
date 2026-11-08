import { useState } from 'react';
import { Download, Eye } from 'lucide-react';
import type { ApiRequest } from '../../types/api.ts';
import { Button, ErrorNotice, formatDate } from '../../components/WorkspaceUi';
import { canPreviewInline, DOCUMENT_FORMAT_LABELS, formatFileSize } from '../documents/index.ts';
import {
  announcementAttachmentUrl,
  GLOBAL_ROLES,
  getAnnouncementDeliveries,
  removeAnnouncement,
  type Announcement,
  type AnnouncementAttachment,
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

      {item.attachments.length > 0 && <AttachmentList announcementId={item.id} attachments={item.attachments} />}

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

const LINK_CLASS = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-navy/30 bg-white px-4 py-2 text-base font-semibold text-navy transition hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy motion-reduce:transform-none';

/** Archivos adjuntos de una noticia (ADR 0015): nombre, formato, tamaño y enlaces de descarga o vista previa. */
function AttachmentList({ announcementId, attachments }: { announcementId: string; attachments: readonly AnnouncementAttachment[] }) {
  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm font-semibold text-navy">Archivos adjuntos</p>
      <ul aria-label="Archivos adjuntos" className="divide-y divide-navy/10 rounded-lg bg-white">
        {attachments.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0 space-y-1">
              <p className="break-all font-semibold text-navy">{file.fileName}</p>
              <p className="text-sm leading-relaxed text-navy/70">
                {DOCUMENT_FORMAT_LABELS[file.format]} · {formatFileSize(file.sizeBytes)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canPreviewInline(file.format) && (
                <a
                  href={announcementAttachmentUrl(announcementId, file.id, { inline: true })}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Ver ${file.fileName}`}
                  className={LINK_CLASS}
                >
                  <Eye aria-hidden="true" className="size-4" />Ver
                </a>
              )}
              <a href={announcementAttachmentUrl(announcementId, file.id)} aria-label={`Descargar ${file.fileName}`} className={LINK_CLASS}>
                <Download aria-hidden="true" className="size-4" />Descargar
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
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
