import type { ApprovalStatus, DocumentFormat, ProgressStatus, WorkResult } from '../../../generated/prisma/enums';

type UserRef = { id: string; fullName: string };

export interface BoardResponseDto {
  id: string;
  projectId: string;
  title: string;
  dueDate: string;
  progressStatus: ProgressStatus;
  result: WorkResult | null;
  responsibleTutor: UserRef;
  responsibleStudent: UserRef;
  activityCount: number;
  createdAt: string;
}

export interface AttachmentResponseDto {
  id: string;
  kind: 'LINK' | 'DOCUMENT';
  url: string | null;
  documentId: string | null;
  document: { id: string; fileName: string; format: DocumentFormat; sizeBytes: number } | null;
  createdBy: UserRef;
  createdAt: string;
}

export interface ActivityResponseDto {
  id: string;
  boardId: string;
  title: string;
  description: string | null;
  progressStatus: ProgressStatus;
  result: WorkResult | null;
  approvalStatus: ApprovalStatus;
  approvedBy: UserRef | null;
  approvedAt: string | null;
  author: UserRef;
  assignees: UserRef[];
  attachments: AttachmentResponseDto[];
  createdAt: string;
  updatedAt: string;
}
