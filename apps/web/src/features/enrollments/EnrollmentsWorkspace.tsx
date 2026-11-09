import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Button, EmptyState, ErrorNotice, Field, LoadingState, PanelCard, inputClassName } from '../../components/WorkspaceUi';
import type { CurrentUser } from '../../types/auth';
import type { ApiRequest } from '../../types/api';
import { changeEnrollmentStatus, deleteEnrollment, downloadEnrollmentExport, getEnrollmentOptions, importEnrollments, listEnrollments, previewEnrollments } from './api';
import type { Enrollment, EnrollmentFilters, EnrollmentOptions, EnrollmentPreview, EnrollmentStatus } from './api';

export interface EnrollmentsWorkspaceProps { user: CurrentUser; request: ApiRequest }

type Remote<T> = { phase: 'loading' } | { phase: 'error'; error: unknown } | { phase: 'ready'; data: T };

/** Carga con descarte de respuestas obsoletas y compatible con StrictMode (patrón de la aplicación). */
function useRemote<T>(load: () => Promise<T>, deps: readonly unknown[]): [Remote<T>, () => void] {
  const [state, setState] = useState<Remote<T>>({ phase: 'loading' });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let current = true;
    setState({ phase: 'loading' });
    loadRef.current().then(
      (data) => { if (current) setState({ phase: 'ready', data }); },
      (error: unknown) => { if (current) setState({ phase: 'error', error }); },
    );
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return [state, useCallback(() => setTick((n) => n + 1), [])];
}

const PAGE_LIMIT = 20;
const DELETE_CONFIRMATION = '¿Eliminar esta solicitud solo de esta aplicación? Esto no borra la respuesta en Google Forms ni en la hoja de Google Sheets.';
const RETENTION_NOTE = 'Las solicitudes rechazadas se conservan 3 días desde su rechazo y después el sistema las elimina automáticamente.';

function labelFor(options: EnrollmentOptions | null, values: { value: string; label: string }[], value: string | null): string {
  if (value === null) return '—';
  return values.find((option) => option.value === value)?.label ?? (options ? value : value);
}

interface DraftFilters { areaId: string; faculty: string; period: string; status: string; search: string }
const EMPTY_FILTERS: DraftFilters = { areaId: '', faculty: '', period: '', status: '', search: '' };

