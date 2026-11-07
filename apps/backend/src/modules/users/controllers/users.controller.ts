import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { SessionGuard } from '../../../common/guards/session.guard';
import { parseCreateUser } from '../dtos/create-user.dto';
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
    const parsed = parseCreateUser(body);
    if (!parsed.ok) throw new BadRequestException({ message: 'Datos inválidos.', errors: parsed.errors });
    return this.users.create(parsed.value);
  }
}
