import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { MessageCircle, RefreshCw } from 'lucide-react';
import type { CurrentUser } from '../../types/auth.ts';
import type { ApiRequest } from '../../types/api.ts';
import { Button, ErrorNotice, formatDate, LoadingState, PanelCard } from '../../components/WorkspaceUi';
import { getWhatsAppStatus, whatsappQrUrl, type WhatsAppStatus } from './api';
import { hasRole, Unavailable } from './shared';

const STATE_LABELS: Record<string, string> = {
  stopped: 'Detenido',
  starting: 'Iniciando',
  awaiting_qr: 'Esperando el escaneo del QR',
  awaiting_pairing_code: 'Esperando el código de emparejamiento',
  connected: 'Conectado',
  auth_failure: 'Fallo de autenticación',
};

export function WhatsappSection({ user, request }: { user: CurrentUser; request: ApiRequest }) {
  if (!hasRole(user, 'ADMIN')) {
    return <Unavailable title="Estado de WhatsApp" description="La conexión institucional solo puede consultarla un administrador." />;
  }
  return <WhatsappStatusPanel request={request} />;
}

/** Estados en los que WhatsApp cambia solo (el QR se renueva cada ~40 s): se consulta periódicamente. */
const POLLING_STATES = new Set(['starting', 'awaiting_qr', 'awaiting_pairing_code']);
const POLL_INTERVAL_MS = 5000;

/** Identifica la versión del QR: el backend cambia `updatedAt` con cada QR nuevo. */
function versionOf(status: WhatsAppStatus | null): string | null {
  return status?.transport === 'builderbot' ? status.updatedAt ?? null : null;
}

function WhatsappStatusPanel({ request }: { request: ApiRequest }) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  // Cada consulta vuelve a pedir la imagen: BuilderBot avisa del QR nuevo ANTES de escribir el PNG,
  // así que una sola descarga por `updatedAt` podía quedarse con el QR anterior.
  const [qrTick, setQrTick] = useState(0);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const load = useCallback(async (isActive: () => boolean = () => true) => {
    try {
      const next = await getWhatsAppStatus(request);
      if (!isActive()) return;
      setStatus(next);
      // Cada consulta reintenta la imagen: un fallo puntual (p. ej. mientras se reescribe el PNG) no la oculta.
      setQrFailed(false);
      setError(undefined);
      setQrTick((tick) => tick + 1);
      setCheckedAt(new Date());
    } catch (cause) {
      if (!isActive()) return;
      setStatus(null);
      setError(cause);
    }
  }, [request]);

  // Carga inicial al abrir la sección.
  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]);

  // Mientras se espera la vinculación, WhatsApp renueva el QR: se refresca solo para no mostrar uno caducado.
  const polling = status?.transport === 'builderbot' && POLLING_STATES.has(status.state);
  useEffect(() => {
    if (!polling) return;
    let active = true;
    const timer = window.setInterval(() => { void load(() => active); }, POLL_INTERVAL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [polling, load]);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setQrFailed(false);
    try {
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelCard
      title="Estado de WhatsApp"
      action={<MessageCircle aria-hidden="true" className="size-5 text-gold" />}
      help={{
        title: 'Estado de WhatsApp',
        description: 'Muestra si el servicio de WhatsApp está vinculado. Para vincularlo, escanea el código QR desde WhatsApp → Ajustes → Dispositivos vinculados. «Actualizar» recarga el estado.',
        roles: {
          ADMIN: 'Como administrador, consultas y actualizas el estado de vinculación de WhatsApp; no envías mensajes desde aquí.',
        },
      }}
    >
      <p className="mb-6 text-sm leading-relaxed text-navy/75">
        Estado reportado por el backend. Mientras se espera la vinculación se actualiza solo cada pocos segundos, porque WhatsApp
        renueva el QR. Para vincular la cuenta, escanéalo desde WhatsApp → Ajustes → Dispositivos vinculados.
      </p>
      <Button disabled={busy} onClick={refresh}>
        <RefreshCw aria-hidden="true" className="size-4" />
        {busy ? 'Consultando…' : 'Consultar estado'}
      </Button>
      {error !== undefined && <div className="mt-5"><ErrorNotice error={error} /></div>}
      {status === null && error === undefined && <LoadingState label="Consultando el estado de WhatsApp…" />}
      {status !== null && (
        <StatusDetails status={status} qrVersion={`${versionOf(status) ?? ''}-${qrTick}`} checkedAt={checkedAt} qrFailed={qrFailed} onQrError={() => setQrFailed(true)} />
      )}
    </PanelCard>
  );
}

function StatusDetails({ status, qrVersion, checkedAt, qrFailed, onQrError }: { status: WhatsAppStatus; qrVersion: string; checkedAt: Date | null; qrFailed: boolean; onQrError: () => void }) {
  if (status.transport === 'log') {
    return <StatusBox title="Transporte">Este entorno registra los envíos en el log y no conecta con WhatsApp.</StatusBox>;
  }
  if (status.transport === 'disabled') {
    return <StatusBox title="Transporte">WhatsApp está desactivado en este entorno.</StatusBox>;
  }

  return (
    <StatusBox title="Conexión BuilderBot">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Item label="Estado" value={STATE_LABELS[status.state] ?? status.state} />
        <Item label="Proveedor" value={status.provider} />
        <Item label="Número vinculado" value={status.connectedPhone ?? 'Aún no se conoce'} />
        <Item label="Última actualización" value={formatDate(status.updatedAt)} />
        {status.detail && <Item label="Detalle" value={status.detail} wide />}
      </dl>
      {status.pairingCode && (
        <p className="mt-4 text-sm">
          Código de emparejamiento: <strong className="font-mono text-base tracking-widest">{status.pairingCode}</strong>
        </p>
      )}
      {status.state === 'awaiting_qr' && (
        <figure className="mt-5 space-y-3">
          {qrFailed ? (
            <p className="text-sm font-semibold text-alert">
              No se pudo cargar el QR. Consulta el estado de nuevo por si ya cambió.
            </p>
          ) : (
            <img
              src={whatsappQrUrl(qrVersion)}
              alt="Código QR para vincular la cuenta de WhatsApp"
              width={256}
              height={256}
              className="size-64 rounded-lg border border-navy/10 bg-white p-2"
              onError={onQrError}
            />
          )}
          <figcaption className="text-sm text-navy/70">
            Escanéalo desde WhatsApp → Ajustes → Dispositivos vinculados. Se actualiza solo cada 5 segundos
            {checkedAt ? ` (última actualización: ${checkedAt.toLocaleTimeString('es-CO')})` : ''}.
          </figcaption>
        </figure>
      )}
    </StatusBox>
  );
}

function StatusBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-navy/10 bg-canvas/50 p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-navy/65">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Item({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-navy/65">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
