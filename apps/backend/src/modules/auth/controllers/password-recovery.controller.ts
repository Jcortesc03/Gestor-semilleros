import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { validated } from '../../../common/utils/validation';
import { parseRecoveryRequest, parseRecoveryReset, parseRecoveryVerification } from '../dtos/password-recovery.dto';
import { PasswordRecoveryService } from '../services/password-recovery.service';

// Deliberately outside /auth, which is owned by the Auth.js middleware.
@Controller('password-recovery')
export class PasswordRecoveryController {
  constructor(private readonly recovery: PasswordRecoveryService) {}

  @Post('request') @HttpCode(202)
  request(@Body() body: unknown, @Req() request: Request) {
    return this.recovery.request(validated(parseRecoveryRequest(body)).email, request.ip ?? 'unknown');
  }

  @Post('verify') @HttpCode(200)
  verify(@Body() body: unknown) {
    const input = validated(parseRecoveryVerification(body));
    return this.recovery.verify(input.email, input.code);
  }

  @Post('reset') @HttpCode(204)
  reset(@Body() body: unknown): Promise<void> {
    return this.recovery.reset(validated(parseRecoveryReset(body)));
  }
}
