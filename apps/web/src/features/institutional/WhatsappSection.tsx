import { useState } from 'react';
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

function WhatsappStatusPanel({ request }: { request: ApiRequest }) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    setQrFailed(false);
    try {
      setStatus(await getWhatsAppStatus(request));
    } catch (cause) {
      setStatus(null);
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelCard title="Estado de WhatsApp" action={<MessageCircle aria-hidden="true" className="size-5 text-gold" />}>
      <p className="mb-6 text-sm leading-relaxed text-navy/75">
        Consulta bajo demanda el estado reportado por el backend. Esta pantalla no inicia, detiene ni vincula sesiones: para vincular
        la cuenta, escanea el QR desde WhatsApp → Dispositivos vinculados.
      </p>
      <Button disabled={busy} onClick={refresh}>
        <RefreshCw aria-hidden="true" className="size-4" />
        {busy ? 'Consultando…' : 'Consultar estado'}
      </Button>
      {error !== undefined && <div className="mt-5"><ErrorNotice error={error} /></div>}
      {busy && status === null && <LoadingState label="Consultando el estado de WhatsApp…" />}
      {status !== null && (
        <StatusDetails status={status} qrFailed={qrFailed} onQrError={() => setQrFailed(true)} />
      )}
    </PanelCard>
  );
}

function StatusDetails({ status, qrFailed, onQrError }: { status: WhatsAppStatus; qrFailed: boolean; onQrError: () => void }) {
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
              src={whatsappQrUrl(status.updatedAt)}
              alt="Código QR para vincular la cuenta de WhatsApp"
              width={256}
              height={256}
              className="size-64 rounded-lg border border-navy/10 bg-white p-2"
              onError={onQrError}
            />
          )}
          <figcaption className="text-sm text-navy/70">Escanéalo desde WhatsApp → Dispositivos vinculados.</figcaption>
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
