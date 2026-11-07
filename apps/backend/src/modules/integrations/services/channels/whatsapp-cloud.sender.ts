import type { WhatsAppCloudConfig } from '../../../../config/notifications.config.types';
import { NotificationChannel } from '../../../../generated/prisma/enums';
import { DeliveryError, type ChannelSender, type OutboundMessage } from '../../models/channel';

const MAX_PARAMETER_LENGTH = 1000;

/** Sanea y recorta el texto de un parámetro de plantilla de WhatsApp. */
function toTemplateParameter(text: string): string {
  const sanitized = text.replace(/[\r\n\t]/g, ' ').replace(/ {4,}/g, ' ');

  if (sanitized.length <= MAX_PARAMETER_LENGTH) {
    return sanitized;
  }

  return `${sanitized.slice(0, MAX_PARAMETER_LENGTH)}…`;
}

/** Canal de WhatsApp mediante la Cloud API de Meta. */
export class WhatsAppCloudSender implements ChannelSender {
  readonly channel = NotificationChannel.WHATSAPP;

  constructor(
    private readonly config: WhatsAppCloudConfig,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  async send(address: string, message: OutboundMessage): Promise<void> {
    const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: address.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: this.config.templateName,
        language: { code: this.config.templateLanguage },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: toTemplateParameter(message.subject) },
              { type: 'text', text: toTemplateParameter(message.body) },
            ],
          },
        ],
      },
    };

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new DeliveryError('No se pudo contactar la API de WhatsApp; se reintentará.', true);
    }

    if (!response.ok) {
      const status = response.status;
      const detail = await this.readErrorDetail(response);
      const retryable = status === 429 || (status >= 500 && status <= 599);
      const suffix = detail === null ? '.' : `: ${detail}`;

      throw new DeliveryError(`La API de WhatsApp rechazó el envío (${status})${suffix}`, retryable);
    }
  }

  private async readErrorDetail(response: Response): Promise<string | null> {
    try {
      const payload = (await response.json()) as { error?: { message?: unknown } };
      const message = payload.error?.message;
      if (typeof message !== 'string') {
        return null;
      }

      const token = this.config.accessToken;
      return token.length > 0 ? message.split(token).join('[token]') : message;
    } catch {
      return null;
    }
  }
}
