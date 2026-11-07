import { useCallback, useEffect, useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { Workspace } from './layouts/Workspace';
import { AuthError, authErrorFromUrl, createAuthClient } from './services/auth';
import type { AuthProviders } from './services/auth';
import type { Credentials, CurrentUser } from './types/auth';

type Session =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; user: CurrentUser | null };

const auth = createAuthClient();

function messageFor(error: unknown): string {
  return error instanceof AuthError
    ? error.message
    : 'No pudimos completar la solicitud. Intenta de nuevo.';
}

function showRoute(path: '/login' | '/panel'): void {
  // También descarta el `?error=` de Auth.js una vez leído, para que no reaparezca al recargar.
  if (window.location.pathname !== path || window.location.search !== '') window.history.replaceState(null, '', path);
}

export function App() {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(() => authErrorFromUrl(window.location.search)?.message ?? null);
  const [providers, setProviders] = useState<AuthProviders>({ credentials: true, google: false });

  const expireSession = useCallback(() => {
    setSession({ status: 'ready', user: null });
    setError('Tu sesión expiró. Vuelve a iniciar sesión.');
    showRoute('/login');
  }, []);

  useEffect(() => {
    let active = true;
    void auth.getProviders().then(
      (value) => { if (active) setProviders(value); },
      () => { /* Sin lista de proveedores se ofrece solo correo y contraseña. */ },
    );
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setSession({ status: 'loading' });
    void auth.getCurrentUser().then(
      (user) => {
        if (!active) return;
        setSession({ status: 'ready', user });
        showRoute(user ? '/panel' : '/login');
      },
      () => {
        if (active) setSession({ status: 'unavailable' });
      },
    );
    return () => { active = false; };
  }, [attempt]);

  async function signIn(credentials: Credentials): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const user = await auth.signIn(credentials);
      setSession({ status: 'ready', user });
      showRoute('/panel');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setPending(false);
    }
  }

  async function signInWithGoogle(): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await auth.signInWithGoogle();
      // La página navega hacia Google; `pending` se mantiene mientras tanto.
    } catch (cause) {
      setError(messageFor(cause));
      setPending(false);
    }
  }

  async function signOut(): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await auth.signOut();
      setSession({ status: 'ready', user: null });
      showRoute('/login');
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setPending(false);
    }
  }

  if (session.status !== 'ready') {
    const unavailable = session.status === 'unavailable';
    return (
      <main className="grid min-h-dvh place-items-center overflow-x-clip bg-canvas px-5 py-10 text-navy sm:px-8">
        <section aria-labelledby="session-title" className="w-full max-w-md overflow-hidden rounded-xl border border-navy/10 bg-white p-6 shadow-card sm:p-10">
          <div aria-hidden="true" className="hairline-gold -mx-6 -mt-6 mb-8 sm:-mx-10 sm:-mt-10" />
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-navy/60">
            Gestor de Semilleros Universitarios
          </p>
          <h1 id="session-title" className="mt-3 text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">
            {unavailable ? 'No podemos conectar con la aplicación' : 'Estamos verificando tu sesión'}
          </h1>
          <p className="mt-4 flex items-start gap-3 text-base leading-relaxed text-navy/70" role={unavailable ? 'alert' : 'status'}>
            {unavailable ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-alert"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 size-5 shrink-0 animate-spin text-navy motion-reduce:animate-none"><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>
            )}
            <span>
              {unavailable
                ? 'El servicio no está disponible en este momento. Tu sesión no se ha modificado.'
                : 'Un momento, por favor.'}
            </span>
          </p>
          {unavailable && (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-gold px-6 text-base font-semibold text-navy transition hover:brightness-[0.97] hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy active:scale-[0.985] sm:w-auto"
            >
              Reintentar conexión
            </button>
          )}
        </section>
      </main>
    );
  }

  return session.user
    ? <Workspace key={session.user.id} user={session.user} onSignOut={signOut} signingOut={pending} error={error} onExpired={expireSession} onRefresh={() => { setError(null); setAttempt((value) => value + 1); }} />
    : (
      <LoginPage
        onSubmit={signIn}
        onGoogle={providers.google ? signInWithGoogle : undefined}
        pending={pending}
        error={error}
      />
    );
}
