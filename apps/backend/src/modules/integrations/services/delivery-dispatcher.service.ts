import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { NotificationsConfig } from '../../../config/notifications.config.types';
import { PrismaService } from '../../../database/prisma.service';
import { DeliveryError, type ChannelSender } from '../models/channel';
import { CHANNEL_SENDERS, NOTIFICATIONS_CONFIG, senderFor } from './channel-registry';

export interface DispatchReport {
  sent: number;
  retrying: number;
  failed: number;
  skipped: number;
  /** Copias en espera porque el canal no está disponible (no gastan intentos). */
  deferred: number;
}

/** Tiempo que un envío queda reservado mientras se procesa (evita duplicados entre instancias). */
const LEASE_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const MAX_ERROR_LENGTH = 500;
/** Cada cuánto se vuelve a probar una copia en espera por un canal no disponible. */
export const DEFER_RETRY_MS = 60_000;
export const EXPIRED_REASON = (hours: number) =>
  `La copia no pudo enviarse en ${hours} h (canal no disponible); se descartó para no enviar un aviso vencido.`;

/** Espera exponencial entre reintentos: 1, 2, 4… minutos, con tope de una hora. */
export function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

/**
 * Procesa la bandeja de salida: envía los pendientes cuya hora llegó y programa los reintentos.
 * Corre en segundo plano cada `dispatchIntervalSeconds` y justo después de encolar (`kick`).
 */
@Injectable()
export class DeliveryDispatcher implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DeliveryDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<DispatchReport> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_SENDERS) private readonly senders: ChannelSender[],
    @Inject(NOTIFICATIONS_CONFIG) private readonly config: NotificationsConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.autoDispatch) return;
    this.timer = setInterval(() => this.kick(), this.config.dispatchIntervalSeconds * 1000);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
    for (const sender of this.senders) await (sender as { close?: () => unknown }).close?.();
  }

  /** Lanza un ciclo en segundo plano si el envío automático está activo. */
  kick(): void {
    if (!this.config.autoDispatch) return;
    this.runOnce().catch((error: unknown) => this.logger.error(`Fallo al procesar envíos: ${String(error)}`));
  }

  /** Procesa un lote. Si ya hay un ciclo en curso, devuelve ese mismo. */
  runOnce(batchSize = 100): Promise<DispatchReport> {
    this.running ??= this.process(batchSize).finally(() => (this.running = null));
    return this.running;
  }

  private async process(batchSize: number): Promise<DispatchReport> {
    const report: DispatchReport = { sent: 0, retrying: 0, failed: 0, skipped: 0, deferred: 0 };
    const expiresBefore = new Date(Date.now() - this.config.maxDeferHours * 3_600_000);
    const due = await this.prisma.notificationDelivery.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
      orderBy: { nextAttemptAt: 'asc' },
      take: batchSize,
      select: {
        id: true,
        channel: true,
        attempts: true,
        createdAt: true,
        dispatch: { select: { kind: true, subject: true, body: true } },
        user: { select: { email: true, phone: true, status: true } },
      },
    });

    for (const delivery of due) {
      // Reserva: solo una instancia puede incrementar el intento desde este valor.
      const claimed = await this.prisma.notificationDelivery.updateMany({
        where: { id: delivery.id, status: 'PENDING', attempts: delivery.attempts },
        data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + LEASE_MS) },
      });
      if (claimed.count === 0) continue;
      const attempts = delivery.attempts + 1;

      const address = delivery.channel === 'EMAIL' ? delivery.user.email : delivery.user.phone;
      const sender = senderFor(this.senders, delivery.channel);
      const skipReason =
        delivery.createdAt < expiresBefore
          ? EXPIRED_REASON(this.config.maxDeferHours)
          : delivery.user.status !== 'ACTIVE'
          ? 'Usuario inactivo.'
          : !address
            ? 'El usuario no tiene dirección para este canal.'
            : !sender
              ? 'Canal desactivado.'
              : null;
      if (skipReason || !sender || !address) {
        await this.mark(delivery.id, { status: 'SKIPPED', lastError: skipReason });
        report.skipped++;
        continue;
      }

      try {
        await sender.send(address, delivery.dispatch);
        await this.mark(delivery.id, { status: 'SENT', sentAt: new Date(), lastError: null });
        report.sent++;
      } catch (error) {
        const retryable = !(error instanceof DeliveryError) || error.retryable;
        const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);
        if (error instanceof DeliveryError && error.deferred) {
          // Canal no disponible: se devuelve el intento reservado y se vuelve a probar en un minuto.
          // Si sigue sin canal al vencer `maxDeferHours`, la comprobación de arriba la descarta.
          await this.mark(delivery.id, {
            status: 'PENDING',
            lastError: message,
            attempts: delivery.attempts,
            nextAttemptAt: new Date(Date.now() + DEFER_RETRY_MS),
          });
          report.deferred++;
        } else if (retryable && attempts < this.config.maxAttempts) {
          await this.mark(delivery.id, {
            status: 'PENDING',
            lastError: message,
            nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
          });
          report.retrying++;
        } else {
          await this.mark(delivery.id, { status: 'FAILED', lastError: message });
          report.failed++;
        }
      }
    }
    return report;
  }

  private async mark(
    id: string,
    data: {
      status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
      lastError?: string | null;
      sentAt?: Date;
      nextAttemptAt?: Date;
      attempts?: number;
    },
  ): Promise<void> {
    await this.prisma.notificationDelivery.update({ where: { id }, data });
  }
}
