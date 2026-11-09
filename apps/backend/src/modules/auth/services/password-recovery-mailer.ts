import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../../config/env';
import { SmtpEmailSender } from '../../integrations/email';

export const PASSWORD_RECOVERY_MAILER = 'PASSWORD_RECOVERY_MAILER';
export interface RecoveryMailer { send(email: string, code: string): Promise<void> }

@Injectable()
export class PasswordRecoveryMailer implements RecoveryMailer, OnModuleDestroy {
  private readonly sender: SmtpEmailSender | null;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.sender = env.notifications.email.transport === 'smtp'
      ? new SmtpEmailSender(env.notifications.email.smtp) : null;
  }

  async send(email: string, code: string): Promise<void> {
    if (!this.sender) throw new Error('SMTP is not configured.');
    await this.sender.send(email, {
      kind: 'NOTIFICATION',
      subject: 'Código para recuperar tu contraseña — Gestor de Semilleros',
      body: `Tu código de recuperación es: ${code}\n\nVence en 10 minutos y admite hasta 5 intentos. No lo compartas.\nSi no solicitaste recuperar tu contraseña, ignora este correo.`,
    });
  }

  onModuleDestroy(): void { this.sender?.close(); }
}
