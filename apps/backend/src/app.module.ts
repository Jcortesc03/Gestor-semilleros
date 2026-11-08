import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth';
import { UsersModule } from './modules/users';
import { ProjectsModule } from './modules/projects';
import { BoardsModule } from './modules/boards';
import { IntegrationsModule } from './modules/integrations';
import { NotificationsModule } from './modules/notifications';
import { MeetingsModule } from './modules/meetings';
import { DashboardModule } from './modules/dashboard';
import { FacultiesModule } from './modules/faculties';
import { DocumentsModule } from './modules/documents';

@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule, UsersModule, ProjectsModule, BoardsModule, IntegrationsModule, NotificationsModule, MeetingsModule, DashboardModule, FacultiesModule, DocumentsModule],
})
export class AppModule {}
