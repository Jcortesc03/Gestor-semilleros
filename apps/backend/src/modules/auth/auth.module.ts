import { Module } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../config/env';
import { SessionGuard } from '../../common/guards/session.guard';
import { MeController } from './controllers/me.controller';
import { AUTH_CONFIG, createAuthConfig } from './services/auth-config.factory';
import { AuthService } from './services/auth.service';
import { PasswordService } from './services/password.service';
import { PasswordRecoveryController } from './controllers/password-recovery.controller';
import { PasswordRecoveryService } from './services/password-recovery.service';
import { PASSWORD_RECOVERY_MAILER, PasswordRecoveryMailer } from './services/password-recovery-mailer';

@Module({
  controllers: [MeController, PasswordRecoveryController],
  providers: [
    PasswordService,
    PasswordRecoveryService,
    { provide: PASSWORD_RECOVERY_MAILER, useClass: PasswordRecoveryMailer },
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
