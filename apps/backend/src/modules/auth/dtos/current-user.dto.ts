import type { AuthUser } from '../models/auth-user';

/** Respuesta de GET /api/me. */
export interface CurrentUserDto {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  mustChangePassword: boolean;
}

export function toCurrentUserDto(user: AuthUser): CurrentUserDto {
  return { id: user.id, email: user.email, fullName: user.fullName, roles: [...user.roles],
    mustChangePassword: user.mustChangePassword,
  };
}
