import { Module } from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthModule } from '../auth';
import { CatalogsAdminController } from './controllers/catalogs-admin.controller';
import { CatalogsController } from './controllers/catalogs.controller';
import { AreasAdminService } from './services/areas-admin.service';
import { CatalogsService } from './services/catalogs.service';
import { FacultiesAdminService } from './services/faculties-admin.service';

@Module({
  imports: [AuthModule],
  controllers: [CatalogsController, CatalogsAdminController],
  providers: [CatalogsService, AreasAdminService, FacultiesAdminService, RolesGuard],
  exports: [CatalogsService],
})
export class FacultiesModule {}
