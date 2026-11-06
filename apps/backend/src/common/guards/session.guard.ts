import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { getSession, type ExpressAuthConfig } from '@auth/express';
import type { Request } from 'express';
import { AuthService } from '../../modules/auth/services/auth.service';
import { AUTH_CONFIG } from '../../modules/auth/services/auth-config.factory';
import type { AuthUser } from '../../modules/auth/models/auth-user';

export type AuthenticatedRequest = Request & { user: AuthUser };

/**
 * Exige una sesión válida de Auth.js y un usuario activo.
 * El usuario se recarga desde la base de datos en cada petición, de modo que
 * desactivar a alguien o cambiar sus roles tiene efecto inmediato.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CONFIG) private readonly authConfig: ExpressAuthConfig,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await getSession(request, this.authConfig).catch(() => null);
    const userId = session?.user?.id;
    if (!userId) throw new UnauthorizedException('Sesión no válida o expirada.');

    const user = await this.auth.findActiveUser(userId);
    if (!user) throw new UnauthorizedException('Sesión no válida o expirada.');

    request.user = user;
    return true;
  }
}