export function EnrollmentsWorkspace({ request }: EnrollmentsWorkspaceProps) {
  const [options, reloadOptions] = useRemote(() => getEnrollmentOptions(request), [request]);
  const [draft, setDraft] = useState<DraftFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<EnrollmentFilters>({});
  const [offset, setOffset] = useState(0);
  const [list, reloadList] = useRemote(
    () => listEnrollments(request, { ...applied, ...(offset > 0 ? { limit: PAGE_LIMIT, offset } : {}) }),
    [request, applied, offset],
  );
  const [actionError, setActionError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const [exporting, setExporting] = useState(false);

  // Flujo de importación: área, vista previa y confirmación explícita.
  const [areaId, setAreaId] = useState('');
  const [preview, setPreview] = useState<EnrollmentPreview | null>(null);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [imported, setImported] = useState<string | null>(null);
  const previewSeq = useRef(0);

  const opts = options.phase === 'ready' ? options.data : null;
  const selectedArea = opts?.areas.find((area) => area.id === areaId) ?? null;
  const sourceReady = selectedArea?.sourceConfigured ?? false;

  function clearPreview() {
    previewSeq.current += 1;
    setPreview(null);
    setPreviewError(null);
    setConfirmed(false);
    setImported(null);
  }

  function chooseArea(next: string) {
    setAreaId(next);
    clearPreview();
  }

  async function runPreview() {
    if (!selectedArea) return;
    const seq = previewSeq.current + 1;
    previewSeq.current = seq;
    setPreviewing(true);
    setPreviewError(null);
    setImported(null);
    try {
      const result = await previewEnrollments(request, selectedArea.id);
      if (previewSeq.current === seq && areaId === selectedArea.id) {
        setPreview(result);
        setConfirmed(false);
      }
    } catch (error) {
      if (previewSeq.current === seq) setPreviewError(error);
    } finally {
      if (previewSeq.current === seq) setPreviewing(false);
    }
  }

  async function runImport() {
    if (!preview) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await importEnrollments(request, preview.previewToken);
      clearPreview();
      setImported(
        result.imported === 1
          ? 'Se importó 1 solicitud.'
          : `Se importaron ${result.imported} solicitudes.`,
      );
      reloadList();
    } catch (error) { setActionError(error); } finally { setBusy(false); }
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setApplied({
      ...(draft.areaId ? { areaId: draft.areaId } : {}),
      ...(draft.faculty ? { faculty: draft.faculty as EnrollmentFilters['faculty'] } : {}),
      ...(draft.period.trim() ? { period: draft.period.trim() } : {}),
      ...(draft.status ? { status: draft.status as EnrollmentStatus } : {}),
      ...(draft.search.trim() ? { search: draft.search.trim() } : {}),
    });
    setOffset(0);
  }

  function changePage(nextOffset: number) {
    setOffset(Math.max(0, nextOffset));
  }

  async function changeStatus(id: string, next: 'ACCEPTED' | 'REJECTED') {
    setBusy(true);
    setActionError(null);
    try {
      await changeEnrollmentStatus(request, id, next);
      reloadList();
    } catch (error) { setActionError(error); } finally { setBusy(false); }
  }

  async function remove(item: Enrollment) {
    if (!window.confirm(DELETE_CONFIRMATION)) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteEnrollment(request, item.id);
      reloadList();
    } catch (error) { setActionError(error); } finally { setBusy(false); }
  }

  async function exportExcel() {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await downloadEnrollmentExport(globalThis.fetch, applied);
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'inscripciones.xlsx';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) { setExportError(error); } finally { setExporting(false); }
  }

  const total = list.phase === 'ready' ? list.data.total : 0;

  return (
    <div className="space-y-6">
      <PanelCard
        title="Inscripciones"
        action={<Button variant="secondary" onClick={() => void exportExcel()} disabled={exporting}><FileSpreadsheet aria-hidden="true" className="size-4" />Exportar Excel</Button>}
        help={{
          title: 'Inscripciones',
          description: 'Importación y revisión de solicitudes del formulario.',
          roles: {
            ADMIN: 'Como administrador, importas las respuestas del formulario desde la hoja privada de cualquier área: “Importar inscripciones” muestra una vista previa y pide confirmar antes de guardar. Cada solicitud tiene “Aceptar” (crea un usuario Estudiante con contraseña temporal y envía el correo) o “Rechazar”. Ves todas las áreas.',
            AREA_MANAGER: 'Como encargado de área, importas las respuestas del formulario desde la hoja privada de tus áreas: “Importar inscripciones” muestra una vista previa y pide confirmar antes de guardar. Cada solicitud tiene “Aceptar” (crea un usuario Estudiante con contraseña temporal y envía el correo) o “Rechazar”. Solo ves tus áreas.',
          },
        }}
      >
        {exportError ? <div className="mb-4"><ErrorNotice error={exportError} /></div> : null}

        {/* Importar inscripciones: selección de área, vista previa y confirmación. */}
        <div className="space-y-6">
          {options.phase === 'loading' && <LoadingState label="Cargando opciones de inscripción…" />}
          {options.phase === 'error' && <div className="space-y-4"><ErrorNotice error={options.error} /><Button variant="secondary" onClick={reloadOptions}>Reintentar</Button></div>}
          {opts && (
            <div className="space-y-6">
              <p className="max-w-3xl text-sm leading-relaxed text-navy/70">
                Importa las solicitudes enviadas desde el formulario y revisa la vista previa antes de confirmar.
              </p>
              <div className="min-w-0 space-y-2">
                <label htmlFor="enrollment-area" className="block text-sm font-semibold text-navy">Área de la fuente</label>
                <select id="enrollment-area" value={areaId} onChange={(event) => chooseArea(event.target.value)} className={inputClassName}>
                  <option value="">Elige un área</option>
                  {opts.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
                </select>
              </div>
              <Button onClick={() => void runPreview()} disabled={!selectedArea || !sourceReady || previewing} aria-disabled={!selectedArea || !sourceReady}>
                {previewing ? 'Consultando la hoja…' : 'Importar inscripciones'}
              </Button>
              {selectedArea && !sourceReady && (
                <p className="max-w-3xl text-sm leading-relaxed text-navy/70">La fuente aún no está configurada.</p>
              )}
              {actionError ? <ErrorNotice error={actionError} /> : null}
              {previewError ? <ErrorNotice error={previewError} /> : null}
              {imported && <p role="status" className="text-sm font-semibold text-navy">{imported}</p>}
              {preview && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-navy">
                    Leídas: {preview.summary.read} · Válidas: {preview.summary.valid} · Inválidas: {preview.summary.invalid} · Duplicadas: {preview.summary.duplicates}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[52rem] text-left text-sm">
                      <thead>
                        <tr className="border-b border-navy/10 text-navy/70">
                          <th className="py-2 pr-3 font-semibold">Fila</th>
                          <th className="py-2 pr-3 font-semibold">Nombres</th>
                          <th className="py-2 pr-3 font-semibold">Apellidos</th>
                          <th className="py-2 pr-3 font-semibold">Correo</th>
                          <th className="py-2 pr-3 font-semibold">Documento</th>
                          <th className="py-2 pr-3 font-semibold">Facultad</th>
                          <th className="py-2 pr-3 font-semibold">Tipo de área</th>
                          <th className="py-2 pr-3 font-semibold">Período</th>
                          <th className="py-2 pr-3 font-semibold">Autorización</th>
                          <th className="py-2 pr-3 font-semibold">Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row) => (
                          <tr key={row.sourceRow} className="border-b border-navy/10 align-top">
                            <td className="py-2 pr-3">{row.sourceRow}</td>
                            <td className="py-2 pr-3 font-semibold">{row.firstNames}</td>
                            <td className="py-2 pr-3">{row.lastNames}</td>
                            <td className="py-2 pr-3">{row.email}</td>
                            <td className="py-2 pr-3">
                              <span>{labelFor(opts, opts.documentTypes, row.documentType)}</span>{' '}
                              <span>{row.documentNumber}</span>
                            </td>
                            <td className="py-2 pr-3">{labelFor(opts, opts.faculties, row.faculty)}</td>
                            <td className="py-2 pr-3">{labelFor(opts, opts.areaTypes, row.areaType)}</td>
                            <td className="py-2 pr-3">{row.period}</td>
                            <td className="py-2 pr-3">{row.consent ? 'Sí' : 'No'}</td>
                            <td className="py-2 pr-3">
                              {row.errors.length > 0 && <span className="font-semibold text-alert">{row.errors.join(' ')}</span>}
                              {row.duplicate && <span className="font-semibold text-alert"> Duplicada.</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <label className="flex min-w-0 items-start gap-3 text-sm leading-relaxed text-navy">
                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 size-5 shrink-0 accent-[#151b40]" />
                    <span>Revisé la vista previa y confirmo que se guarden las solicitudes válidas de esta área.</span>
                  </label>
                  <Button onClick={() => void runImport()} disabled={!confirmed || busy}>Confirmar importación</Button>
                </div>
              )}
            </div>
          )}
        </div>

        <form onSubmit={applyFilters} className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="min-w-0 space-y-2">
            <label htmlFor="enrollment-filter-area" className="block text-sm font-semibold text-navy">Área</label>
            <select id="enrollment-filter-area" value={draft.areaId} onChange={(event) => setDraft({ ...draft, areaId: event.target.value })} className={inputClassName}>
              <option value="">Todas las áreas</option>
              {opts?.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="enrollment-filter-faculty" className="block text-sm font-semibold text-navy">Facultad</label>
            <select id="enrollment-filter-faculty" value={draft.faculty} onChange={(event) => setDraft({ ...draft, faculty: event.target.value })} className={inputClassName}>
              <option value="">Todas las facultades</option>
              {opts?.faculties.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <Field label="Período" value={draft.period} onChange={(event) => setDraft({ ...draft, period: event.target.value })} placeholder="2026-2" />
          <div className="min-w-0 space-y-2">
            <label htmlFor="enrollment-filter-status" className="block text-sm font-semibold text-navy">Estado</label>
            <select id="enrollment-filter-status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} className={inputClassName}>
              <option value="">Todos los estados</option>
              {opts?.statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <Field label="Buscar" value={draft.search} onChange={(event) => setDraft({ ...draft, search: event.target.value })} placeholder="Nombre, apellido o correo" />
          <div className="sm:col-span-2 lg:col-span-5">
            <Button type="submit" variant="secondary">Aplicar filtros</Button>
          </div>
        </form>

        {list.phase === 'loading' && <LoadingState label="Cargando inscripciones…" />}
        {list.phase === 'error' && <div className="space-y-4"><ErrorNotice error={list.error} /><Button variant="secondary" onClick={reloadList}>Reintentar</Button></div>}
        {list.phase === 'ready' && list.data.items.length === 0 && (
          <EmptyState title="No hay inscripciones" description="Cuando se importen solicitudes de la hoja aparecerán aquí." />
        )}
        {list.phase === 'ready' && list.data.items.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-navy/70">{total} {total === 1 ? 'solicitud' : 'solicitudes'}</p>
            <ul className="divide-y divide-navy/10">
              {list.data.items.map((item) => {
                const areaName = opts?.areas.find((area) => area.id === item.areaId)?.name ?? item.areaId;
                return (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <span className="block font-semibold text-navy"><span>{item.firstNames}</span> <span>{item.lastNames}</span></span>
                      <span className="block text-sm text-navy/70">{item.email}</span>
                      <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-navy/70">
                        <span>{opts ? labelFor(opts, opts.documentTypes, item.documentType) : item.documentType}</span>
                        <span>{item.documentNumber}</span>
                        <span>{opts ? labelFor(opts, opts.faculties, item.faculty) : item.faculty}</span>
                        <span>{areaName}</span>
                        <span>{opts ? labelFor(opts, opts.areaTypes, item.areaType) : item.areaType}</span>
                        <span>{item.period}</span>
                        <span className="font-semibold text-navy">{opts ? labelFor(opts, opts.statuses, item.status) : item.status}</span>
                      </span>
                      {item.rejectedAt && (
                        <span className="mt-1 block text-sm text-navy/70">Rechazada el {new Date(item.rejectedAt).toLocaleDateString('es')}</span>
                      )}
                    </div>
                    <span className="flex flex-wrap items-center gap-2">
                      {item.status !== 'ACCEPTED' && <Button variant="secondary" onClick={() => void changeStatus(item.id, 'ACCEPTED')} disabled={busy}>Aceptar</Button>}
                      {item.status !== 'REJECTED' && <Button variant="secondary" onClick={() => void changeStatus(item.id, 'REJECTED')} disabled={busy}>Rechazar</Button>}
                      {item.status === 'REJECTED' && <Button variant="danger" onClick={() => void remove(item)} disabled={busy}>Eliminar</Button>}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => changePage(offset - PAGE_LIMIT)} disabled={offset === 0}>Anterior</Button>
              <Button variant="secondary" onClick={() => changePage(offset + PAGE_LIMIT)} disabled={offset + PAGE_LIMIT >= total}>Siguiente</Button>
            </div>
          </div>
        )}
        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-navy/70">{RETENTION_NOTE}</p>
      </PanelCard>
    </div>
  );
}
