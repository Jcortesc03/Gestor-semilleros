import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SessionGuard } from '../../../common/guards/session.guard';
import type { AuthUser } from '../../auth';
import { DashboardService } from '../services/dashboard.service';

@Controller('dashboard')
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.dashboard.get(user);
  }
}
