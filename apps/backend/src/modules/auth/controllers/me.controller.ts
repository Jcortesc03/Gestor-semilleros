import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SessionGuard } from '../../../common/guards/session.guard';
import { toCurrentUserDto, type CurrentUserDto } from '../dtos/current-user.dto';
import type { AuthUser } from '../models/auth-user';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  /** Devuelve el usuario de la sesión actual. */
  @Get()
  me(@CurrentUser() user: AuthUser): CurrentUserDto {
    return toCurrentUserDto(user);
  }
}
