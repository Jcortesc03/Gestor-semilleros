import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../../config/env';
import { PrismaService } from '../../../database/prisma.service';
import { passwordPolicyErrors } from '../models/password-policy';
import type { RecoveryReset } from '../dtos/password-recovery.dto';
import { PasswordService } from './password.service';
import { PASSWORD_RECOVERY_MAILER, type RecoveryMailer } from './password-recovery-mailer';

const LIFETIME_MS = 10 * 60_000;
const COOLDOWN_MS = 60_000;
export const RECOVERY_MESSAGE = 'Si el correo corresponde a una cuenta activa con contraseña, recibirás un código de recuperación.';
export const INVALID_RECOVERY = 'El código o la autorización no son válidos o vencieron. Solicita un nuevo código.';

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  private readonly requests = new Map<string, { until: number; count: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(PASSWORD_RECOVERY_MAILER) private readonly mailer: RecoveryMailer,
  ) {}

  private digest(value: string): string {
    // A keyed digest prevents offline guessing of the million possible short codes.
    return createHmac('sha256', this.env.authSecret).update(`password-recovery:${value}`).digest('hex');
  }

  private allowRequest(ip: string): boolean {
    const now = Date.now();
    for (const [key, value] of this.requests) if (value.until <= now) this.requests.delete(key);
    const current = this.requests.get(ip);
    if (current) return ++current.count <= 10;
    if (this.requests.size >= 10_000) return false;
    this.requests.set(ip, { until: now + LIFETIME_MS, count: 1 });
    return true;
  }

  async request(email: string, ip: string): Promise<{ message: string }> {
    const result = { message: RECOVERY_MESSAGE };
    if (!this.allowRequest(ip)) return result;
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, status: 'ACTIVE', passwordHash: { not: null } },
      select: { id: true, email: true },
    });
    if (!user) return result;
    const now = new Date();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const data = { codeHash: this.digest(`${user.id}:${code}`), requestedAt: now,
      expiresAt: new Date(now.getTime() + LIFETIME_MS), attempts: 0,
      resetTokenHash: null, verifiedAt: null, consumedAt: null };
    const updated = await this.prisma.passwordRecovery.updateMany({
      where: { userId: user.id, requestedAt: { lte: new Date(now.getTime() - COOLDOWN_MS) } }, data,
    });
    if (updated.count === 0) {
      try { await this.prisma.passwordRecovery.create({ data: { userId: user.id, ...data } }); }
      catch (error) {
        if ((error as { code?: string }).code === 'P2002') return result;
        throw error;
      }
    }
    // Never expose SMTP latency/errors, addresses or codes in public responses/logs.
    void this.mailer.send(user.email, code).catch(() => this.logger.warn('No se pudo enviar un código de recuperación.'));
    return result;
  }

  async verify(email: string, code: string): Promise<{ resetToken: string }> {
    const now = new Date();
    const row = await this.prisma.passwordRecovery.findFirst({
      where: { user: { email: { equals: email, mode: 'insensitive' }, status: 'ACTIVE', passwordHash: { not: null } },
        expiresAt: { gt: now }, attempts: { lt: 5 }, verifiedAt: null, consumedAt: null },
    });
    if (!row) throw new BadRequestException(INVALID_RECOVERY);
    const matches = timingSafeEqual(Buffer.from(row.codeHash, 'hex'), Buffer.from(this.digest(`${row.userId}:${code}`), 'hex'));
    const resetToken = randomBytes(32).toString('hex');
    const updated = await this.prisma.passwordRecovery.updateMany({
      where: { userId: row.userId, codeHash: row.codeHash, requestedAt: row.requestedAt,
        attempts: { lt: 5 }, verifiedAt: null, consumedAt: null, expiresAt: { gt: now } },
      data: { attempts: { increment: 1 }, ...(matches ? { verifiedAt: now, resetTokenHash: this.digest(`grant:${resetToken}`) } : {}) },
    });
    if (!matches || updated.count !== 1) throw new BadRequestException(INVALID_RECOVERY);
    return { resetToken };
  }

  async reset(input: RecoveryReset): Promise<void> {
    const tokenHash = this.digest(`grant:${input.resetToken}`);
    const row = await this.prisma.passwordRecovery.findFirst({
      where: { resetTokenHash: tokenHash, consumedAt: null, verifiedAt: { not: null }, expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE', passwordHash: { not: null } } },
      include: { user: { select: { email: true, passwordHash: true } } },
    });
    if (!row) throw new BadRequestException(INVALID_RECOVERY);
    const errors = passwordPolicyErrors(input.newPassword, row.user.email);
    if (errors.length) throw new BadRequestException({ message: 'Datos inválidos.', errors });
    if (await this.passwords.verify(row.user.passwordHash!, input.newPassword)) {
      throw new BadRequestException('La nueva contraseña debe ser distinta de la actual.');
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const consumed = await tx.passwordRecovery.updateMany({
        where: { userId: row.userId, resetTokenHash: tokenHash, consumedAt: null,
          verifiedAt: { not: null }, expiresAt: { gt: now } },
        data: { consumedAt: now, resetTokenHash: null },
      });
      if (consumed.count !== 1) throw new BadRequestException(INVALID_RECOVERY);
      const changed = await tx.user.updateMany({
        where: { id: row.userId, status: 'ACTIVE', passwordHash: row.user.passwordHash },
        data: { passwordHash, passwordResetAt: now, mustChangePassword: false },
      });
      if (changed.count !== 1) throw new BadRequestException(INVALID_RECOVERY);
    });
  }
}
