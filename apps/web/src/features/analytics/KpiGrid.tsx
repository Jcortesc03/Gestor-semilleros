import type { AnalyticsData, ComparisonValues } from './api.ts';
import { USER_ROLE_LABELS, formatBytes, formatDecimal, formatNumber, formatRate } from './labels.ts';

const USER_ROLES = ['ADMIN', 'AREA_MANAGER', 'DEAN', 'TUTOR', 'STUDENT'] as const;

function deltaText(current: number | null, previous: number | null, kind: 'count' | 'rate'): string {
  if (current === null || previous === null) {
    return 'Sin comparación: falta la tasa en el periodo actual o en el anterior.';
  }
  const diff = current - previous;
  const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
  if (kind === 'rate') {
    const points = Math.abs(diff * 100);
    const amount = `${formatDecimal(points)} puntos porcentuales`;
    const trend = diff > 0 ? 'sube' : diff < 0 ? 'baja' : 'se mantiene';
    return `${arrow} ${trend} ${amount} frente al periodo anterior (${formatRate(current)} frente a ${formatRate(previous)}).`;
  }
  const amount = formatNumber(Math.abs(diff));
  const trend = diff > 0 ? 'sube' : diff < 0 ? 'baja' : 'se mantiene';
  return `${arrow} ${trend} ${amount} frente al periodo anterior (${formatNumber(current)} frente a ${formatNumber(previous)}).`;
}

function Kpi({
  label,
  value,
  help,
  comparison,
}: {
  label: string;
  value: string;
  help: string;
  comparison?: { current: ComparisonValues; previous: ComparisonValues; key: 'completions' | 'completionRate' | 'onTimeRate' | 'meetings' | 'attachments' | 'activitiesCreated'; kind: 'count' | 'rate' } | null;
}) {
  return (
    <article className="min-w-0 rounded-xl border border-navy/10 bg-white p-5 shadow-card">
      <p className="text-sm font-semibold text-navy/70">{label}</p>
      <p className="mt-2 break-words text-4xl font-extrabold leading-none tracking-tight text-navy">{value}</p>
      <p className="mt-3 text-sm leading-relaxed text-navy/70">{help}</p>
      {comparison && (
        <p className="mt-3 border-t border-navy/10 pt-3 text-sm font-semibold text-navy">
          {deltaText(comparison.current[comparison.key], comparison.previous[comparison.key], comparison.kind)}
        </p>
      )}
    </article>
  );
}

/** Indicadores principales; solo llegan datos del backend, sin valores inventados. */
export function KpiGrid({ data }: { data: AnalyticsData }) {
  const { users, activities, meetings, attachments, comparison } = data;
  const platform = users.platform;
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {platform && (
        <Kpi
          label="Usuarios de la plataforma"
          value={formatNumber(platform.total)}
          help={`${formatNumber(platform.active)} activos y ${formatNumber(platform.inactive)} inactivos. ${formatNumber(platform.newInPeriod)} creados en el periodo. Solo se muestra con alcance global y sin filtros. Detalle por rol:`}
        />
      )}
      <Kpi
        label="Participantes"
        value={formatNumber(users.participants)}
        help={`Usuarios con membresía activa en los proyectos filtrados; ${formatNumber(users.withAssignedActivities)} tienen al menos una actividad asignada.`}
      />
      <Kpi
        label="Participantes que completan"
        value={formatRate(users.completionRate)}
        help={`Participantes con al menos una actividad hecha, sobre participantes con al menos una actividad asignada (${formatNumber(users.completingActivities)} de ${formatNumber(users.withAssignedActivities)}).`}
      />
      <Kpi
        label="Actividades"
        value={formatNumber(activities.total)}
        help={`Actividades del periodo en el alcance filtrado; ${formatNumber(activities.overdueOpen)} abiertas ya vencidas${activities.avgDaysToComplete !== null ? `; promedio de ${formatDecimal(activities.avgDaysToComplete)} días para completarse` : ''}.`}
        comparison={comparison ? { current: comparison.current, previous: comparison.previous, key: 'activitiesCreated', kind: 'count' } : null}
      />
      <Kpi
        label="Tasa de finalización"
        value={formatRate(activities.completionRate)}
        help={`Actividades hechas sobre el total sin canceladas (${formatNumber(activities.byProgress.DONE)} hechas). «—» significa que no hay actividades evaluables.`}
        comparison={comparison ? { current: comparison.current, previous: comparison.previous, key: 'completionRate', kind: 'rate' } : null}
      />
      <Kpi
        label="Entregas a tiempo"
        value={formatRate(activities.onTime.rate)}
        help={`${formatNumber(activities.onTime.onTime)} de ${formatNumber(activities.onTime.evaluated)} actividades terminadas en el periodo se completaron en o antes del vencimiento de su tablero.`}
        comparison={comparison ? { current: comparison.current, previous: comparison.previous, key: 'onTimeRate', kind: 'rate' } : null}
      />
      <Kpi
        label="Tasa de aprobación"
        value={formatRate(activities.approvalRate)}
        help={`Actividades aprobadas sobre actividades hechas (${formatNumber(activities.byApproval.APPROVED)} aprobadas, ${formatNumber(activities.byApproval.REJECTED)} rechazadas).`}
      />
      <Kpi
        label="Reuniones"
        value={formatNumber(meetings.total)}
        help={`${formatNumber(meetings.totalMinutes)} minutos en total${meetings.avgMinutes !== null ? ` (promedio de ${formatDecimal(meetings.avgMinutes)} minutos)` : ''}; ${formatNumber(meetings.withRecording)} con grabación y ${formatNumber(meetings.withProject)} con proyecto.`}
        comparison={comparison ? { current: comparison.current, previous: comparison.previous, key: 'meetings', kind: 'count' } : null}
      />
      <Kpi
        label="Adjuntos"
        value={formatNumber(attachments.total)}
        help={`${formatNumber(attachments.byKind.LINK)} enlaces y ${formatNumber(attachments.byKind.DOCUMENT)} documentos (${formatBytes(attachments.totalBytes)}); ${formatNumber(attachments.activitiesWithAttachments)} actividades tienen al menos un adjunto.`}
        comparison={comparison ? { current: comparison.current, previous: comparison.previous, key: 'attachments', kind: 'count' } : null}
      />
      {platform && (
        <article className="min-w-0 rounded-xl border border-navy/10 bg-white p-5 shadow-card sm:col-span-2 lg:col-span-4">
          <p className="text-sm font-semibold text-navy/70">Usuarios por rol</p>
          <ul className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {USER_ROLES.map((role) => (
              <li key={role} className="min-w-0 rounded-lg bg-canvas px-3 py-2 text-sm text-navy">
                <span className="block font-semibold">{USER_ROLE_LABELS[role]}</span>
                <span className="block text-lg font-extrabold">{formatNumber(platform.byRole[role])}</span>
              </li>
            ))}
          </ul>
        </article>
      )}
    </div>
  );
}
