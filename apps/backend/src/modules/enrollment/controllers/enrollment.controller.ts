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
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import type { AuthUser } from '../../auth';
import { EnrollmentService } from '../services/enrollment.service';
import {
  parseImport,
  parseListQuery,
  parsePreview,
  parseSourceConfig,
  parseStatusBulk,
  parseStatusSingle,
} from '../dtos/enrollment.dto';

const uuid = new ParseUUIDPipe();

@Controller('enrollments')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN', 'AREA_MANAGER')
export class EnrollmentController {
  constructor(private readonly enrollments: EnrollmentService) {}

  @Get('options')
  options(@CurrentUser() user: AuthUser) {
    return this.enrollments.options(user);
  }

  @Put('sources/:areaId')
  configureSource(
    @CurrentUser() user: AuthUser,
    @Param('areaId', uuid) areaId: string,
    @Body() body: unknown,
  ) {
    return this.enrollments.configureSource(user, areaId, validated(parseSourceConfig(body)));
  }

  @Post('preview')
  preview(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.enrollments.preview(user, validated(parsePreview(body)).areaId);
  }

  @Post('import')
  importData(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.enrollments.importData(user, validated(parseImport(body)).previewToken);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    return this.enrollments.list(user, validated(parseListQuery(query)));
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ) {
    return this.enrollments.updateStatus(user, id, validated(parseStatusSingle(body)).status);
  }

  @Patch('status')
  bulkStatus(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const dto = validated(parseStatusBulk(body));
    return this.enrollments.bulkStatus(user, dto.ids, dto.status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string): Promise<void> {
    await this.enrollments.remove(user, id);
  }

  @Get('export.xlsx')
  async exportXlsx(
    @CurrentUser() user: AuthUser,
    @Query() query: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const parsed = validated(parseListQuery(query));
    const buffer = await this.enrollments.exportXlsx(user, parsed);
    response.status(HttpStatus.OK);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', 'attachment; filename="inscripciones.xlsx"');
    response.setHeader('Content-Length', String(buffer.length));
    response.send(buffer);
  }
}
