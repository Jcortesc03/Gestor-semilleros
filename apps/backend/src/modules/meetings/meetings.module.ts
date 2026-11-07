import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthModule } from '../auth';
import { IntegrationsModule } from '../integrations';
import { ProjectsModule } from '../projects';
import { MeetingsController } from './controllers/meetings.controller';
import { MeetingsService } from './services/meetings.service';

/** Reuniones agendadas en Microsoft Teams, con avisos a los participantes (ADR 0007). */
@Module({
  imports: [AuthModule, ProjectsModule, IntegrationsModule],
  controllers: [MeetingsController],
  providers: [MeetingsService, RolesGuard],
})
export class MeetingsModule {}
