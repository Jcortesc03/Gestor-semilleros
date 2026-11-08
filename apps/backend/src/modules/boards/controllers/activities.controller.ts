import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import type { AuthUser } from '../../auth';
import {
  parseApproval,
  parseAssignee,
  parseAttachment,
  parseCreateActivity,
  parseUpdateActivity,
} from '../dtos/activity.dto';
import { ActivitiesService } from '../services/activities.service';

const uuid = new ParseUUIDPipe();

@Controller()
@UseGuards(SessionGuard)
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Post('boards/:boardId/activities')
  create(@CurrentUser() user: AuthUser, @Param('boardId', uuid) boardId: string, @Body() body: unknown) {
    return this.activities.create(user, boardId, validated(parseCreateActivity(body)));
  }

  @Get('boards/:boardId/activities')
  list(@CurrentUser() user: AuthUser, @Param('boardId', uuid) boardId: string) {
    return this.activities.list(user, boardId);
  }

  @Get('activities/:activityId')
  get(@CurrentUser() user: AuthUser, @Param('activityId', uuid) activityId: string) {
    return this.activities.get(user, activityId);
  }

  @Patch('activities/:activityId')
  update(@CurrentUser() user: AuthUser, @Param('activityId', uuid) activityId: string, @Body() body: unknown) {
    return this.activities.update(user, activityId, validated(parseUpdateActivity(body)));
  }

  @Post('activities/:activityId/approval')
  @HttpCode(HttpStatus.OK)
  review(@CurrentUser() user: AuthUser, @Param('activityId', uuid) activityId: string, @Body() body: unknown) {
    return this.activities.review(user, activityId, validated(parseApproval(body)));
  }

  @Delete('activities/:activityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('activityId', uuid) activityId: string) {
    return this.activities.remove(user, activityId);
  }

  @Post('activities/:activityId/assignees')
  addAssignee(@CurrentUser() user: AuthUser, @Param('activityId', uuid) activityId: string, @Body() body: unknown) {
    return this.activities.addAssignee(user, activityId, validated(parseAssignee(body)));
  }

  @Delete('activities/:activityId/assignees/:userId')
  removeAssignee(
    @CurrentUser() user: AuthUser,
    @Param('activityId', uuid) activityId: string,
    @Param('userId', uuid) userId: string,
  ) {
    return this.activities.removeAssignee(user, activityId, userId);
  }

  @Post('activities/:activityId/attachments')
  addAttachment(@CurrentUser() user: AuthUser, @Param('activityId', uuid) activityId: string, @Body() body: unknown) {
    return this.activities.addAttachment(user, activityId, validated(parseAttachment(body)));
  }

  @Delete('activities/:activityId/attachments/:attachmentId')
  removeAttachment(
    @CurrentUser() user: AuthUser,
    @Param('activityId', uuid) activityId: string,
    @Param('attachmentId', uuid) attachmentId: string,
  ) {
    return this.activities.removeAttachment(user, activityId, attachmentId);
  }
}
