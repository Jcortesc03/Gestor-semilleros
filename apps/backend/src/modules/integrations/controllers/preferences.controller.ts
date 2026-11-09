import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import type { AuthUser } from '../../auth';
import { parseUpdatePreferences } from '../dtos/preferences.dto';
import { PreferencesService } from '../services/preferences.service';

/** Preferencias del usuario de la sesión sobre las copias por correo y WhatsApp. */
@Controller('me/notification-preferences')
@UseGuards(SessionGuard)
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.preferences.get(user.id);
  }

  @Put()
  update(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.preferences.update(user.id, validated(parseUpdatePreferences(body)));
  }
}
