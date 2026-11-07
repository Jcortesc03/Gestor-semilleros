import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import type { AuthUser } from '../../auth';
import { parseCatalogScope } from '../dtos/catalog-scope.dto';
import type { AreaDto, FacultyDto } from '../dtos/catalog-item.dto';
import { CatalogsService } from '../services/catalogs.service';

/** Catálogos: cualquier sesión válida puede consultarlos. */
@Controller()
@UseGuards(SessionGuard)
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  /** `?scope=managed`: solo las áreas donde el usuario actual es encargado asignado. */
  @Get('areas')
  areas(@Query() query: unknown, @CurrentUser() user: AuthUser): Promise<AreaDto[]> {
    const scope = validated(parseCatalogScope(query, ['managed'] as const));
    return this.catalogs.listAreas(scope, user.id);
  }

  /** `?scope=dean`: solo las facultades donde el usuario actual es decano vigente. */
  @Get('faculties')
  faculties(@Query() query: unknown, @CurrentUser() user: AuthUser): Promise<FacultyDto[]> {
    const scope = validated(parseCatalogScope(query, ['dean'] as const));
    return this.catalogs.listFaculties(scope, user.id);
  }
}
