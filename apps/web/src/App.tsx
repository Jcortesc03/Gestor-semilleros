import { useCallback, useEffect, useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { Workspace } from './layouts/Workspace';
import { AuthError, createAuthClient } from './services/auth';
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
  if (window.location.pathname !== path) window.history.replaceState(null, '', path);
}

export function App() {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expireSession = useCallback(() => {
    setSession({ status: 'ready', user: null });
    setError('Tu sesión expiró. Vuelve a iniciar sesión.');
    showRoute('/login');
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
      <main className="grid min-h-dvh place-items-center bg-[#F5F2EB] px-6 text-[#151B40]">
        <section aria-labelledby="session-title" className="w-full max-w-lg rounded-xl border border-[#151B40]/10 bg-white p-8 sm:p-12">
          <p className="mb-6 text-sm font-semibold">Gestor de Semilleros</p>
          <h1 id="session-title" className="text-2xl font-bold">
            {unavailable ? 'No podemos conectar con la aplicación' : 'Estamos verificando tu sesión'}
          </h1>
          <p className="mt-4 leading-relaxed" role={unavailable ? 'alert' : 'status'}>
            {unavailable
              ? 'El servicio no está disponible en este momento. Tu sesión no se ha modificado.'
              : 'Un momento, por favor.'}
          </p>
          {unavailable && (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mt-8 min-h-12 rounded-lg bg-[#F3B92F] px-6 font-semibold transition hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#151B40] motion-reduce:transform-none"
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
    : <LoginPage onSubmit={signIn} pending={pending} error={error} />;
}
