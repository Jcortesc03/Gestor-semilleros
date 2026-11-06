import { Module } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../config/env';
import { SessionGuard } from '../../common/guards/session.guard';
import { MeController } from './controllers/me.controller';
import { AUTH_CONFIG, createAuthConfig } from './services/auth-config.factory';
import { AuthService } from './services/auth.service';
import { PasswordService } from './services/password.service';

@Module({
  controllers: [MeController],
  providers: [
    PasswordService,
    AuthService,
    SessionGuard,
    {
      provide: AUTH_CONFIG,
      inject: [APP_ENV, AuthService],
      useFactory: (env: AppEnv, auth: AuthService) => createAuthConfig(env, auth),
    },
  ],
  exports: [AuthService, PasswordService, SessionGuard, AUTH_CONFIG],
})
export class AuthModule {}
