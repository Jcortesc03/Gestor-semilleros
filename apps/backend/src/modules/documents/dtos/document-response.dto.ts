import type { DocumentFormat } from '../../../generated/prisma/enums';

export interface DocumentResponseDto {
  id: string;
  projectId: string;
  fileName: string;
  format: DocumentFormat;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: { id: string; fullName: string };
  createdAt: string;
}
