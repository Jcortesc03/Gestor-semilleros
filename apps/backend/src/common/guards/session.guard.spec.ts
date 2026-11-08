import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as authExpress from '@auth/express';
import type { ExpressAuthConfig } from '@auth/express';
import type { AuthService } from '../../modules/auth/services/auth.service';
import type { AuthUser } from '../../modules/auth/models/auth-user';
import { AllowPendingPasswordChange } from '../decorators/allow-password-change.decorator';
import { SessionGuard } from './session.guard';

jest.mock('@auth/express', () => ({ getSession: jest.fn() }));

class Handlers {
  normal() {}
  @AllowPendingPasswordChange()
  exempt() {}
}

const user = (mustChangePassword: boolean): AuthUser => ({
  id: 'u1',
  email: 'u1@example.test',
  fullName: 'Usuario',
  roles: ['STUDENT'],
  mustChangePassword,
});

function setup(found: AuthUser | null, handler: () => void) {
  (authExpress.getSession as jest.Mock).mockResolvedValue({ user: { id: 'u1' } });
  const auth = { findActiveUser: jest.fn(async () => found) } as unknown as AuthService;
  const guard = new SessionGuard({} as ExpressAuthConfig, auth, new Reflector());
  const request: { user?: AuthUser } = {};
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => Handlers,
  } as unknown as ExecutionContext;
  return { guard, context, request };
}

describe('SessionGuard y cambio de contraseña obligatorio', () => {
  const handlers = new Handlers();

  it('deja pasar a un usuario sin cambio pendiente', async () => {
    const { guard, context, request } = setup(user(false), handlers.normal);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user?.id).toBe('u1');
  });

  it('bloquea con PASSWORD_CHANGE_REQUIRED las rutas no exentas', async () => {
    const { guard, context } = setup(user(true), handlers.normal);
    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toEqual({
      message: 'Debes cambiar tu contraseña antes de continuar.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  });

  it('permite las rutas marcadas como exentas', async () => {
    const { guard, context } = setup(user(true), handlers.exempt);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('responde 401 si el usuario ya no está activo', async () => {
    const { guard, context } = setup(null, handlers.normal);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
