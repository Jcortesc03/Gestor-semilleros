import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import type { AuthUser } from '../../auth';
import { createUploadErrorFilter, decodeFileName } from './upload-error.filter';
import { parseDocumentListQuery } from '../dtos/document-list-query.dto';
import { contentDisposition, MAX_DOCUMENT_BYTES } from '../models/document-file';
import { DocumentsService, STORAGE_UNAVAILABLE, type UploadedFile as UploadedFileData } from '../services/documents.service';

const uuid = new ParseUUIDPipe();

const BAD_UPLOAD_ERROR = 'Debe enviar un único archivo en el campo "file".';

const UploadErrorFilter = createUploadErrorFilter(BAD_UPLOAD_ERROR);

@Controller()
@UseGuards(SessionGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('projects/:projectId/documents')
  @UseFilters(UploadErrorFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 0 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('projectId', uuid) projectId: string,
    @UploadedFile() file: UploadedFileData | undefined,
  ) {
    if (!file) throw new BadRequestException({ message: 'Datos inválidos.', errors: [BAD_UPLOAD_ERROR] });
    return this.documents.upload(user, projectId, { ...file, originalname: decodeFileName(file.originalname) });
  }

  @Get('projects/:projectId/documents')
  list(@CurrentUser() user: AuthUser, @Param('projectId', uuid) projectId: string, @Query() query: unknown) {
    return this.documents.list(user, projectId, validated(parseDocumentListQuery(query)));
  }

  @Get('documents/:documentId/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('documentId', uuid) documentId: string,
    @Query('inline') inline: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.documents.download(user, documentId);
    response.status(HttpStatus.OK);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.sizeBytes));
    response.setHeader('Content-Disposition', contentDisposition(file.fileName, inline === 'true'));
    response.setHeader('Cache-Control', 'private, no-store');
    file.stream.on('error', () => {
      if (!response.headersSent) response.status(HttpStatus.SERVICE_UNAVAILABLE).json({ message: STORAGE_UNAVAILABLE });
      else response.destroy();
    });
    file.stream.pipe(response);
  }

  @Delete('documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('documentId', uuid) documentId: string) {
    return this.documents.remove(user, documentId);
  }
}
