import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { AllowPendingPasswordChange } from '../../../common/decorators/allow-password-change.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import { parseChangePassword } from '../dtos/change-password.dto';
import { toCurrentUserDto, type CurrentUserDto } from '../dtos/current-user.dto';
import type { AuthUser } from '../models/auth-user';
import { AuthService } from '../services/auth.service';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(private readonly auth: AuthService) {}

  /** Devuelve el usuario de la sesión actual. Accesible aunque deba cambiar su contraseña. */
  @Get()
  @AllowPendingPasswordChange()
  me(@CurrentUser() user: AuthUser): CurrentUserDto {
    return toCurrentUserDto(user);
  }

  /** Cambia la contraseña propia. Accesible aunque deba cambiarla (ADR 0011). */
  @Put('password')
  @AllowPendingPasswordChange()
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<void> {
    return this.auth.changeOwnPassword(user.id, validated(parseChangePassword(body)));
  }
}
