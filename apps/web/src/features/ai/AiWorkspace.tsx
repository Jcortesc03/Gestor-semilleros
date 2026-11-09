import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { ApiRequest } from '../../types/api.ts';
import type { CurrentUser } from '../../types/auth.ts';
import { roleLabel } from '../../lib/roles.ts';
import { AlertMessage } from '../../components/AlertMessage.tsx';
import { EmptyState, ErrorNotice, LoadingState, PanelCard } from '../../components/WorkspaceUi.tsx';
import { getAnalyticsFilters } from '../analytics';
import type { AnalyticsFilterOptions } from '../analytics';
import { AiConfigForm } from './AiConfigForm.tsx';
import { AiReportView } from './AiReportView.tsx';
import { AI_PERSPECTIVES, DEFAULT_AI_LIMITS, defaultAiForm, generateRecommendations, getAiStatus } from './api.ts';
import type { AiFormState, AiResult, AiStatus } from './api.ts';

type StatusState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: AiStatus };

export function AiWorkspace({ request, user }: { request: ApiRequest; user: CurrentUser }) {
  const [status, setStatus] = useState<StatusState>({ status: 'loading' });
  const [options, setOptions] = useState<AnalyticsFilterOptions | null>(null);
  const [optionsError, setOptionsError] = useState<unknown>(null);
  const [form, setForm] = useState<AiFormState>(defaultAiForm);
  const [result, setResult] = useState<AiResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<unknown>(null);
  const mounted = useRef(true);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setStatus({ status: 'loading' });
    getAiStatus(request).then(
      (data) => { if (active) setStatus({ status: 'ready', data }); },
      (error: unknown) => { if (active) setStatus({ status: 'error', error }); },
    );
    getAnalyticsFilters(request).then(
      (data) => { if (active) { setOptions(data); setOptionsError(null); } },
      (error: unknown) => { if (active) setOptionsError(error); },
    );
    return () => { active = false; };
  }, [request]);

  const perspectives = useMemo(
    () => AI_PERSPECTIVES.filter((role) => user.roles.includes(role)).map((role) => ({ value: role, label: roleLabel(role) })),
    [user.roles],
  );

  const limits = status.status === 'ready' ? status.data.limits : DEFAULT_AI_LIMITS;
  const configured = status.status === 'ready' && status.data.configured;

  const generate = useCallback((refresh: boolean) => {
    setGenerating(true);
    setGenerateError(null);
    generateRecommendations(request, form, { refresh, limits }).then(
      (data) => {
        if (!mounted.current) return;
        setResult(data);
        setGenerating(false);
        resultRef.current?.focus();
      },
      (error: unknown) => {
        if (!mounted.current) return;
        setGenerateError(error);
        setGenerating(false);
      },
    );
  }, [request, form, limits]);

  return (
    <div className="min-w-0 space-y-7">
      <header className="on-dark relative min-w-0 overflow-hidden rounded-xl bg-navy p-5 text-white sm:p-7">
        <div aria-hidden="true" className="texture-dots pointer-events-none absolute -right-10 -top-6 h-40 w-40 opacity-30" />
        <div className="relative min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">Asistente IA</p>
          <h2 className="mt-2 break-words text-3xl font-extrabold tracking-tight">Recomendaciones con IA</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/85">
            Resume la analítica de tu alcance y genera recomendaciones, riesgos y hallazgos con OpenAI.
            {status.status === 'ready' && status.data.model ? ` Modelo: ${status.data.model}.` : ''}
          </p>
          <div aria-hidden="true" className="hairline-gold mt-6" />
        </div>
      </header>

      {status.status === 'loading' && <LoadingState label="Consultando el estado del asistente…" />}
      {status.status === 'error' && <ErrorNotice error={status.error} />}
      {status.status === 'ready' && !status.data.configured && (
        <AlertMessage message="La IA no está configurada en el servidor. Pide a un administrador que configure el acceso a OpenAI para poder generar recomendaciones." />
      )}
      {status.status === 'ready' && status.data.configured && (
        <p className="text-sm leading-relaxed text-navy/70">
          Límite: {status.data.rateLimitPerHour} generaciones por hora. Los resultados iguales se reutilizan de la caché durante {Math.round(status.data.cacheTtlSeconds / 60)} min; «Regenerar» la ignora.
        </p>
      )}
      {optionsError !== null && <ErrorNotice error={optionsError} />}

      <PanelCard
        title="Configuración"
        help={{
          title: 'Asistente IA',
          description: 'Elige los datos y el tipo de análisis, y genera recomendaciones con IA.',
          roles: {
            ADMIN: 'Como administrador puedes analizar toda la plataforma o filtrar por área, facultad, proyecto o tutor.',
            AREA_MANAGER: 'Como encargado de área, el análisis se limita a tus áreas asignadas.',
            DEAN: 'Como decano, el análisis se limita a tus facultades.',
          },
        }}
      >
        <AiConfigForm
          value={form}
          onChange={setForm}
          onSubmit={() => generate(false)}
          options={options}
          limits={limits}
          perspectives={perspectives}
          configured={configured}
          busy={generating}
        />
      </PanelCard>

      {generating && (
        <div aria-busy="true"><LoadingState label="Generando recomendaciones… Puede tardar decenas de segundos." /></div>
      )}
      {generateError !== null && !generating && <ErrorNotice error={generateError} />}

      <div ref={resultRef} tabIndex={-1} className="min-w-0 focus:outline-none">
        {result !== null ? (
          <AiReportView result={result} busy={generating} onRegenerate={() => generate(true)} />
        ) : !generating && generateError === null ? (
          <EmptyState
            title="Aún no hay recomendaciones"
            description="Configura los datos y el análisis y pulsa «Generar recomendaciones». El backend comprime un resumen de la analítica de tu alcance y lo envía a OpenAI. No se envían correos ni datos de contacto, y los nombres de personas se seudonimizan por defecto."
          />
        ) : null}
      </div>
      <p className="flex items-center gap-2 text-sm text-navy/70"><Sparkles aria-hidden="true" className="size-4 shrink-0" />Las recomendaciones son orientativas: contrástalas con los datos antes de decidir.</p>
    </div>
  );
}
