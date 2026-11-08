import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_KEY = 'allowPasswordChangeRequired';

/**
 * Marca una ruta como accesible aunque el usuario tenga `mustChangePassword` (ADR 0011).
 * Solo `GET /api/me` y `PUT /api/me/password` la usan.
 */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);
