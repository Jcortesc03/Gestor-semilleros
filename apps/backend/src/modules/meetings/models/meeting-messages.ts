/** Textos de la invitación de Teams y de los avisos de reunión por correo y WhatsApp. */
export interface MeetingInfo {
  reason: string;
  startsAt: Date;
  durationMinutes: number;
  organizerName: string;
  joinUrl: string | null;
  projectTitle: string | null;
}

/** Recordatorios antes de empezar (ADR 0007): 24 h y 1 h. */
export const REMINDER_OFFSETS = [
  { minutes: 24 * 60, label: 'mañana' },
  { minutes: 60, label: 'en 1 hora' },
] as const;

export function formatMeetingDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeStyle: 'short', timeZone }).format(date);
}

function details(info: MeetingInfo, timeZone: string): string {
  return [
    `Fecha: ${formatMeetingDate(info.startsAt, timeZone)} (${timeZone})`,
    `Duración: ${info.durationMinutes} minutos`,
    `Organiza: ${info.organizerName}`,
    ...(info.projectTitle ? [`Proyecto: ${info.projectTitle}`] : []),
    ...(info.joinUrl ? [`Enlace de Teams: ${info.joinUrl}`] : []),
  ].join('\n');
}

/** Cuerpo del evento en el calendario de Teams (antes de tener el enlace). */
export function teamsEventBody(info: MeetingInfo): string {
  return `${info.reason}\n\nReunión agendada desde el Gestor de Semilleros${info.projectTitle ? ` para el proyecto ${info.projectTitle}` : ''}.`;
}

export function invitationMessage(info: MeetingInfo, timeZone: string) {
  return {
    subject: `[Reunión] ${info.reason}`,
    body: `Te invitaron a una reunión.\n\n${details(info, timeZone)}\n\nGestor de Semilleros`,
  };
}

export function reminderMessage(info: MeetingInfo, timeZone: string, label: string) {
  return {
    subject: `[Recordatorio] ${info.reason} (${label})`,
    body: `La reunión empieza ${label}.\n\n${details(info, timeZone)}\n\nGestor de Semilleros`,
  };
}

export function cancellationMessage(info: MeetingInfo, timeZone: string, comment: string | null) {
  return {
    subject: `[Reunión cancelada] ${info.reason}`,
    body: `La reunión fue cancelada.${comment ? `\nMotivo: ${comment}` : ''}\n\n${details({ ...info, joinUrl: null }, timeZone)}\n\nGestor de Semilleros`,
  };
}
