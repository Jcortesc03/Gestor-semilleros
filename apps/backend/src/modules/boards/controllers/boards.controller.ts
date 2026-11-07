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
import { parseCreateBoard, parseUpdateBoard } from '../dtos/board.dto';
import { BoardsService } from '../services/boards.service';

const uuid = new ParseUUIDPipe();

@Controller()
@UseGuards(SessionGuard)
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Post('projects/:projectId/boards')
  create(@CurrentUser() user: AuthUser, @Param('projectId', uuid) projectId: string, @Body() body: unknown) {
    return this.boards.create(user, projectId, validated(parseCreateBoard(body)));
  }

  @Get('projects/:projectId/boards')
  list(@CurrentUser() user: AuthUser, @Param('projectId', uuid) projectId: string) {
    return this.boards.list(user, projectId);
  }

  @Get('boards/:boardId')
  get(@CurrentUser() user: AuthUser, @Param('boardId', uuid) boardId: string) {
    return this.boards.get(user, boardId);
  }

  @Patch('boards/:boardId')
  update(@CurrentUser() user: AuthUser, @Param('boardId', uuid) boardId: string, @Body() body: unknown) {
    return this.boards.update(user, boardId, validated(parseUpdateBoard(body)));
  }

  @Delete('boards/:boardId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('boardId', uuid) boardId: string) {
    return this.boards.remove(user, boardId);
  }
}
