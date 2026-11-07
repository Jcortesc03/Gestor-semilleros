import type { MeetingStatus } from '../../../generated/prisma/enums';
import { meetingEndsAt } from '../models/meeting-status';

export interface MeetingResponseDto {
  id: string;
  reason: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: MeetingStatus;
  joinUrl: string | null;
  recordingUrl: string | null;
  cancelledAt: string | null;
  project: { id: string; title: string } | null;
  organizer: { id: string; fullName: string };
  participants: { id: string; fullName: string }[];
}

export const meetingSelect = {
  id: true,
  reason: true,
  startsAt: true,
  durationMinutes: true,
  status: true,
  externalId: true,
  joinUrl: true,
  recordingUrl: true,
  cancelledAt: true,
  project: { select: { id: true, title: true } },
  organizer: { select: { id: true, fullName: true } },
  participants: { select: { user: { select: { id: true, fullName: true } } }, orderBy: { user: { fullName: 'asc' } } },
} as const;

interface MeetingRow {
  id: string;
  reason: string;
  startsAt: Date;
  durationMinutes: number;
  status: MeetingStatus;
  joinUrl: string | null;
  recordingUrl: string | null;
  cancelledAt: Date | null;
  project: { id: string; title: string } | null;
  organizer: { id: string; fullName: string };
  participants: { user: { id: string; fullName: string } }[];
}

/** No expone el id externo de Teams (dato interno de sincronización). */
export function toMeetingResponse(row: MeetingRow): MeetingResponseDto {
  return {
    id: row.id,
    reason: row.reason,
    startsAt: row.startsAt.toISOString(),
    endsAt: meetingEndsAt(row.startsAt, row.durationMinutes).toISOString(),
    durationMinutes: row.durationMinutes,
    status: row.status,
    joinUrl: row.joinUrl,
    recordingUrl: row.recordingUrl,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    project: row.project,
    organizer: row.organizer,
    participants: row.participants.map((p) => p.user),
  };
}
