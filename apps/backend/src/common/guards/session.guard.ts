import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getSession, type ExpressAuthConfig } from '@auth/express';
import type { Request } from 'express';
import { AuthService } from '../../modules/auth/services/auth.service';
import { AUTH_CONFIG } from '../../modules/auth/services/auth-config.factory';
import { ALLOW_PASSWORD_CHANGE_KEY } from '../decorators/allow-password-change.decorator';
import type { AuthUser } from '../../modules/auth/models/auth-user';

export type AuthenticatedRequest = Request & { user: AuthUser };

/**
 * Exige una sesión válida de Auth.js y un usuario activo.
 * El usuario se recarga desde la base de datos en cada petición, de modo que
 * desactivar a alguien o cambiar sus roles tiene efecto inmediato.
 * Si el usuario debe cambiar su contraseña (ADR 0011), solo deja pasar las rutas marcadas con
 * `@AllowPendingPasswordChange()` y responde 403 `PASSWORD_CHANGE_REQUIRED` en el resto.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CONFIG) private readonly authConfig: ExpressAuthConfig,
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await getSession(request, this.authConfig).catch(() => null);
    const userId = session?.user?.id;
    if (!userId) throw new UnauthorizedException('Sesión no válida o expirada.');

    const user = await this.auth.findActiveUser(userId);
    if (!user) throw new UnauthorizedException('Sesión no válida o expirada.');

    if (user.mustChangePassword) {
      const allowed = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_PASSWORD_CHANGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed) {
        throw new ForbiddenException({
          message: 'Debes cambiar tu contraseña antes de continuar.',
          code: 'PASSWORD_CHANGE_REQUIRED',
        });
      }
    }

    request.user = user;
    return true;
  }
}
