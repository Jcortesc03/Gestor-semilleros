import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function contextFor(roles: string[] | undefined, required: string[] | undefined) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user: roles ? { roles } : undefined }) }),
  } as unknown as ExecutionContext;
  return { guard: new RolesGuard(reflector), context };
}

describe('RolesGuard', () => {
  it('permite el acceso si la ruta no exige roles', () => {
    const { guard, context } = contextFor(['STUDENT'], undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('permite el acceso si el usuario tiene uno de los roles exigidos', () => {
    const { guard, context } = contextFor(['TUTOR', 'ADMIN'], ['ADMIN']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('responde 403 si el usuario no tiene ninguno de los roles exigidos', () => {
    const { guard, context } = contextFor(['TUTOR', 'DEAN'], ['ADMIN']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('responde 403 si no hay usuario en la petición', () => {
    const { guard, context } = contextFor(undefined, ['ADMIN']);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
