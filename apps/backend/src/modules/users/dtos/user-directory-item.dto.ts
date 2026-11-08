import type { Role } from '../../../generated/prisma/enums';

/**
 * Fila del directorio de selección (GET /api/users). Sin contraseña, teléfono ni fechas.
 * `status` solo se incluye cuando el administrador consulta con el parámetro `status` (ADR 0011).
 */
export interface UserDirectoryItemDto {
  id: string;
  fullName: string;
  email: string;
  roles: Role[];
  status?: 'ACTIVE' | 'INACTIVE';
}
