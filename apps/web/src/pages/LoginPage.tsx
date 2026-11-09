import { useState } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle, Lock, LogIn, Mail } from "lucide-react";
import type { Credentials } from "../types/auth";
import { AlertMessage } from "../components/AlertMessage";
import { BrandMark } from "../components/BrandMark";

interface LoginPageProps {
  /** El padre ejecuta el inicio de sesión y comunica el resultado con `error`. */
  onSubmit: (credentials: Credentials) => Promise<void>;
  /** Presente solo si el backend tiene habilitado Google. */
  onGoogle?: () => Promise<void>;
  onForgotPassword?: () => void;
  pending: boolean;
  error: string | null;
}

const ERROR_ID = "login-error";

/**
 * Pantalla de inicio de sesión (vista visual independiente).
 *
 * Sin llamadas de red, persistencia de sesión ni enrutado: el padre
 * conecta las credenciales con Auth.js y el estado de la sesión.
 * Tras cada intento se limpia la contraseña del formulario.
 *
 * Dirección (Frontlipe): producto institucional editorial y sobrio.
 * Área de marca azul marino con titular display en 800 e interletraje
 * ajustado, palabra clave en dorado; formulario en tarjeta blanca
 * sobre beige. Una sola familia (Montserrat), radios 8–12 px y
 * foco siempre visible. Sin héroe completo ni pruebas inventadas.
 */
export function LoginPage({ onSubmit, onGoogle, onForgotPassword, pending, error }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const credentials: Credentials = { email: email.trim(), password };

    try {
      await onSubmit(credentials);
    } catch {
      // El padre resuelve sus callbacks y comunica el fallo con la prop `error`;
      // aquí solo se evita una promesa sin tratar.
    } finally {
      setPassword("");
      setShowPassword(false);
    }
  }

  const fieldClasses =
    "h-12 w-full rounded-lg border border-navy/25 bg-white px-4 text-base text-navy placeholder:text-navy/65 transition-colors duration-150 hover:border-navy/45 focus:border-navy focus:outline-none focus:ring-2 focus:ring-gold/70 disabled:cursor-not-allowed disabled:bg-canvas/60 disabled:text-navy/60";

  return (
    <div className="min-h-dvh bg-canvas font-sans text-navy lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]">
      {/* Área de marca editorial sobre azul marino */}
      <aside className="on-dark relative overflow-hidden bg-navy text-white">
        <div
          aria-hidden="true"
          className="texture-dots pointer-events-none absolute -right-10 top-0 h-56 w-56 opacity-40"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-6 right-6 hidden h-44 w-44 opacity-25 lg:block"
        >
          <GraduationCapWatermark />
        </div>

        <div className="relative flex min-h-full flex-col px-6 py-8 sm:px-10 lg:min-h-dvh lg:px-14 lg:py-12">
          <BrandMark variant="light" />

          <div className="mt-10 max-w-xl lg:mt-0 lg:flex lg:flex-1 lg:flex-col lg:justify-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">
              Gestión académica y organizativa
            </p>
            <h1 className="mt-4 text-[clamp(2.25rem,5vw,4.5rem)] font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
              Semilleros de{" "}
              <span className="text-gold">investigación</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-white/85 sm:text-lg">
              Plataforma para la gestión académica, administrativa y
              organizativa de los semilleros de investigación universitaria.
            </p>

            <dl className="mt-10 hidden gap-8 border-t border-white/15 pt-8 sm:grid sm:grid-cols-3 lg:mt-12">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                  Trabajo académico
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-white/80">
                  Proyectos, tableros y actividades de tu semillero.
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                  Encuentros
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-white/80">
                  Reuniones con Microsoft Teams y novedades.
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                  Acceso
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-white/80">
                  Solo cuentas institucionales activas.
                </dd>
              </div>
            </dl>
          </div>

          <p className="mt-10 hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/60 lg:mt-0 lg:flex">
            <span aria-hidden="true" className="h-px w-8 bg-gold/80" />
            Gestor de Semilleros Universitarios
          </p>
        </div>
      </aside>

      {/* Formulario de acceso */}
      <main className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-14 lg:py-12">
        <section
          aria-labelledby="login-heading"
          className="w-full max-w-md rounded-xl border border-navy/10 bg-white p-6 shadow-card sm:p-10"
        >
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-navy/60">
              Acceso institucional
            </p>
            <h2
              id="login-heading"
              className="mt-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl"
            >
              Iniciar sesión
            </h2>
            <p className="mt-3 text-base leading-relaxed text-navy/70">
              Accede a tu panel personal con las credenciales de tu cuenta.
            </p>
          </div>

          {error ? <div className="mb-6"><AlertMessage id={ERROR_ID} message={error} /></div> : null}

          <form onSubmit={handleSubmit} noValidate={false} className="space-y-5">
            <div>
              <label
                htmlFor="login-email"
                className="mb-2 block text-sm font-semibold text-navy"
              >
                Correo electrónico
              </label>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-navy/50"
                  strokeWidth={1.75}
                />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={pending}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? ERROR_ID : undefined}
                  placeholder="tucorreo@ejemplo.edu"
                  className={`${fieldClasses} pl-12`}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-2 block text-sm font-semibold text-navy"
              >
                Contraseña
              </label>
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-navy/50"
                  strokeWidth={1.75}
                />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={pending}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? ERROR_ID : undefined}
                  placeholder="Tu contraseña"
                  className={`${fieldClasses} pl-12 pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  disabled={pending}
                  className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-navy/70 transition-colors duration-150 hover:bg-canvas hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:cursor-not-allowed disabled:text-navy/40"
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  ) : (
                    <Eye aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={pending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gold text-base font-semibold text-navy transition duration-150 hover:brightness-[0.97] hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none disabled:active:scale-100"
            >
              {pending ? (
                <>
                  <LoaderCircle aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
                  Iniciando sesión…
                </>
              ) : (
                <>
                  <LogIn aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  Iniciar sesión
                </>
              )}
            </button>
          </form>

          {onForgotPassword && (
            <div className="mt-1 text-center">
              <button type="button" onClick={onForgotPassword} disabled={pending}
                className="min-h-11 text-sm font-semibold text-navy underline decoration-gold underline-offset-4 disabled:opacity-50">
                Olvidé mi contraseña
              </button>
            </div>
          )}

          {onGoogle ? (
            <>
              <div className="my-6 flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.18em] text-navy/60">
                <span aria-hidden="true" className="h-px flex-1 bg-navy/15" />
                o
                <span aria-hidden="true" className="h-px flex-1 bg-navy/15" />
              </div>
              <button
                type="button"
                onClick={() => { void onGoogle(); }}
                disabled={pending}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-navy/25 bg-white text-base font-semibold text-navy transition duration-150 hover:border-navy/45 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:cursor-not-allowed disabled:opacity-60"
              >
                <GoogleIcon />
                Continuar con Google
              </button>
            </>
          ) : null}

          <p className="mt-6 text-center text-sm leading-relaxed text-navy/70" style={{ textAlign: 'center' }}>
            Si no puedes acceder, contacta con la administración de tu
            institución.
          </p>
        </section>
      </main>
    </div>
  );
}

/** Marca de agua decorativa del área de marca (sin contenido). */
function GraduationCapWatermark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-full w-full text-gold"
      aria-hidden="true"
    >
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-3.5" />
    </svg>
  );
}

/** Logotipo oficial de Google ("G" multicolor), requerido por sus pautas de marca. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.02c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.27a12 12 0 0 0 0 10.78z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44A11.53 11.53 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77z" />
    </svg>
  );
}
