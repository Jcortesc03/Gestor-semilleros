import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import type { AuthUser } from '../../auth';
import { parseAddMember, parseUpdateMember } from '../dtos/member.dto';
import { parseCreateProject, parseUpdateProject } from '../dtos/project.dto';
import { MembersService } from '../services/members.service';
import { ProjectsService } from '../services/projects.service';

@Controller('projects')
@UseGuards(SessionGuard, RolesGuard)
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly members: MembersService,
  ) {}

  @Post()
  @Roles('DEAN', 'ADMIN')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.projects.create(user, validated(parseCreateProject(body)));
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user);
  }

  @Get(':projectId')
  get(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.projects.get(user, projectId);
  }

  @Patch(':projectId')
  update(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Body() body: unknown) {
    return this.projects.update(user, projectId, validated(parseUpdateProject(body)));
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.projects.remove(user, projectId);
  }

  // ─── Participantes ───────────────────────────────────────────

  @Get(':projectId/members')
  listMembers(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    return this.members.list(user, projectId, includeInactive ?? false);
  }

  @Post(':projectId/members')
  addMember(@CurrentUser() user: AuthUser, @Param('projectId', ParseUUIDPipe) projectId: string, @Body() body: unknown) {
    return this.members.add(user, projectId, validated(parseAddMember(body)));
  }

  @Patch(':projectId/members/:memberId')
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() body: unknown,
  ) {
    return this.members.update(user, projectId, memberId, validated(parseUpdateMember(body)));
  }

  @Delete(':projectId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.members.remove(user, projectId, memberId);
  }
}
