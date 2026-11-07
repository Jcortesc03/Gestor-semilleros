import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import type { DeliveryStatus, DispatchPurpose, NotificationChannel, NotificationKind } from '../../../generated/prisma/enums';
import type { ChannelSender } from '../models/channel';
import { wantsCopy } from '../models/preferences';
import { CHANNEL_SENDERS } from './channel-registry';

/** Origen de la copia: una novedad, o un aviso de una reunión. */
export type DispatchSource =
  | { announcementId: string }
  | { meetingId: string; purpose: Exclude<DispatchPurpose, 'ANNOUNCEMENT'> };

/** Copia a encolar para sus destinatarios. */
export interface EnqueueRequest {
  source: DispatchSource;
  kind: NotificationKind;
  subject: string;
  body: string;
  recipientIds: readonly string[];
  /** Desde cuándo se envía (por defecto, ya). Los recordatorios se programan a futuro. */
  scheduledFor?: Date;
  /** Después de este momento la copia se descarta sin enviarse (p. ej. al empezar la reunión). */
  expiresAt?: Date | null;
}

function sourceData(source: DispatchSource) {
  return 'announcementId' in source
    ? { announcementId: source.announcementId, purpose: 'ANNOUNCEMENT' as const }
    : { meetingId: source.meetingId, purpose: source.purpose };
}

export type DeliverySummary = Record<NotificationChannel, Record<DeliveryStatus, number>>;

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class NotificationDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_SENDERS) private readonly senders: ChannelSender[],
  ) {}

  /**
   * Registra la copia y un envío pendiente por destinatario y canal, según sus preferencias.
   * Acepta el cliente de una transacción para que la novedad y su bandeja de salida se creen juntas.
   * Devuelve cuántos envíos se encolaron.
   */
  async enqueue(request: EnqueueRequest, db: Db = this.prisma): Promise<number> {
    const channels = this.senders.map((s) => s.channel);
    if (channels.length === 0 || request.recipientIds.length === 0) return 0;

    const users = await db.user.findMany({
      where: { id: { in: [...request.recipientIds] }, status: 'ACTIVE' },
      select: {
        id: true,
        phone: true,
        notificationPrefs: { where: { kind: request.kind }, select: { kind: true, channel: true, enabled: true } },
      },
    });

    const deliveries = users.flatMap((user) =>
      channels
        .filter((channel) => wantsCopy(user.notificationPrefs, request.kind, channel))
        .filter((channel) => channel !== 'WHATSAPP' || user.phone !== null)
        .map((channel) => ({ userId: user.id, channel })),
    );
    if (deliveries.length === 0) return 0;

    const scheduledFor = request.scheduledFor ?? new Date();
    const dispatch = await db.notificationDispatch.create({
      data: {
        ...sourceData(request.source),
        kind: request.kind,
        subject: request.subject,
        body: request.body,
        scheduledFor,
        expiresAt: request.expiresAt ?? null,
      },
      select: { id: true },
    });
    const { count } = await db.notificationDelivery.createMany({
      data: deliveries.map((d) => ({ ...d, dispatchId: dispatch.id, nextAttemptAt: scheduledFor })),
      skipDuplicates: true,
    });
    return count;
  }

  /**
   * Cancela los envíos pendientes de una novedad (p. ej. al eliminarla) o de una reunión
   * (p. ej. sus recordatorios al cancelarla); `purposes` limita qué avisos de la reunión.
   */
  async cancel(
    source: { announcementId: string } | { meetingId: string; purposes?: DispatchPurpose[] },
    reason = 'Novedad eliminada.',
    db: Db = this.prisma,
  ): Promise<number> {
    const dispatch =
      'announcementId' in source
        ? { announcementId: source.announcementId }
        : { meetingId: source.meetingId, ...(source.purposes ? { purpose: { in: source.purposes } } : {}) };
    const { count } = await db.notificationDelivery.updateMany({
      where: { status: 'PENDING', dispatch },
      data: { status: 'SKIPPED', lastError: reason },
    });
    return count;
  }

  /** Conteo de envíos por canal y estado. */
  async summary(announcementId: string): Promise<DeliverySummary> {
    const groups = await this.prisma.notificationDelivery.groupBy({
      by: ['channel', 'status'],
      where: { dispatch: { announcementId } },
      _count: { _all: true },
    });
    const empty = (): Record<DeliveryStatus, number> => ({ PENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 });
    const summary: DeliverySummary = { EMAIL: empty(), WHATSAPP: empty() };
    for (const g of groups) summary[g.channel][g.status] = g._count._all;
    return summary;
  }
}
