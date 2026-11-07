import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ProjectsModule } from '../projects';
import { ActivitiesController } from './controllers/activities.controller';
import { BoardsController } from './controllers/boards.controller';
import { ActivitiesService } from './services/activities.service';
import { BoardsService } from './services/boards.service';
import { WorkAccessService } from './services/work-access.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [BoardsController, ActivitiesController],
  providers: [BoardsService, ActivitiesService, WorkAccessService],
})
export class BoardsModule {}
