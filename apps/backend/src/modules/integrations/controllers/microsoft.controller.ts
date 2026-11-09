import { BadRequestException, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SessionGuard } from '../../../common/guards/session.guard';
import type { MicrosoftConfig } from '../../../config/microsoft.config.types';
import type { AuthUser } from '../../auth';
import { MICROSOFT_CONFIG, MicrosoftAccountService } from '../services/microsoft/microsoft-account.service';

/**
 * Vinculación de la cuenta de Microsoft del usuario de la sesión.
 * `connect` y `callback` se abren en el navegador (redirecciones), con la cookie de sesión.
 */
@Controller('integrations/microsoft')
@UseGuards(SessionGuard)
export class MicrosoftController {
  constructor(
    private readonly accounts: MicrosoftAccountService,
    @Inject(MICROSOFT_CONFIG) private readonly config: MicrosoftConfig | null,
  ) {}

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.accounts.status(user.id);
  }

  /** Redirige a Microsoft para dar consentimiento. Con `?format=json` devuelve la URL en lugar de redirigir. */
  @Get('connect')
  connect(@CurrentUser() user: AuthUser, @Query('format') format: string | undefined, @Res() res: Response) {
    const url = this.accounts.connectUrl(user.id);
    if (format === 'json') return res.json({ url });
    return res.redirect(HttpStatus.FOUND, url);
  }

  /** Microsoft vuelve aquí con `code` y `state` (o con `error` si el usuario no aceptó). */
  @Get('callback')
  async callback(
    @CurrentUser() user: AuthUser,
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ) {
    const { code, state, error } = query;
    if (typeof error === 'string') {
      return this.finish(res, { linked: false, error: 'Microsoft no autorizó la vinculación.' }, HttpStatus.BAD_REQUEST);
    }
    if (typeof code !== 'string' || typeof state !== 'string' || !code || !state) {
      throw new BadRequestException('Faltan los parámetros code y state.');
    }
    const status = await this.accounts.completeLink(user.id, code, state);
    return this.finish(res, status, HttpStatus.OK);
  }

  @Delete('link')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlink(@CurrentUser() user: AuthUser) {
    return this.accounts.unlink(user.id);
  }

  /** Redirige a la app (si está configurada) o responde JSON. */
  private finish(res: Response, body: object, status: number) {
    const target = this.config?.linkRedirectUrl;
    if (!target) return res.status(status).json(body);
    const url = new URL(target);
    url.searchParams.set('microsoft', status === HttpStatus.OK ? 'linked' : 'error');
    return res.redirect(HttpStatus.FOUND, url.toString());
  }
}
