import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import { parseCreateUser } from '../dtos/create-user.dto';
import type { UserDirectoryItemDto } from '../dtos/user-directory-item.dto';
import { parseUserDirectoryQuery } from '../dtos/user-directory-query.dto';
import type { UserResponseDto } from '../dtos/user-response.dto';
import { UsersService } from '../services/users.service';

@Controller('users')
@UseGuards(SessionGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Crea un usuario con roles preestablecidos. Solo Administrador. */
  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<UserResponseDto> {
    return this.users.create(validated(parseCreateUser(body)));
  }

  /** Directorio de selección (tutores, estudiantes, participantes). Administrador, Decano o Tutor (ADR 0009). */
  @Get()
  @Roles('ADMIN', 'DEAN', 'TUTOR')
  directory(@Query() query: unknown): Promise<UserDirectoryItemDto[]> {
    return this.users.listDirectory(validated(parseUserDirectoryQuery(query)));
  }
}
