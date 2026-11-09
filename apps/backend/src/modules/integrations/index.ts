// API pública del módulo de integraciones (copias por correo y WhatsApp).
export { IntegrationsModule } from './integrations.module';
export { NotificationDeliveryService, type EnqueueRequest, type DeliverySummary } from './services/notification-delivery.service';
export { DeliveryDispatcher, type DispatchReport } from './services/delivery-dispatcher.service';
export { CHANNEL_SENDERS, NOTIFICATIONS_CONFIG } from './services/channel-registry';
export { DeliveryError, type ChannelSender, type OutboundMessage } from './models/channel';
export { TeamsMeetingsService, TEAMS_CALENDAR } from './services/microsoft/teams-meetings.service';
export { MICROSOFT_OAUTH, MICROSOFT_PROFILE, type MicrosoftOAuth, type MicrosoftProfileReader } from './services/microsoft/microsoft-account.service';
export type { TeamsCalendar, OnlineEvent, OnlineEventInput, MicrosoftTokens } from './services/microsoft/microsoft.types';
export type { DispatchSource } from './services/notification-delivery.service';
