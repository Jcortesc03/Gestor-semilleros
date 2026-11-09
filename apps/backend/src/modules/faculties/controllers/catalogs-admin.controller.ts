import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import type { AuthUser } from '../../auth';
import { parseAssignDean, parseCreateArea, parseFacultyName, parseUpdateArea } from '../dtos/catalog-admin.dto';
import type { AreaDto, AreaManagerDto, FacultyDeanDto, FacultyDto } from '../dtos/catalog-item.dto';
import { AreasAdminService } from '../services/areas-admin.service';
import { FacultiesAdminService } from '../services/faculties-admin.service';

/** Administración de áreas, facultades, encargados y decanos (ADR 0010). */
@Controller()
@UseGuards(SessionGuard, RolesGuard)
export class CatalogsAdminController {
  constructor(
    private readonly areas: AreasAdminService,
    private readonly faculties: FacultiesAdminService,
  ) {}

  @Post('areas')
  @Roles('ADMIN')
  createArea(@Body() body: unknown): Promise<AreaDto> {
    return this.areas.create(validated(parseCreateArea(body)));
  }

  /** Administrador, o encargado del área (la pertenencia se comprueba en el servicio). */
  @Patch('areas/:id')
  @Roles('ADMIN', 'AREA_MANAGER')
  updateArea(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<AreaDto> {
    return this.areas.update(user, id, validated(parseUpdateArea(body)));
  }

  @Delete('areas/:id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeArea(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.areas.remove(id);
  }

  @Get('areas/:id/managers')
  @Roles('ADMIN')
  listManagers(@Param('id', ParseUUIDPipe) id: string): Promise<AreaManagerDto[]> {
    return this.areas.listManagers(id);
  }

  @Put('areas/:id/managers/:userId')
  @Roles('ADMIN')
  assignManager(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<AreaManagerDto> {
    return this.areas.assignManager(id, userId);
  }

  @Delete('areas/:id/managers/:userId')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeManager(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string): Promise<void> {
    return this.areas.removeManager(id, userId);
  }

  @Post('faculties')
  @Roles('ADMIN')
  createFaculty(@Body() body: unknown): Promise<FacultyDto> {
    return this.faculties.create(validated(parseFacultyName(body)));
  }

  @Patch('faculties/:id')
  @Roles('ADMIN')
  updateFaculty(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<FacultyDto> {
    return this.faculties.update(id, validated(parseFacultyName(body)));
  }

  @Delete('faculties/:id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFaculty(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.faculties.remove(id);
  }

  @Get('faculties/:id/deans')
  @Roles('ADMIN')
  listDeans(@Param('id', ParseUUIDPipe) id: string): Promise<FacultyDeanDto[]> {
    return this.faculties.listDeans(id);
  }

  @Put('faculties/:id/dean')
  @Roles('ADMIN')
  assignDean(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<FacultyDeanDto> {
    return this.faculties.assignDean(id, validated(parseAssignDean(body)).userId);
  }

  @Delete('faculties/:id/dean')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDean(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.faculties.removeDean(id);
  }
}
