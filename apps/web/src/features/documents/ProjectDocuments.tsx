import { useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Download, Eye } from 'lucide-react';
import { AlertMessage } from '../../components/AlertMessage.tsx';
import { Button, EmptyState, ErrorNotice, LoadingState, PanelCard } from '../../components/WorkspaceUi.tsx';
import type { ApiRequest } from '../../types/api.ts';
import type { CurrentUser } from '../../types/auth.ts';
import { canPreviewInline, deleteDocument, documentUrl, DOCUMENT_EXTENSIONS, uploadDocument, validateDocumentFile } from './api.ts';
import type { ProjectDocument } from './api.ts';
import { DOCUMENT_FORMAT_LABELS, formatDateTime, formatFileSize } from './format.ts';
import { useProjectDocuments } from './useProjectDocuments.ts';

export interface ProjectDocumentsProps {
  user: CurrentUser;
  request: ApiRequest;
  projectId: string;
  /** Tutor activo del proyecto, administrador, decano o encargado de área: pueden eliminar cualquier documento. */
  canDeleteAny: boolean;
  /** Se llama tras subir o eliminar, para que otras vistas (p. ej. adjuntos de actividades) se actualicen. */
  onChanged?: () => void;
}

const FILE_INPUT_CLASS = 'block min-h-12 w-full rounded-lg border border-navy/50 bg-white px-3 py-2 text-sm text-navy file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-2 file:font-semibold file:text-white focus:border-navy focus:outline-2 focus:outline-offset-2 focus:outline-navy disabled:cursor-not-allowed disabled:opacity-60';
const LINK_CLASS = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-navy/30 bg-white px-4 py-2 text-base font-semibold text-navy transition hover:-translate-y-0.5 hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy motion-reduce:transform-none';

