import { createReadStream, existsSync } from 'node:fs';
import { Controller, Get, Inject, NotFoundException, StreamableFile, UseGuards } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { SessionGuard } from '../../../common/guards/session.guard';
import type { NotificationsConfig } from '../../../config/notifications.config.types';
import type { WhatsAppStatus } from '../models/whatsapp-provider';
import { NOTIFICATIONS_CONFIG, WHATSAPP_GATEWAY } from '../services/channel-registry';
import type { WhatsAppGateway } from '../services/whatsapp/whatsapp-gateway.service';

export type WhatsAppStatusResponse = { transport: 'log' | 'disabled' } | ({ transport: 'builderbot' } & WhatsAppStatus);

/** Estado de la conexión de WhatsApp y QR de vinculación. Solo administradores. */
@Controller('integrations/whatsapp')
@UseGuards(SessionGuard, RolesGuard)
@Roles('ADMIN')
export class WhatsAppController {
  constructor(
    @Inject(NOTIFICATIONS_CONFIG) private readonly config: NotificationsConfig,
    @Inject(WHATSAPP_GATEWAY) private readonly gateway: WhatsAppGateway | null,
  ) {}

  @Get('status')
  status(): WhatsAppStatusResponse {
    if (!this.gateway || this.config.whatsapp.transport !== 'builderbot') {
      return { transport: this.config.whatsapp.transport === 'builderbot' ? 'disabled' : this.config.whatsapp.transport };
    }
    return { transport: 'builderbot', ...this.gateway.getStatus() };
  }

  /** PNG del QR a escanear desde WhatsApp → Dispositivos vinculados. */
  @Get('qr')
  qr(): StreamableFile {
    const path = this.gateway?.qrImagePath();
    if (!path || !existsSync(path)) throw new NotFoundException('No hay un QR pendiente de escanear.');
    return new StreamableFile(createReadStream(path), { type: 'image/png', disposition: 'inline' });
  }
}
