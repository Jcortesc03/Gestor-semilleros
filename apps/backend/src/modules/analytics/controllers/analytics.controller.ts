import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import type { AuthUser } from '../../auth';
import { parseAnalyticsQuery } from '../dtos/analytics-query.dto';
import type { AnalyticsFiltersDto, AnalyticsResponseDto } from '../dtos/analytics-response.dto';
import { ANALYTICS_ROLES } from '../models/analytics-scope';
import { AnalyticsService } from '../services/analytics.service';

@Controller('analytics')
@UseGuards(SessionGuard, RolesGuard)
@Roles(...ANALYTICS_ROLES)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Query() query: unknown): Promise<AnalyticsResponseDto> {
    return this.analytics.get(user, validated(parseAnalyticsQuery(query)));
  }

  @Get('filters')
  filters(@CurrentUser() user: AuthUser): Promise<AnalyticsFiltersDto> {
    return this.analytics.filters(user);
  }
}
