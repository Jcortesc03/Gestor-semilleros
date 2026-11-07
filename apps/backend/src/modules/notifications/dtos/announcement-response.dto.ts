import type { AnnouncementKind, AudienceType, Role } from '../../../generated/prisma/enums';

export interface AudienceResponseDto {
  type: AudienceType;
  role?: Role;
  faculty?: { id: string; name: string };
  area?: { id: string; name: string };
  project?: { id: string; title: string };
}

export interface AnnouncementResponseDto {
  id: string;
  kind: AnnouncementKind;
  title: string;
  content: string;
  publishedAt: string;
  author: { id: string; fullName: string };
  audiences: AudienceResponseDto[];
}

export const announcementSelect = {
  id: true,
  kind: true,
  title: true,
  content: true,
  publishedAt: true,
  author: { select: { id: true, fullName: true } },
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
    audiences: row.audiences.map((a) => ({
      type: a.audienceType,
      ...(a.role ? { role: a.role } : {}),
      ...(a.faculty ? { faculty: a.faculty } : {}),
      ...(a.area ? { area: a.area } : {}),
      ...(a.project ? { project: a.project } : {}),
    })),
  };
}
