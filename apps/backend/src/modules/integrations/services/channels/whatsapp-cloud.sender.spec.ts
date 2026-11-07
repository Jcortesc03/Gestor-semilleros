import type { WhatsAppCloudConfig } from '../../../../config/notifications.config.types';
import { AnnouncementKind, NotificationChannel } from '../../../../generated/prisma/enums';
import { DeliveryError, type OutboundMessage } from '../../models/channel';
import { WhatsAppCloudSender } from './whatsapp-cloud.sender';

const config: WhatsAppCloudConfig = {
  apiVersion: 'v21.0',
  phoneNumberId: '1234567890',
  accessToken: 'token-super-secreto',
  templateName: 'novedad_semillero',
  templateLanguage: 'es_CO',
};

const message: OutboundMessage = {
  kind: AnnouncementKind.NEWS,
  subject: 'Nueva convocatoria',
  body: 'Hola equipo, ya está abierta la convocatoria.',
};

type WhatsAppPayload = {
  messaging_product: string;
  to: string;
  type: string;
  template: {
    name: string;
    language: { code: string };
    components: Array<{
      type: string;
      parameters: Array<{ type: string; text: string }>;
    }>;
  };
};

type FetchArgs = Parameters<typeof fetch>;

function setup(response: Response = new Response('{}', { status: 200 })) {
  const fetchFn = jest.fn((..._args: FetchArgs): Promise<Response> => Promise.resolve(response));
  const sender = new WhatsAppCloudSender(config, fetchFn);
  return { sender, fetchFn };
}

function parsePayload(init: RequestInit | undefined): WhatsAppPayload {
  return JSON.parse(String(init?.body)) as WhatsAppPayload;
}

async function captureDeliveryError(promise: Promise<void>): Promise<DeliveryError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DeliveryError) {
      return error;
    }
    throw error;
  }
  throw new Error('Se esperaba un DeliveryError.');
}

describe('WhatsAppCloudSender', () => {
  it('expone el canal WHATSAPP', () => {
    const { sender } = setup();
    expect(sender.channel).toBe(NotificationChannel.WHATSAPP);
  });

  it('envía el POST exacto a la Cloud API con plantilla y parámetros de texto', async () => {
    const { sender, fetchFn } = setup();

    await sender.send('+573000000001', message);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer token-super-secreto',
      'Content-Type': 'application/json',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    expect(parsePayload(init)).toEqual({
      messaging_product: 'whatsapp',
      to: '573000000001',
      type: 'template',
      template: {
        name: 'novedad_semillero',
        language: { code: 'es_CO' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Nueva convocatoria' },
              { type: 'text', text: 'Hola equipo, ya está abierta la convocatoria.' },
            ],
          },
        ],
      },
    });
  });

  it('sanea saltos de línea, tabuladores y espacios repetidos en los parámetros', async () => {
    const { sender, fetchFn } = setup();

    await sender.send('+573000000001', {
      ...message,
      body: 'Línea uno\n\nLínea dos\tcon tabulaciones     y espacios',
    });

    const payload = parsePayload(fetchFn.mock.calls[0][1]);
    expect(payload.template.components[0].parameters[1].text).toBe(
      'Línea uno  Línea dos con tabulaciones y espacios',
    );
  });

  it('trunca cada parámetro a 1000 caracteres con puntos suspensivos', async () => {
    const { sender, fetchFn } = setup();

    await sender.send('+573000000001', { ...message, body: 'a'.repeat(1500) });

    const payload = parsePayload(fetchFn.mock.calls[0][1]);
    const text = payload.template.components[0].parameters[1].text;
    expect(text).toBe(`${'a'.repeat(1000)}…`);
    expect(text).toHaveLength(1001);
  });

  it.each([
    [400, false],
    [401, false],
    [429, true],
    [500, true],
    [503, true],
  ])('mapea el estado %s a retryable=%s e incluye el detalle', async (status, retryable) => {
    const response = new Response(
      JSON.stringify({ error: { message: 'La plantilla no está aprobada' } }),
      { status },
    );
    const { sender } = setup(response);

    const error = await captureDeliveryError(sender.send('+573000000001', message));

    expect(error.retryable).toBe(retryable);
    expect(error.message).toContain(String(status));
    expect(error.message).toContain('La plantilla no está aprobada');
    expect(error.message).not.toContain(config.accessToken);
  });

  it('nunca incluye el token aunque el error de Meta lo mencione', async () => {
    const response = new Response(
      JSON.stringify({ error: { message: `Token ${config.accessToken} inválido` } }),
      { status: 401 },
    );
    const { sender } = setup(response);

    const error = await captureDeliveryError(sender.send('+573000000001', message));

    expect(error.message).not.toContain(config.accessToken);
    expect(error.message).toContain('[token]');
  });

  it('trata un fallo de red como retryable y no filtra el token', async () => {
    const fetchFn = jest.fn((..._args: FetchArgs): Promise<Response> =>
      Promise.reject(new Error(`falló la conexión con ${config.accessToken}`)),
    );
    const sender = new WhatsAppCloudSender(config, fetchFn);

    const error = await captureDeliveryError(sender.send('+573000000001', message));

    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain(config.accessToken);
  });
});
