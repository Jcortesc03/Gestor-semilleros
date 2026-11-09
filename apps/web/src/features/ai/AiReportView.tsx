import { RefreshCw } from 'lucide-react';
import { Button, EmptyState, PanelCard } from '../../components/WorkspaceUi.tsx';
import { formatDateRange, formatNumber } from '../analytics/labels.ts';
import type { AiResult, OverallStatus, Priority } from './api.ts';
import { FOCUS_LABELS, HORIZON_LABELS, PRIORITY_LABELS, SEVERITY_LABELS, STATUS_LABELS, savedPercent, sortByPriority } from './labels.ts';

const dateTime = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });

function generatedWhen(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : dateTime.format(date);
}

const STATUS_STYLES: Record<OverallStatus, string> = {
  GOOD: 'border-navy bg-white text-navy',
  ATTENTION: 'border-gold bg-gold text-navy',
  CRITICAL: 'border-alert bg-alert text-white',
};

const LEVEL_STYLES: Record<Priority, string> = {
  HIGH: 'border-alert bg-alert/10 text-alert',
  MEDIUM: 'border-gold bg-gold/30 text-navy',
  LOW: 'border-navy/30 bg-canvas text-navy',
};

function Badge({ className, children }: { className: string; children: string }) {
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${className}`}>{children}</span>;
}

function TextList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-navy">
      {items.map((entry, index) => <li key={index} className="break-words">{entry}</li>)}
    </ul>
  );
}

export function AiReportView({ result, busy, onRegenerate }: { result: AiResult; busy: boolean; onRegenerate: () => void }) {
  const { report, digest, usage } = result;
  const saved = savedPercent(digest.chars, digest.sourceChars);
  const recommendations = sortByPriority(report.recommendations);
  const scopeNames = [...result.scope.areas, ...result.scope.faculties].map((entry) => entry.name);

  return (
    <div className="min-w-0 space-y-7" aria-busy={busy}>
      <PanelCard
        title="Resultado"
        action={(
          <Button variant="secondary" disabled={busy} onClick={onRegenerate}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
            Regenerar
          </Button>
        )}
      >
        <div className="min-w-0 space-y-4">
          <Badge className={STATUS_STYLES[report.overallStatus]}>{STATUS_LABELS[report.overallStatus]}</Badge>
          <p className="whitespace-pre-line break-words text-base leading-relaxed text-navy">{report.summary}</p>
          <dl className="grid min-w-0 gap-4 border-t border-navy/10 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0"><dt className="text-navy/70">Modelo</dt><dd className="mt-1 break-words font-semibold text-navy">{result.model}</dd></div>
            <div className="min-w-0"><dt className="text-navy/70">Generado</dt><dd className="mt-1 font-semibold text-navy"><time dateTime={result.generatedAt}>{generatedWhen(result.generatedAt)}</time>{result.cached ? ' · desde caché' : ''}</dd></div>
            <div className="min-w-0"><dt className="text-navy/70">Periodo</dt><dd className="mt-1 font-semibold text-navy">{formatDateRange(result.period.from, result.period.to)}</dd></div>
            <div className="min-w-0"><dt className="text-navy/70">Alcance</dt><dd className="mt-1 break-words font-semibold text-navy">{result.scope.global ? 'Global' : scopeNames.join(', ') || 'Sin detalle'}</dd></div>
            <div className="min-w-0">
              <dt className="text-navy/70">Tokens usados</dt>
              <dd className="mt-1 font-semibold text-navy">
                {usage ? `${formatNumber(usage.inputTokens)} de entrada · ${formatNumber(usage.outputTokens)} de salida` : result.cached ? 'No aplica (caché)' : 'No informado'}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-navy/70">Resumen enviado a la IA</dt>
              <dd className="mt-1 font-semibold text-navy">
                {formatNumber(digest.chars)} de {formatNumber(digest.sourceChars)} caracteres (≈ {formatNumber(digest.approxTokens)} tokens)
                {saved !== null ? ` · ${saved} % menos` : ''}
                {digest.pseudonyms > 0 ? ` · ${formatNumber(digest.pseudonyms)} nombres seudonimizados` : ''}
              </dd>
            </div>
          </dl>
        </div>
      </PanelCard>

      <PanelCard title="Recomendaciones">
        {recommendations.length === 0 ? (
          <EmptyState title="Sin recomendaciones" description="La IA no devolvió recomendaciones para estos datos." />
        ) : (
          <ol className="min-w-0 space-y-5">
            {recommendations.map((item, index) => (
              <li key={index} className="min-w-0 rounded-xl border border-navy/15 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={LEVEL_STYLES[item.priority]}>{PRIORITY_LABELS[item.priority]}</Badge>
                  <Badge className="border-navy/30 bg-white text-navy">{HORIZON_LABELS[item.horizon]}</Badge>
                  <Badge className="border-navy/30 bg-canvas text-navy">{FOCUS_LABELS[item.focus]}</Badge>
                </div>
                <h3 className="mt-3 break-words text-lg font-bold tracking-tight text-navy">{item.title}</h3>
                <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-navy/85">{item.rationale}</p>
                {item.actions.length > 0 && (
                  <div className="mt-4 min-w-0"><h4 className="mb-1 text-sm font-semibold text-navy">Acciones</h4><TextList items={item.actions} /></div>
                )}
                {item.evidence.length > 0 && (
                  <div className="mt-4 min-w-0">
                    <h4 className="mb-2 text-sm font-semibold text-navy">Evidencia</h4>
                    <ul className="flex flex-wrap gap-2">
                      {item.evidence.map((entry, evidenceIndex) => <li key={evidenceIndex} className="max-w-full break-words rounded-lg bg-canvas px-3 py-1 text-sm text-navy">{entry}</li>)}
                    </ul>
                  </div>
                )}
                <p className="mt-4 break-words text-sm leading-relaxed text-navy"><span className="font-semibold">Impacto esperado: </span>{item.expectedImpact}</p>
              </li>
            ))}
          </ol>
        )}
      </PanelCard>

      {report.highlights.length > 0 && (
        <PanelCard title="Hallazgos">
          <ul className="min-w-0 space-y-4">
            {report.highlights.map((entry, index) => (
              <li key={index} className="min-w-0"><p className="break-words font-semibold text-navy">{entry.title}</p><p className="mt-1 break-words text-sm leading-relaxed text-navy/85">{entry.detail}</p></li>
            ))}
          </ul>
        </PanelCard>
      )}

      {report.risks.length > 0 && (
        <PanelCard title="Riesgos">
          <ul className="min-w-0 space-y-4">
            {report.risks.map((entry, index) => (
              <li key={index} className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="break-words font-semibold text-navy">{entry.title}</p><Badge className={LEVEL_STYLES[entry.severity]}>{SEVERITY_LABELS[entry.severity]}</Badge></div>
                <p className="mt-1 break-words text-sm leading-relaxed text-navy/85">{entry.detail}</p>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      {report.answer !== null && (
        <PanelCard title="Respuesta a tu pregunta">
          <p className="whitespace-pre-line break-words text-sm leading-relaxed text-navy">{report.answer}</p>
        </PanelCard>
      )}

      {report.dataGaps.length > 0 && (
        <PanelCard title="Vacíos de datos"><TextList items={report.dataGaps} /></PanelCard>
      )}

      <details className="min-w-0 rounded-xl border border-navy/10 bg-white p-5 shadow-card">
        <summary className="cursor-pointer text-sm font-semibold text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">Ver datos enviados a la IA</summary>
        <pre tabIndex={0} aria-label="Resumen de datos enviado a la IA en formato JSON" className="mt-4 max-h-96 overflow-auto rounded-lg bg-canvas p-4 text-xs leading-relaxed text-navy">{JSON.stringify(digest.data, null, 2)}</pre>
      </details>
    </div>
  );
}
