import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import type { AuthUser } from '../../auth';
import { parseCreateAnnouncement, parseListAnnouncements } from '../dtos/announcement.dto';
import { AnnouncementsService } from '../services/announcements.service';

/** Novedades (noticias, comunicados, cambios y notificaciones) dirigidas a audiencias. */
@Controller('announcements')
@UseGuards(SessionGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Post()
  @Roles('ADMIN', 'AREA_MANAGER', 'DEAN')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.announcements.create(user, validated(parseCreateAnnouncement(body)));
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    return this.announcements.list(user, validated(parseListAnnouncements(query)));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.get(user, id);
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
