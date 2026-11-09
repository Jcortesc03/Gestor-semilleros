import type { PatternGroup } from './api.ts';
import { PATTERN_DIMENSION_HELP, PATTERN_DIMENSION_LABELS, bucketLabel, formatNumber, formatRate } from './labels.ts';

/** Índice del primer máximo no nulo; -1 si todos son nulos. */
function maxIndex(values: Array<number | null>): number {
  let best = -1;
  let bestValue = -Infinity;
  values.forEach((value, index) => {
    if (value !== null && value > bestValue) {
      bestValue = value;
      best = index;
    }
  });
  return best;
}

/**
 * Patrones por dimensión: cada bloque es una tabla con total, hechas y
 * tasas. El grupo con mayor finalización o mayor éxito lleva la
 * etiqueta visible «Patrón con más éxito», nunca solo un color.
 */
export function PatternsTable({ patterns }: { patterns: PatternGroup[] }) {
  if (patterns.length === 0) {
    return <p className="text-sm text-navy/70">Sin patrones para este periodo.</p>;
  }
  return (
    <div className="min-w-0 space-y-8">
      {patterns.map((group) => {
        const bestCompletion = maxIndex(group.buckets.map((bucket) => bucket.completionRate));
        const bestSuccess = maxIndex(group.buckets.map((bucket) => bucket.successRate));
        const titleId = `pattern-${group.dimension.toLowerCase()}`;
        return (
          <section key={group.dimension} aria-labelledby={titleId} className="min-w-0">
            <h3 id={titleId} className="text-base font-bold tracking-tight text-navy">
              {PATTERN_DIMENSION_LABELS[group.dimension]}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-navy/70">{PATTERN_DIMENSION_HELP[group.dimension]}</p>
            <div className="mt-3 min-w-0 overflow-x-auto">
              <table className="min-w-[36rem] w-full text-left text-sm text-navy">
                <caption className="sr-only">
                  {PATTERN_DIMENSION_LABELS[group.dimension]}: total, hechas, finalización, éxito y entregas a tiempo por grupo
                </caption>
                <thead>
                  <tr className="border-b-2 border-navy/20">
                    <th scope="col" className="px-2 py-2 font-bold">Grupo</th>
                    <th scope="col" className="px-2 py-2 font-bold">Total</th>
                    <th scope="col" className="px-2 py-2 font-bold">Hechas</th>
                    <th scope="col" className="px-2 py-2 font-bold">Finalización</th>
                    <th scope="col" className="px-2 py-2 font-bold">Éxito</th>
                    <th scope="col" className="px-2 py-2 font-bold">A tiempo</th>
                  </tr>
                </thead>
                <tbody>
                  {group.buckets.map((bucket, index) => {
                    const highlighted = index === bestCompletion || index === bestSuccess;
                    return (
                      <tr key={bucket.key} className={`border-b border-navy/10 ${highlighted ? 'bg-gold/15' : ''}`}>
                        <th scope="row" className={`min-w-0 break-words px-2 py-3 ${highlighted ? 'font-extrabold' : 'font-semibold'}`}>
                          {bucketLabel(group.dimension, bucket.key)}
                          {highlighted && (
                            <span className="ml-2 inline-block rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-navy">
                              Patrón con más éxito
                            </span>
                          )}
                        </th>
                        <td className="px-2 py-3">{formatNumber(bucket.total)}</td>
                        <td className="px-2 py-3">{formatNumber(bucket.done)}</td>
                        <td className={`px-2 py-3 ${index === bestCompletion ? 'font-extrabold' : ''}`}>{formatRate(bucket.completionRate)}</td>
                        <td className={`px-2 py-3 ${index === bestSuccess ? 'font-extrabold' : ''}`}>{formatRate(bucket.successRate)}</td>
                        <td className="px-2 py-3">{formatRate(bucket.onTimeRate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
