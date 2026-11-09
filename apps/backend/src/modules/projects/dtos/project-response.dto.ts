import type { ProjectRole, ProjectStatus } from '../../../generated/prisma/enums';

export interface ProjectResponseDto {
  id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  area: { id: string; name: string };
  faculties: { id: string; name: string }[];
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
}

export interface TutoredProjectDto {
  id: string;
  title: string;
  status: ProjectStatus;
  isPrimaryTutor: boolean;
}

export interface MemberResponseDto {
  id: string;
  user: { id: string; fullName: string; email: string };
  projectRole: ProjectRole;
  isPrimary: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  joinedAt: string;
  leftAt: string | null;
}

/** Fecha sin hora (columnas @db.Date) como 'YYYY-MM-DD'. */
export const toDateOnly = (date: Date | null): string | null => (date ? date.toISOString().slice(0, 10) : null);
