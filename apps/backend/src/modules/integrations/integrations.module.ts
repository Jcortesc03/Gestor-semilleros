import { Module } from '@nestjs/common';
import type { AppEnv } from '../../config/env';
import { APP_ENV } from '../../config/env';
import type { NotificationsConfig } from '../../config/notifications.config.types';
import { AuthModule } from '../auth';
import { PreferencesController } from './controllers/preferences.controller';
import { buildChannelSenders, CHANNEL_SENDERS, NOTIFICATIONS_CONFIG } from './services/channel-registry';
import { DeliveryDispatcher } from './services/delivery-dispatcher.service';
import { NotificationDeliveryService } from './services/notification-delivery.service';
import { PreferencesService } from './services/preferences.service';

/** Copias de las novedades por canales externos (correo y WhatsApp) y preferencias de cada usuario. */
@Module({
  imports: [AuthModule],
  controllers: [PreferencesController],
  providers: [
    { provide: NOTIFICATIONS_CONFIG, inject: [APP_ENV], useFactory: (env: AppEnv) => env.notifications },
    { provide: CHANNEL_SENDERS, inject: [NOTIFICATIONS_CONFIG], useFactory: (c: NotificationsConfig) => buildChannelSenders(c) },
    PreferencesService,
    NotificationDeliveryService,
    DeliveryDispatcher,
  ],
  exports: [NotificationDeliveryService, DeliveryDispatcher],
})
export class IntegrationsModule {}
