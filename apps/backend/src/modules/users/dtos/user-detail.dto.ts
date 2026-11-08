import type { Role } from '../../../generated/prisma/enums';

/** Detalle de un usuario para el administrador. Nunca incluye el hash de la contraseña. */
export interface UserDetailDto {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'INACTIVE';
  roles: Role[];
  hasPassword: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}
