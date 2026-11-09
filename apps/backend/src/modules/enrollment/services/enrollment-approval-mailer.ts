import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../../config/env';
import { SmtpEmailSender } from '../../integrations/email';

/** Token de inyección del correo de aprobación de inscripción (las pruebas lo reemplazan por un falso). */
export const ENROLLMENT_APPROVAL_MAILER = Symbol('ENROLLMENT_APPROVAL_MAILER');

export interface EnrollmentApprovalMailer {
  sendApproval(email: string, subject: string, body: string): Promise<void>;
}

@Injectable()
export class SmtpEnrollmentApprovalMailer implements EnrollmentApprovalMailer, OnModuleDestroy {
  private readonly sender: SmtpEmailSender | null;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.sender = env.notifications.email.transport === 'smtp' ? new SmtpEmailSender(env.notifications.email.smtp) : null;
  }

  async sendApproval(email: string, subject: string, body: string): Promise<void> {
    if (!this.sender) throw new Error('SMTP is not configured.');
    await this.sender.send(email, { kind: 'NOTIFICATION', subject, body });
  }

  onModuleDestroy(): void {
    this.sender?.close();
  }
}
