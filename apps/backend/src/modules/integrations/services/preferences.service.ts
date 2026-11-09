import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { UpdatePreferencesDto } from '../dtos/preferences.dto';
import { effectivePreferences, type PreferenceRow } from '../models/preferences';

export interface PreferencesResponse {
  phone: string | null;
  preferences: PreferenceRow[];
}

export const WHATSAPP_NEEDS_PHONE = 'Para recibir copias por WhatsApp debes registrar un teléfono.';

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<PreferencesResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { phone: true, notificationPrefs: { select: { kind: true, channel: true, enabled: true } } },
    });
    return { phone: user.phone, preferences: effectivePreferences(user.notificationPrefs) };
  }

  /** Guarda el teléfono y las preferencias indicadas; lo no indicado se conserva. */
  async update(userId: string, dto: UpdatePreferencesDto): Promise<PreferencesResponse> {
    const current = await this.get(userId);
    const phone = dto.phone !== undefined ? dto.phone : current.phone;
    const merged = current.preferences.map(
      (p) => dto.preferences?.find((c) => c.kind === p.kind && c.channel === p.channel) ?? p,
    );
    const turnsOnWhatsApp = dto.preferences?.some((c) => c.channel === 'WHATSAPP' && c.enabled) ?? false;
    if (!phone && turnsOnWhatsApp) {
      throw new BadRequestException({ message: 'Datos inválidos.', errors: [WHATSAPP_NEEDS_PHONE] });
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.phone !== undefined) await tx.user.update({ where: { id: userId }, data: { phone } });
      for (const change of dto.preferences ?? []) {
        await tx.notificationPreference.upsert({
          where: { userId_kind_channel: { userId, kind: change.kind, channel: change.channel } },
          create: { userId, ...change },
          update: { enabled: change.enabled },
        });
      }
    });
    return { phone, preferences: merged };
  }
}
