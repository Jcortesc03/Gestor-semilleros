import type { Role } from '../../../generated/prisma/enums';

/** Fila del directorio de selección (GET /api/users). Sin estado, contraseña, teléfono ni fechas. */
export interface UserDirectoryItemDto {
  id: string;
  fullName: string;
  email: string;
  roles: Role[];
}