/** Documentos del proyecto (ADR 0013): listar, subir, descargar, ver (PDF e imágenes) y eliminar. */
export function ProjectDocuments({ user, request, projectId, canDeleteAny, onChanged }: ProjectDocumentsProps) {
  const documents = useProjectDocuments(request, projectId);
  const inputId = useId();
  const hintId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [validation, setValidation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const currentProject = useRef(projectId);

  // Al cambiar de proyecto se limpia el formulario; las respuestas del proyecto anterior se descartan por `currentProject`.
  useEffect(() => {
    currentProject.current = projectId;
    setFile(null);
    setValidation(null);
    setActionError(null);
    setBusy(false);
    setInputKey((value) => value + 1);
  }, [projectId]);

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setValidation(null);
    setActionError(null);
  };

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || busy) return;
    const problem = validateDocumentFile(file);
    if (problem) {
      setValidation(problem);
      return;
    }
    const target = projectId;
    setBusy(true);
    setActionError(null);
    setValidation(null);
    try {
      await uploadDocument(request, target, file);
      if (currentProject.current !== target) return;
      setFile(null);
      setInputKey((value) => value + 1);
      documents.reload();
      onChanged?.();
    } catch (reason) {
      if (currentProject.current === target) setActionError(reason);
    } finally {
      if (currentProject.current === target) setBusy(false);
    }
  };

  const remove = async (item: ProjectDocument) => {
    if (busy) return;
    if (!window.confirm(`¿Eliminar el documento «${item.fileName}»? Dejará de aparecer en el proyecto.`)) return;
    const target = projectId;
    setBusy(true);
    setActionError(null);
    try {
      await deleteDocument(request, item.id);
      if (currentProject.current !== target) return;
      documents.reload();
      onChanged?.();
    } catch (reason) {
      if (currentProject.current === target) setActionError(reason);
    } finally {
      if (currentProject.current === target) setBusy(false);
    }
  };

  const count = documents.status === 'ready'
    ? (documents.items.length === 1 ? '1 documento' : `${documents.items.length} documentos`)
    : undefined;

  return (
    <PanelCard
      title="Documentos"
      action={count ? <span className="text-sm text-navy/70">{count}</span> : undefined}
      help={{
        title: 'Documentos',
        description: 'Archivos del proyecto, hasta 25 MB cada uno. «Subir» guarda un archivo nuevo; «Descargar» lo baja a tu equipo; «Eliminar» lo borra del proyecto.',
        roles: {
          ADMIN: 'Como administrador, puedes subir, descargar y eliminar documentos de cualquier proyecto.',
          AREA_MANAGER: 'Como encargado de área, puedes subir, descargar y eliminar documentos de los proyectos de tus áreas.',
          DEAN: 'Como decano, puedes subir, descargar y eliminar documentos de los proyectos de tus facultades.',
          TUTOR: 'Como tutor, puedes subir, descargar y eliminar documentos del proyecto que tutorizas.',
          STUDENT: 'Como estudiante, puedes subir documentos al proyecto en el que participas y descargar los existentes; eliminar los documentos de otros requiere ser tutor o tener el permiso.',
        },
      }}
    >
      <form className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end" onSubmit={(event) => void upload(event)}>
        <div className="min-w-0 space-y-2">
          <label htmlFor={inputId} className="block text-sm font-semibold text-navy">Archivo a subir</label>
          <input
            key={inputKey}
            id={inputId}
            type="file"
            accept={DOCUMENT_EXTENSIONS.join(',')}
            aria-describedby={hintId}
            disabled={busy}
            onChange={choose}
            className={FILE_INPUT_CLASS}
          />
          <p id={hintId} className="text-sm leading-relaxed text-navy/70">PDF, Word, Excel o imagen (PNG, JPG, WEBP). Máximo 25 MB por archivo.</p>
        </div>
        <Button type="submit" disabled={busy || !file}>Subir documento</Button>
      </form>

      {validation && <div className="mt-4"><AlertMessage message={validation} /></div>}
      {actionError !== null && <div className="mt-4"><ErrorNotice error={actionError} /></div>}
      {busy && <div className="mt-4"><LoadingState label="Procesando el documento…" /></div>}

      <div className="mt-6">
        {documents.status === 'loading' && <LoadingState label="Cargando documentos…" />}
        {documents.status === 'error' && (
          <div className="space-y-4">
            <ErrorNotice error={documents.error} />
            <Button type="button" variant="secondary" onClick={documents.reload}>Reintentar</Button>
          </div>
        )}
        {documents.status === 'ready' && documents.items.length === 0 && (
          <EmptyState title="Sin documentos" description="Los documentos que subas al proyecto aparecerán aquí." />
        )}
        {documents.status === 'ready' && documents.items.length > 0 && (
          <ul className="divide-y divide-navy/10">
            {documents.items.map((item) => {
              const canDelete = canDeleteAny || item.uploadedBy.id === user.id;
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0 space-y-1">
                    <p className="break-all font-semibold text-navy">{item.fileName}</p>
                    <p className="text-sm leading-relaxed text-navy/70">
                      {DOCUMENT_FORMAT_LABELS[item.format]} · {formatFileSize(item.sizeBytes)} · Subido por {item.uploadedBy.fullName}, {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canPreviewInline(item.format) && (
                      <a href={documentUrl(item.id, { inline: true })} target="_blank" rel="noopener noreferrer" aria-label={`Ver ${item.fileName}`} className={LINK_CLASS}>
                        <Eye aria-hidden="true" className="size-4" />Ver
                      </a>
                    )}
                    <a href={documentUrl(item.id)} aria-label={`Descargar ${item.fileName}`} className={LINK_CLASS}>
                      <Download aria-hidden="true" className="size-4" />Descargar
                    </a>
                    {canDelete && (
                      <Button type="button" variant="danger" disabled={busy} aria-label={`Eliminar ${item.fileName}`} onClick={() => void remove(item)}>Eliminar</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PanelCard>
  );
}
