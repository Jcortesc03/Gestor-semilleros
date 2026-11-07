import { Module } from '@nestjs/common';
import type { AppEnv } from '../../config/env';
import { APP_ENV } from '../../config/env';
import type { NotificationsConfig } from '../../config/notifications.config.types';
import { AuthModule } from '../auth';
import { PreferencesController } from './controllers/preferences.controller';
import type { MicrosoftConfig } from '../../config/microsoft.config.types';
import { MicrosoftController } from './controllers/microsoft.controller';
import { WhatsAppController } from './controllers/whatsapp.controller';
import {
  MICROSOFT_CONFIG,
  MICROSOFT_OAUTH,
  MICROSOFT_PROFILE,
  MicrosoftAccountService,
} from './services/microsoft/microsoft-account.service';
import { MicrosoftGraphClient } from './services/microsoft/microsoft-graph.client';
import { MicrosoftOAuthClient } from './services/microsoft/microsoft-oauth.client';
import { TEAMS_CALENDAR, TeamsMeetingsService } from './services/microsoft/teams-meetings.service';
import { buildChannelSenders, CHANNEL_SENDERS, NOTIFICATIONS_CONFIG, WHATSAPP_GATEWAY } from './services/channel-registry';
import { WHATSAPP_PROVIDER_FACTORIES } from './services/whatsapp/provider-factories';
import { WhatsAppGateway } from './services/whatsapp/whatsapp-gateway.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DeliveryDispatcher } from './services/delivery-dispatcher.service';
import { NotificationDeliveryService } from './services/notification-delivery.service';
import { PreferencesService } from './services/preferences.service';

/**
 * Servicios externos: copias por correo y WhatsApp (BuilderBot) con las preferencias de cada usuario,
 * y Microsoft Teams (vinculación de cuentas y reuniones en su calendario).
 */
@Module({
  imports: [AuthModule],
  controllers: [PreferencesController, WhatsAppController, MicrosoftController],
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
    // Microsoft Teams (ADR 0007)
    { provide: MICROSOFT_CONFIG, inject: [APP_ENV], useFactory: (env: AppEnv) => env.microsoft },
    {
      provide: MICROSOFT_OAUTH,
      inject: [MICROSOFT_CONFIG],
      useFactory: (c: MicrosoftConfig | null) => (c ? new MicrosoftOAuthClient(c) : null),
    },
    { provide: MicrosoftGraphClient, useFactory: () => new MicrosoftGraphClient() },
    { provide: MICROSOFT_PROFILE, useExisting: MicrosoftGraphClient },
    { provide: TEAMS_CALENDAR, useExisting: MicrosoftGraphClient },
    MicrosoftAccountService,
    TeamsMeetingsService,
    PreferencesService,
    NotificationDeliveryService,
    DeliveryDispatcher,
  ],
  exports: [NotificationDeliveryService, DeliveryDispatcher, TeamsMeetingsService],
})
export class IntegrationsModule {}
