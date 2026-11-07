import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthModule } from '../auth';
import { IntegrationsModule } from '../integrations';
import { AnnouncementsController } from './controllers/announcements.controller';
import { AnnouncementsService } from './services/announcements.service';
import { AudienceService } from './services/audience.service';

/** Novedades y notificaciones (la notificación es un tipo de novedad, P-16). */
@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, AudienceService, RolesGuard],
})
export class NotificationsModule {}
