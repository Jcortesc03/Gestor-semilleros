import { useCallback, useEffect, useState } from 'react';

export type CatalogState<T> = { phase: 'loading' } | { phase: 'error'; error: unknown } | { phase: 'ready'; items: T[] };

/** Carga un catálogo una vez; descarta la respuesta si el componente se desmonta o `load` cambia. */
export function useCatalog<T>(load: () => Promise<T[]>): [CatalogState<T>, () => void] {
  const [state, setState] = useState<CatalogState<T>>({ phase: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let current = true;
    setState({ phase: 'loading' });
    load().then(
      (items) => { if (current) setState({ phase: 'ready', items }); },
      (error: unknown) => { if (current) setState({ phase: 'error', error }); },
    );
    return () => { current = false; };
  }, [load, tick]);
  return [state, useCallback(() => setTick((n) => n + 1), [])];
}
