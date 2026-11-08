import type { AnnouncementKind } from '../../../generated/prisma/enums';

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
}): { subject: string; body: string } {
  return {
    subject: `[${KIND_LABELS[input.kind]}] ${input.title}`,
    body: `${input.content}\n\n— ${input.authorName}\nGestor de Semilleros`,
  };
}
