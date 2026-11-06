// API pública del módulo de autenticación. Otros módulos importan solo desde aquí.
export { AuthModule } from './auth.module';
export { AuthService } from './services/auth.service';
export { PasswordService } from './services/password.service';
export { AUTH_BASE_PATH, AUTH_CONFIG } from './services/auth-config.factory';
export type { AuthUser } from './models/auth-user';
export { normalizeEmail } from './dtos/credentials.dto';
