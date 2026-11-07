import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthModule } from '../auth';
import { ProjectsController } from './controllers/projects.controller';
import { MembersService } from './services/members.service';
import { ProjectAccessService } from './services/project-access.service';
import { ProjectsService } from './services/projects.service';

@Module({
  imports: [AuthModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, MembersService, ProjectAccessService, RolesGuard],
  exports: [ProjectAccessService],
})
export class ProjectsModule {}
