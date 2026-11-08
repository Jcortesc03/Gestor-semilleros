// API pública del módulo de usuarios.
export { UsersModule } from './users.module';
export { UsersService, EmailAlreadyRegisteredError } from './services/users.service';
export { parseCreateUser, type CreateUserDto } from './dtos/create-user.dto';
export type { UserResponseDto } from './dtos/user-response.dto';
