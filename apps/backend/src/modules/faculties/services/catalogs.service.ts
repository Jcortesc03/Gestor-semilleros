import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { AreaDto, FacultyDto } from '../dtos/catalog-item.dto';

/** Catálogos institucionales de solo lectura (ADR 0009). */
@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `managed`: solo las áreas donde `userId` es encargado asignado (area_managers). */
  listAreas(scope: 'managed' | null, userId: string): Promise<AreaDto[]> {
    return this.prisma.area.findMany({
      where: scope === 'managed' ? { managers: { some: { userId } } } : undefined,
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    });
  }

  /** `dean`: solo las facultades donde `userId` es decano vigente (endsAt nulo o futuro). */
  listFaculties(scope: 'dean' | null, userId: string): Promise<FacultyDto[]> {
    const now = new Date();
    return this.prisma.faculty.findMany({
      where:
        scope === 'dean'
          ? { deans: { some: { userId, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } } }
          : undefined,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
