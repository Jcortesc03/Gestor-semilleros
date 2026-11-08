import type { AnnouncementKind } from '../../../generated/prisma/enums';
import { attachmentsNotice } from './announcement-attachments';

export const KIND_LABELS: Record<AnnouncementKind, string> = {
  NEWS: 'Noticia',
  COMMUNICATION: 'Comunicado',
  CHANGE: 'Cambio',
  NOTIFICATION: 'Notificación',
};

/** Redacta la copia que se envía por correo y WhatsApp. */
export function renderAnnouncementMessage(input: {
  kind: AnnouncementKind;
  title: string;
  content: string;
  authorName: string;
  attachmentsCount?: number;
}): { subject: string; body: string } {
  return {
    subject: `[${KIND_LABELS[input.kind]}] ${input.title}`,
    body: `${input.content}${input.attachmentsCount ? `\n\n${attachmentsNotice(input.attachmentsCount)}` : ''}\n\n— ${input.authorName}\nGestor de Semilleros`,
  };
}
