import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import type { AuthUser } from '../../auth';
import { parseChangeMeetingStatus, parseCreateMeeting, parseListMeetings, parseRecording } from '../dtos/meeting.dto';
import { MeetingsService } from '../services/meetings.service';

/** Reuniones con Microsoft Teams (ADR 0007). */
@Controller('meetings')
@UseGuards(SessionGuard, RolesGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  /** RN-73: el tutor (y el administrador) crea reuniones. */
  @Post()
  @Roles('TUTOR', 'ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.meetings.create(user, validated(parseCreateMeeting(body)));
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    return this.meetings.list(user, validated(parseListMeetings(query)));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.get(user, id);
  }

  /** Cambio manual: en proceso, finalizada o cancelada (también cancela en Teams). */
  @Patch(':id/status')
  changeStatus(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.meetings.changeStatus(user, id, validated(parseChangeMeetingStatus(body)));
  }

  /** Enlace de evidencia de la grabación (opcional). */
  @Put(':id/recording')
  setRecording(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.meetings.setRecording(user, id, validated(parseRecording(body)));
  }
}
