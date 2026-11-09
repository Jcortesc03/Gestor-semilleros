import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  NotFoundException,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { SessionGuard } from '../../../common/guards/session.guard';
import { asObject, validated } from '../../../common/utils/validation';
import type { AuthUser } from '../../auth';
import { parseCreateUser } from '../dtos/create-user.dto';
import { parseSetPassword } from '../dtos/set-password.dto';
import { parseUpdateUser } from '../dtos/update-user.dto';
import type { UserDetailDto } from '../dtos/user-detail.dto';
import type { UserDirectoryItemDto } from '../dtos/user-directory-item.dto';
import { parseUserDirectoryQuery } from '../dtos/user-directory-query.dto';
import type { PageDto } from '../../../common/utils/pagination';
import type { UserResponseDto } from '../dtos/user-response.dto';
import { UsersService } from '../services/users.service';

/** Un identificador mal formado equivale a un usuario inexistente (404). */
const UserId = () => Param('id', new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException('Usuario no encontrado.') }));

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

  /**
   * Directorio de selección (tutores, estudiantes, participantes). Administrador, Decano, Encargado de área o Tutor (ADR 0009 y 0010 §10).
   * El parámetro `status` (ver inactivos o todos) es exclusivo del Administrador (ADR 0011).
   */
  @Get()
  @Roles('ADMIN', 'DEAN', 'AREA_MANAGER', 'TUTOR')
  directory(@CurrentUser() user: AuthUser, @Query() query: unknown): Promise<PageDto<UserDirectoryItemDto>> {
    if ('status' in (asObject(query) ?? {}) && !user.roles.includes('ADMIN')) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción.');
    }
    return this.users.listDirectory(validated(parseUserDirectoryQuery(query)));
  }

  // Las rutas estáticas deben declararse antes que las que usan `:id` (hoy no hay otras).

  @Get(':id')
  @Roles('ADMIN')
  detail(@UserId() id: string): Promise<UserDetailDto> {
    return this.users.getDetail(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@CurrentUser() actor: AuthUser, @UserId() id: string, @Body() body: unknown): Promise<UserDetailDto> {
    return this.users.update(actor.id, id, validated(parseUpdateUser(body)));
  }

  @Post(':id/deactivate')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  deactivate(@CurrentUser() actor: AuthUser, @UserId() id: string): Promise<UserDetailDto> {
    return this.users.deactivate(actor.id, id);
  }

  @Post(':id/activate')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  activate(@UserId() id: string): Promise<UserDetailDto> {
    return this.users.activate(id);
  }

  /** Fija una contraseña temporal; el usuario deberá cambiarla al entrar. */
  @Put(':id/password')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  setPassword(@UserId() id: string, @Body() body: unknown): Promise<void> {
    return this.users.setTemporaryPassword(id, validated(parseSetPassword(body)).password);
  }
}
