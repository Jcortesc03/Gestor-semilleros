import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import type { ApiRequest } from '../../types/api.ts';
import { Button, ErrorNotice, inputClassName } from '../../components/WorkspaceUi.tsx';
import { searchUsers } from './api.ts';
import type { DirectoryRole, DirectoryUser } from './api.ts';

export const USER_SEARCH_DEBOUNCE_MS = 250;
export const USER_SEARCH_MIN_CHARS = 2;

type Phase = 'idle' | 'loading' | 'ready' | 'error';

export interface UserPickerProps {
  request: ApiRequest;
  label: string;
  /** Solo muestra usuarios con este rol global. */
  role?: DirectoryRole;
  /** Usuarios que no deben ofrecerse (p. ej. ya elegidos). */
  excludeIds?: readonly string[];
  /** Si se indica, se muestra la persona elegida en lugar del buscador. */
  selected?: DirectoryUser | null;
  hint?: string;
  disabled?: boolean;
  onSelect: (user: DirectoryUser) => void;
  onClear?: () => void;
}

/**
 * Combobox accesible que busca en `GET /api/users` (debounce de 250 ms, mínimo 2 caracteres).
 * Cada consulta lleva un número; una respuesta cuyo número ya no es el vigente se descarta.
 */
export function UserPicker({ request, label, role, excludeIds = [], selected = null, hint, disabled = false, onSelect, onClear }: UserPickerProps) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const statusId = `${baseId}-status`;
  const hintId = `${baseId}-hint`;
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ticket = useRef(0);
  const excluded = excludeIds.join('|');

  const term = query.trim();
  const searchable = term.length >= USER_SEARCH_MIN_CHARS;

  useEffect(() => {
    const mine = ++ticket.current;
    setActive(-1);
    if (!searchable) { setPhase('idle'); setResults([]); setError(null); return undefined; }
    setPhase('loading');
    setError(null);
    const timer = setTimeout(() => {
      searchUsers(request, { search: term, ...(role ? { role } : {}) }).then(
        (items) => { if (mine === ticket.current) { setResults(items); setPhase('ready'); } },
        (reason: unknown) => { if (mine === ticket.current) { setError(reason); setPhase('error'); } },
      );
    }, USER_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [request, role, term, searchable]);

  const visible = results.filter((item) => !excluded.split('|').includes(item.id));
  const listVisible = open && phase === 'ready' && visible.length > 0;

  const choose = (user: DirectoryUser) => {
    setQuery(''); setOpen(false); setActive(-1); setResults([]); setPhase('idle');
    onSelect(user);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (visible.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + visible.length) % visible.length);
    } else if (event.key === 'Enter') {
      if (listVisible && active >= 0 && visible[active]) { event.preventDefault(); choose(visible[active]); }
    } else if (event.key === 'Escape') {
      if (open) { event.preventDefault(); setOpen(false); setActive(-1); }
    }
  };

  if (selected) {
    return (
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-semibold text-navy">{label}</p>
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-navy/50 bg-white px-3 py-2">
          <span className="min-w-0"><strong className="block truncate">{selected.fullName}</strong><span className="block truncate text-sm text-navy/70">{selected.email}</span></span>
          {onClear && <Button variant="secondary" disabled={disabled} onClick={onClear} aria-label={`Cambiar ${label.toLowerCase()}`}><X aria-hidden="true" className="size-4" />Cambiar</Button>}
        </div>
      </div>
    );
  }

  let statusText = '';
  if (phase === 'loading') statusText = 'Buscando usuarios…';
  else if (phase === 'ready' && visible.length === 0) statusText = 'No encontramos usuarios con ese criterio.';
  else if (phase === 'ready') statusText = `${visible.length} ${visible.length === 1 ? 'resultado' : 'resultados'}.`;

  return (
    <div className="relative min-w-0 space-y-2">
      <label htmlFor={inputId} className="block text-sm font-semibold text-navy">{label}</label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={listVisible}
        aria-controls={listId}
        aria-activedescendant={listVisible && active >= 0 ? `${baseId}-opt-${active}` : undefined}
        aria-describedby={`${statusId}${hint ? ` ${hintId}` : ''}`}
        className={inputClassName}
        value={query}
        disabled={disabled}
        maxLength={100}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={`Resultados de ${label.toLowerCase()}`}
        hidden={!listVisible}
        className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-navy/20 bg-white shadow-raised"
      >
        {visible.map((item, index) => (
          <li
            key={item.id}
            id={`${baseId}-opt-${index}`}
            role="option"
            aria-selected={index === active}
            className={`cursor-pointer px-3 py-2 ${index === active ? 'bg-navy text-white' : 'text-navy hover:bg-canvas'}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(item)}
          >
            <span className="block font-semibold">{item.fullName}</span>
            <span className="block text-sm opacity-80">{item.email}</span>
          </li>
        ))}
      </ul>
      {/* Altura reservada: evita que el resto de la fila se mueva al escribir. */}
      <p id={statusId} role="status" className="min-h-6 text-sm text-navy/70">{statusText}</p>
      {phase === 'error' && <ErrorNotice error={error} />}
      {hint && <p id={hintId} className="text-sm leading-relaxed text-navy/70">{hint}</p>}
    </div>
  );
}
