import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './WorkspaceUi';
import { pageCount, slicePage, type Page } from '../lib/pagination';

/**
 * Controles de paginación (ADR 0017). No se muestran si todo cabe en una página.
 * `label` nombra la lista para lectores de pantalla («Proyectos», «Usuarios»…).
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  label,
  disabled = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const pages = pageCount(total, pageSize);
  if (total <= pageSize && page <= 1) return null;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav aria-label={`Paginación de ${label}`} className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-navy/80" aria-live="polite">
        {first}–{last} de {total} · página {page} de {pages}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior">
          <ChevronLeft aria-hidden="true" className="size-5" />
          <span className="hidden sm:inline">Anterior</span>
        </Button>
        <Button variant="secondary" disabled={disabled || page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Página siguiente">
          <span className="hidden sm:inline">Siguiente</span>
          <ChevronRight aria-hidden="true" className="size-5" />
        </Button>
      </div>
    </nav>
  );
}

/**
 * Paginación en el cliente para listas ya cargadas y acotadas. Vuelve a la primera página
 * cuando cambia `resetKey` (por ejemplo, un filtro) y se ajusta si la lista se acorta.
 */
export function useClientPagination<T>(items: readonly T[], pageSize = 10, resetKey?: unknown): Page<T> & { setPage: (page: number) => void } {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const result = useMemo(() => slicePage(items, page, pageSize), [items, page, pageSize]);
  return { ...result, setPage };
}
