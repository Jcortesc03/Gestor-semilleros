import { Module } from '@nestjs/common';
import type { AppEnv } from '../../config/env';
import { APP_ENV } from '../../config/env';
import type { NotificationsConfig } from '../../config/notifications.config.types';
import { AuthModule } from '../auth';
import { PreferencesController } from './controllers/preferences.controller';
import { WhatsAppController } from './controllers/whatsapp.controller';
import { buildChannelSenders, CHANNEL_SENDERS, NOTIFICATIONS_CONFIG, WHATSAPP_GATEWAY } from './services/channel-registry';
import { WHATSAPP_PROVIDER_FACTORIES } from './services/whatsapp/provider-factories';
import { WhatsAppGateway } from './services/whatsapp/whatsapp-gateway.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DeliveryDispatcher } from './services/delivery-dispatcher.service';
import { NotificationDeliveryService } from './services/notification-delivery.service';
import { PreferencesService } from './services/preferences.service';

/** Copias de las novedades por canales externos (correo y WhatsApp con BuilderBot) y preferencias de cada usuario. */
@Module({
  imports: [AuthModule],
  controllers: [PreferencesController, WhatsAppController],
  providers: [
    { provide: NOTIFICATIONS_CONFIG, inject: [APP_ENV], useFactory: (env: AppEnv) => env.notifications },
    {
      provide: WHATSAPP_GATEWAY,
      inject: [NOTIFICATIONS_CONFIG],
      useFactory: (c: NotificationsConfig) =>
        c.whatsapp.transport === 'builderbot' ? new WhatsAppGateway(c.whatsapp.builderbot, WHATSAPP_PROVIDER_FACTORIES) : null,
    },
    {
      provide: CHANNEL_SENDERS,
      inject: [NOTIFICATIONS_CONFIG, WHATSAPP_GATEWAY],
      useFactory: (c: NotificationsConfig, whatsapp: WhatsAppGateway | null) => buildChannelSenders(c, whatsapp),
    },
    RolesGuard,
    PreferencesService,
    NotificationDeliveryService,
    DeliveryDispatcher,
  ],
  exports: [NotificationDeliveryService, DeliveryDispatcher],
})
export class IntegrationsModule {}
