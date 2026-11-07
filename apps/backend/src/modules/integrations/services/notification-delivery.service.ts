import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import type { AnnouncementKind, DeliveryStatus, NotificationChannel } from '../../../generated/prisma/enums';
import type { ChannelSender } from '../models/channel';
import { wantsCopy } from '../models/preferences';
import { CHANNEL_SENDERS } from './channel-registry';

/** Copia de una novedad a encolar para sus destinatarios. */
export interface EnqueueRequest {
  announcementId: string;
  kind: AnnouncementKind;
  subject: string;
  body: string;
  recipientIds: readonly string[];
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

    const dispatch = await db.notificationDispatch.create({
      data: { announcementId: request.announcementId, kind: request.kind, subject: request.subject, body: request.body },
      select: { id: true },
    });
    const { count } = await db.notificationDelivery.createMany({
      data: deliveries.map((d) => ({ ...d, dispatchId: dispatch.id })),
      skipDuplicates: true,
    });
    return count;
  }

  /** Cancela los envíos pendientes de una novedad (p. ej. al eliminarla). */
  async cancel(announcementId: string, reason = 'Novedad eliminada.'): Promise<number> {
    const { count } = await this.prisma.notificationDelivery.updateMany({
      where: { status: 'PENDING', dispatch: { announcementId } },
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
