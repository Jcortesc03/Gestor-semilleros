import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { SessionGuard } from '../../../common/guards/session.guard';
import { validated } from '../../../common/utils/validation';
import type { AuthUser } from '../../auth';
import { AI_ROLES, parseAiRecommendationsRequest } from '../dtos/ai-recommendations-request.dto';
import type { AiRecommendationsResponseDto, AiStatusDto } from '../dtos/ai-recommendations-response.dto';
import { AiService } from '../services/ai.service';

@Controller('ai')
@UseGuards(SessionGuard, RolesGuard)
@Roles(...AI_ROLES)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  status(): AiStatusDto {
    return this.ai.status();
  }

  @Post('recommendations')
  @HttpCode(200)
  recommend(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<AiRecommendationsResponseDto> {
    return this.ai.recommend(user, validated(parseAiRecommendationsRequest(body)));
  }
}
