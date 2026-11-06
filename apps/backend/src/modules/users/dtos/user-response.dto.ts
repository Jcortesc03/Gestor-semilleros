import type { Role } from '../../../generated/prisma/enums';

/** Representación pública de un usuario. Nunca incluye el hash de la contraseña. */
export interface UserResponseDto {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'INACTIVE';
  roles: Role[];
  hasPassword: boolean;
  createdAt: string;
}
