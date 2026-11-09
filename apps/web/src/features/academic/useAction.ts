import { useCallback, useEffect, useRef, useState } from 'react';

export type RunAction = (action: () => Promise<unknown>, after?: () => Promise<unknown>) => Promise<boolean>;

/** Ejecuta una mutación a la vez, expone `busy`/`error` y devuelve si terminó bien. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mounted = useRef(false);
  const running = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run: RunAction = useCallback(async (action, after) => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      await after?.();
      return true;
    } catch (reason) {
      if (mounted.current) setError(reason);
      return false;
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { busy, error, run, clearError };
}
