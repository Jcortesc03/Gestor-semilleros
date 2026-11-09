import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthUser } from '../../auth';
import { pageArgs, toPage, type PageDto } from '../../../common/utils/pagination';
import { hasInstitutionalAuthority, isTutor, ProjectAccessService, type ProjectAccess } from '../../projects';
import type { DocumentResponseDto } from '../dtos/document-response.dto';
import type { DocumentListQuery } from '../dtos/document-list-query.dto';
import { DOCUMENT_STORAGE, type DocumentStorage } from '../models/document-storage';
import { inspectFile, sanitizeFileName, UNSUPPORTED_FORMAT_ERROR } from '../models/document-file';

export const DOCUMENT_NOT_FOUND = 'Documento no encontrado.';
export const STORAGE_UNAVAILABLE = 'El almacenamiento de documentos no está disponible.';
export const DOCUMENT_ATTACHED = 'El documento está adjunto a actividades; quítalo de ellas primero.';

const documentInclude = { uploadedBy: { select: { id: true, fullName: true } } } as const;
type DocumentRecord = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

const toResponse = (d: DocumentRecord): DocumentResponseDto => ({
  id: d.id,
  projectId: d.projectId,
  fileName: d.fileName,
  format: d.format,
  mimeType: d.mimeType,
  sizeBytes: Number(d.sizeBytes),
  uploadedBy: d.uploadedBy,
  createdAt: d.createdAt.toISOString(),
});

/** Archivo recibido por multipart (subconjunto de lo que entrega Multer). */
export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export interface DocumentDownload {
  stream: Readable;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Documentos de un proyecto (ADR 0013). Suben, ven y descargan quienes tienen acceso al proyecto;
 * eliminan el autor, los tutores del proyecto, el administrador, el decano y el encargado de área.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectAccessService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
  ) {}

  async upload(user: AuthUser, projectId: string, file: UploadedFile): Promise<DocumentResponseDto> {
    await this.projects.resolve(user, projectId);
    this.assertStorage();

    const fileName = sanitizeFileName(file.originalname);
    const inspection = fileName === '' ? { ok: false as const, error: UNSUPPORTED_FORMAT_ERROR } : inspectFile(fileName, file.buffer);
    if (!inspection.ok) throw new BadRequestException({ message: 'Datos inválidos.', errors: [inspection.error] });

    const storageKey = `projects/${projectId}/${randomUUID()}`;
    try {
      await this.storage.put(storageKey, file.buffer, inspection.mimeType);
    } catch (error) {
      this.logger.error(`No se pudo guardar el objeto en el almacenamiento: ${String(error)}`);
      throw new ServiceUnavailableException(STORAGE_UNAVAILABLE);
    }

    try {
      const created = await this.prisma.document.create({
        data: {
          projectId,
          uploadedById: user.id,
          fileName,
          format: inspection.format,
          mimeType: inspection.mimeType,
          sizeBytes: file.buffer.length,
          storageKey,
        },
        include: documentInclude,
      });
      return toResponse(created);
    } catch (error) {
      await this.storage.remove(storageKey).catch((cleanupError: unknown) => {
        this.logger.warn(`Objeto huérfano ${storageKey}: ${String(cleanupError)}`);
      });
      throw error;
    }
  }

  async list(user: AuthUser, projectId: string, query: DocumentListQuery): Promise<PageDto<DocumentResponseDto>> {
    await this.projects.resolve(user, projectId);
    const where: Prisma.DocumentWhereInput = { projectId, deletedAt: null };
    const [documents, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        include: documentInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.document.count({ where }),
    ]);
    return toPage(documents.map(toResponse), total, query);
  }

  async download(user: AuthUser, documentId: string): Promise<DocumentDownload> {
    const { document } = await this.find(user, documentId);
    this.assertStorage();
    try {
      const stream = await this.storage.get(document.storageKey);
      return {
        stream,
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: Number(document.sizeBytes),
      };
    } catch (error) {
      this.logger.error(`No se pudo leer el objeto ${document.storageKey}: ${String(error)}`);
      throw new ServiceUnavailableException(STORAGE_UNAVAILABLE);
    }
  }

  async remove(user: AuthUser, documentId: string): Promise<void> {
    const { document, access } = await this.find(user, documentId);
    this.projects.assert(this.canDelete(access, document.uploadedById));
    const attached = await this.prisma.activityAttachment.count({
      where: { documentId, activity: { deletedAt: null, board: { deletedAt: null } } },
    });
    if (attached > 0) throw new ConflictException(DOCUMENT_ATTACHED);
    await this.prisma.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
  }

  private canDelete(access: ProjectAccess, authorId: string): boolean {
    return access.isAdmin || hasInstitutionalAuthority(access) || isTutor(access) || authorId === access.userId;
  }

  private async find(user: AuthUser, documentId: string) {
    const document = await this.prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
    if (!document) throw new NotFoundException(DOCUMENT_NOT_FOUND);
    const access = await this.projects.resolve(user, document.projectId).catch(() => {
      throw new NotFoundException(DOCUMENT_NOT_FOUND);
    });
    return { document, access };
  }

  private assertStorage(): void {
    if (!this.storage.isConfigured()) throw new ServiceUnavailableException(STORAGE_UNAVAILABLE);
  }
}
