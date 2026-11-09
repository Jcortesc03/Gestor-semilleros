import { BadGatewayException, Inject, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { MicrosoftAccountService } from './microsoft-account.service';
import { MicrosoftGraphError, type OnlineEvent, type OnlineEventInput, type TeamsCalendar } from './microsoft.types';

export const TEAMS_CALENDAR = Symbol('TEAMS_CALENDAR');

/** Reuniones de Teams en el calendario de la cuenta vinculada del organizador (API pública para `meetings`). */
@Injectable()
export class TeamsMeetingsService {
  private readonly logger = new Logger('Teams');

  constructor(
    private readonly accounts: MicrosoftAccountService,
    @Inject(TEAMS_CALENDAR) private readonly calendar: TeamsCalendar,
  ) {}

  /**
   * Crea el evento con enlace de Teams (o con el `joinUrl` del organizador si es cuenta personal). Responde 503 si la integración no está configurada,
   * 409 si el organizador no tiene cuenta vinculada y 502/422 si Microsoft falla.
   */
  async create(organizerId: string, input: OnlineEventInput): Promise<OnlineEvent> {
    const token = await this.accounts.accessTokenFor(organizerId);
    try {
      return await this.calendar.createOnlineEvent(token, input);
    } catch (error) {
      if (error instanceof MicrosoftGraphError && error.status === 422) {
        throw new UnprocessableEntityException(error.message);
      }
      this.logger.warn(`No se pudo crear la reunión en Teams: ${String((error as Error).message)}`);
      throw new BadGatewayException('No se pudo crear la reunión en Microsoft Teams; inténtalo de nuevo.');
    }
  }

  /** Tipo de la cuenta de Microsoft vinculada del organizador (`null` si no tiene). */
  accountTypeOf(organizerId: string) {
    return this.accounts.accountTypeOf(organizerId);
  }

  /** Cancela el evento en Teams (avisa a los invitados). Devuelve false si no se pudo. */
  async cancel(organizerId: string, eventId: string, comment: string): Promise<boolean> {
    try {
      const token = await this.accounts.accessTokenFor(organizerId);
      await this.calendar.cancelEvent(token, eventId, comment);
      return true;
    } catch (error) {
      this.logger.warn(`No se pudo cancelar la reunión en Teams: ${String((error as Error).message)}`);
      return false;
    }
  }
}
