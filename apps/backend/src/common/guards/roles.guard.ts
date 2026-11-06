import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../generated/prisma/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from './session.guard';

/**
 * Autorización por rol global. Se ejecuta después de SessionGuard.
 * Un usuario con varios roles suma sus permisos (P-02): basta con tener uno de los exigidos.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (user?.roles.some((role) => required.includes(role))) return true;
    throw new ForbiddenException('No tienes permisos para realizar esta acción.');
  }
}
