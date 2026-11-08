import type { Role } from '../../../generated/prisma/enums';

/** Usuario autenticado tal como lo ve el resto del backend. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
  /** Contraseña temporal pendiente de cambio (ADR 0011). */
  mustChangePassword: boolean;
}

/** Perfil mínimo que entrega Google tras el inicio de sesión OAuth. */
export interface GoogleProfile {
  email?: string | null;
  email_verified?: boolean | null;
}
