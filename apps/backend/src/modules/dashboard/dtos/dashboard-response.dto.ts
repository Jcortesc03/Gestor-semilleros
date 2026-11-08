import type { DashboardSectionData } from '../models/dashboard-aggregation';

export type DashboardSectionDto = DashboardSectionData;

export interface DashboardResponseDto {
  generatedAt: string;
  sections: DashboardSectionDto[];
}
