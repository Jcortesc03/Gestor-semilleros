import { Module } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../config/env';
import { AuthModule } from '../auth';
import { FacultiesModule, CatalogsService } from '../faculties';
import { EnrollmentController } from './controllers/enrollment.controller';
import { EnrollmentService } from './services/enrollment.service';
import { GoogleSheetsClient } from './services/google-sheets.client';
import { ENROLLMENT_APPROVAL_MAILER, SmtpEnrollmentApprovalMailer } from './services/enrollment-approval-mailer';
import { SHEET_PROVIDER, type SheetProvider } from './models/sheet-provider';

@Module({
  imports: [AuthModule, FacultiesModule],
  controllers: [EnrollmentController],
  providers: [
    EnrollmentService,
    { provide: ENROLLMENT_APPROVAL_MAILER, useClass: SmtpEnrollmentApprovalMailer },
    {
      provide: SHEET_PROVIDER,
      useFactory: (env: AppEnv): SheetProvider => {
        const cfg = env.enrollment.google;
        if (!cfg) {
          return {
            read: async () => {
              throw new Error('Google Sheets no configurado.');
            },
          };
        }
        return new GoogleSheetsClient(cfg);
      },
      inject: [APP_ENV],
    },
  ],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
