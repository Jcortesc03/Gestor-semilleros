import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics';
import { AuthModule } from '../auth';
import { AiController } from './controllers/ai.controller';
import { AiService } from './services/ai.service';
import { AI_CLIENT, ClaudeClient } from './services/claude.client';

@Module({
  imports: [AuthModule, AnalyticsModule],
  controllers: [AiController],
  providers: [AiService, { provide: AI_CLIENT, useFactory: () => new ClaudeClient() }],
})
export class AiModule {}
