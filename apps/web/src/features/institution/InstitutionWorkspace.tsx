import type { CurrentUser } from '../../types/auth.ts';
import type { ApiRequest } from '../../types/api.ts';
import { EmptyState, PanelCard } from '../../components/WorkspaceUi.tsx';
import { AreasPanel } from './AreasPanel.tsx';
import { FacultiesPanel } from './FacultiesPanel.tsx';

export interface InstitutionWorkspaceProps {
  user: CurrentUser;
  request: ApiRequest;
}

/**
 * Áreas y facultades (ADR 0010, sección 1).
 * - ADMIN: crea, renombra y elimina áreas y facultades; gestiona encargados y decanos.
 * - AREA_MANAGER: edita nombre y descripción de sus áreas; el backend decide cuáles.
 * Los permisos reales se aplican en el servidor; esta vista solo oculta lo que no corresponde.
 */
export function InstitutionWorkspace({ user, request }: InstitutionWorkspaceProps) {
  if (user.roles.includes('ADMIN')) {
    return (
      <div className="min-w-0 space-y-7">
        <AreasPanel request={request} admin />
        <FacultiesPanel request={request} />
      </div>
    );
  }
  if (user.roles.includes('AREA_MANAGER')) {
    return <AreasPanel request={request} admin={false} />;
  }
  return (
    <PanelCard title="Áreas y facultades">
      <EmptyState title="Sección no disponible para este rol" description="Solo administradores y encargados de área gestionan áreas y facultades." />
    </PanelCard>
  );
}
