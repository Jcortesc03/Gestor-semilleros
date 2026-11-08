import type { AnnouncementKind, DocumentFormat, AudienceType, Role } from '../../../generated/prisma/enums';

export interface AudienceResponseDto {
  type: AudienceType;
  role?: Role;
  faculty?: { id: string; name: string };
  area?: { id: string; name: string };
  project?: { id: string; title: string };
}

export interface AnnouncementAttachmentDto {
  id: string;
  fileName: string;
  format: DocumentFormat;
  mimeType: string;
  sizeBytes: number;
}

export interface AnnouncementResponseDto {
  id: string;
  kind: AnnouncementKind;
  title: string;
  content: string;
  publishedAt: string;
  author: { id: string; fullName: string };
  attachments: AnnouncementAttachmentDto[];
  audiences: AudienceResponseDto[];
}

export const announcementSelect = {
  id: true,
  kind: true,
  title: true,
  content: true,
  publishedAt: true,
  author: { select: { id: true, fullName: true } },
  attachments: {
    select: { id: true, fileName: true, format: true, mimeType: true, sizeBytes: true },
    orderBy: { createdAt: 'asc' },
  },
  audiences: {
    select: {
      audienceType: true,
      role: true,
      faculty: { select: { id: true, name: true } },
      area: { select: { id: true, name: true } },
      project: { select: { id: true, title: true } },
    },
  },
} as const;

interface AnnouncementRow {
  id: string;
  kind: AnnouncementKind;
  title: string;
  content: string;
  publishedAt: Date;
  author: { id: string; fullName: string };
  attachments: { id: string; fileName: string; format: DocumentFormat; mimeType: string; sizeBytes: bigint }[];
  audiences: {
    audienceType: AudienceType;
    role: Role | null;
    faculty: { id: string; name: string } | null;
    area: { id: string; name: string } | null;
    project: { id: string; title: string } | null;
  }[];
}

export function toAnnouncementResponse(row: AnnouncementRow): AnnouncementResponseDto {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    publishedAt: row.publishedAt.toISOString(),
    author: row.author,
    attachments: row.attachments.map((a) => ({ ...a, sizeBytes: Number(a.sizeBytes) })),
    audiences: row.audiences.map((a) => ({
      type: a.audienceType,
      ...(a.role ? { role: a.role } : {}),
      ...(a.faculty ? { faculty: a.faculty } : {}),
      ...(a.area ? { area: a.area } : {}),
      ...(a.project ? { project: a.project } : {}),
    })),
  };
}
