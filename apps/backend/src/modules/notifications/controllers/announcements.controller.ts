import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import type { AuthUser } from '../../auth';
import { contentDisposition, createUploadErrorFilter, decodeFileName, MAX_DOCUMENT_BYTES, STORAGE_UNAVAILABLE } from '../../documents';
import {
  BAD_MULTIPART_ERROR,
  MAX_ANNOUNCEMENT_FILES,
  parseMultipartData,
  type IncomingFile,
} from '../models/announcement-attachments';
import { parseCreateAnnouncement, parseListAnnouncements } from '../dtos/announcement.dto';
import { AnnouncementsService } from '../services/announcements.service';

const UploadErrorFilter = createUploadErrorFilter(BAD_MULTIPART_ERROR);

/** Novedades (noticias, comunicados, cambios y notificaciones) dirigidas a audiencias. */
@Controller('announcements')
@UseGuards(SessionGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Post()
  @Roles('ADMIN', 'AREA_MANAGER', 'DEAN', 'TUTOR')
  @UseFilters(UploadErrorFilter)
  @UseInterceptors(
    FilesInterceptor('files', MAX_ANNOUNCEMENT_FILES, {
      limits: { fileSize: MAX_DOCUMENT_BYTES, files: MAX_ANNOUNCEMENT_FILES, fields: 1 },
    }),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @Req() request: Request,
    @UploadedFiles() uploaded: IncomingFile[] | undefined,
  ) {
    const multipart = typeof request.is('multipart/form-data') === 'string';
    const raw = multipart ? validated(parseMultipartData(body)) : body;
    const files: IncomingFile[] = (uploaded ?? []).map((f) => ({ originalname: decodeFileName(f.originalname), buffer: f.buffer }));
    return this.announcements.create(user, validated(parseCreateAnnouncement(raw)), files);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    return this.announcements.list(user, validated(parseListAnnouncements(query)));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.get(user, id);
  }

  @Get(':id/attachments/:attachmentId/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Query('inline') inline: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.announcements.downloadAttachment(user, id, attachmentId);
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

  @Get(':id/deliveries')
  deliveries(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.deliverySummary(user, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.remove(user, id);
  }
}
