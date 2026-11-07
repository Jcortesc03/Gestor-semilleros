import type { MeetingStatus } from '../../../generated/prisma/enums';
import type { ManualMeetingStatus } from '../dtos/meeting.dto';

/** Hora de fin (la reunión guarda la duración, no el fin; DB-12). */
export function meetingEndsAt(startsAt: Date, durationMinutes: number): Date {
  return new Date(startsAt.getTime() + durationMinutes * 60_000);
}

/**
 * Estado según el horario (ADR 0007): una reunión programada pasa sola a "en proceso" al empezar
 * y a "finalizada" al acabar. Cancelada y finalizada son estados finales.
 */
export function statusByTime(stored: MeetingStatus, startsAt: Date, durationMinutes: number, now = new Date()): MeetingStatus {
  if (stored === 'CANCELLED' || stored === 'FINISHED') return stored;
  if (meetingEndsAt(startsAt, durationMinutes) <= now) return 'FINISHED';
  if (startsAt <= now) return 'IN_PROGRESS';
  return stored;
}

/** Cambios manuales permitidos al organizador (o al administrador). */
const MANUAL_TRANSITIONS: Record<MeetingStatus, readonly ManualMeetingStatus[]> = {
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['FINISHED', 'CANCELLED'],
  FINISHED: [],
  CANCELLED: [],
};

export function canChangeStatus(current: MeetingStatus, target: ManualMeetingStatus): boolean {
  return MANUAL_TRANSITIONS[current].includes(target);
}

export const STATUS_LABELS: Record<MeetingStatus, string> = {
  SCHEDULED: 'Programada',
  IN_PROGRESS: 'En proceso',
  FINISHED: 'Finalizada',
  CANCELLED: 'Cancelada',
};
