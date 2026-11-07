import { useState } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle, Lock, LogIn, Mail } from "lucide-react";
import type { Credentials } from "../types/auth";
import { AlertMessage } from "../components/AlertMessage";
import { BrandMark } from "../components/BrandMark";

interface LoginPageProps {
  /** El padre ejecuta el inicio de sesión y comunica el resultado con `error`. */
  onSubmit: (credentials: Credentials) => Promise<void>;
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
 */
export function LoginPage({ onSubmit, pending, error }: LoginPageProps) {
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
          className="pointer-events-none absolute bottom-0 left-0 h-40 w-40 opacity-25"
        >
          <GraduationCapWatermark />
        </div>

        <div className="relative flex min-h-full flex-col px-6 py-8 sm:px-10 lg:min-h-dvh lg:px-14 lg:py-12">
          <BrandMark variant="light" />

          <div className="mt-10 max-w-xl lg:mt-0 lg:flex lg:flex-1 lg:flex-col lg:justify-center">
            <h1 className="text-4xl font-extrabold leading-[0.95] tracking-tight sm:text-5xl lg:text-6xl">
              Gestión de semilleros de investigación
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-white/80 sm:text-lg">
              Plataforma para la gestión académica, administrativa y
              organizativa de los semilleros de investigación de la
              universidad.
            </p>

            <dl className="mt-10 hidden gap-8 border-t border-white/15 pt-8 sm:grid sm:grid-cols-3 lg:mt-14">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                  Alcance inicial
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-white/75">
                  Acceso y consulta de tu cuenta personal.
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                  En desarrollo
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-white/75">
                  Reuniones, documentos y seguimiento de semilleros.
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                  Acceso
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-white/75">
                  Solo para cuentas registradas por la institución.
                </dd>
              </div>
            </dl>
          </div>

          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.22em] text-white/50 lg:mt-0">
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
          <div className="mb-8">
            <h2
              id="login-heading"
              className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl"
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
                  className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-navy/70 transition-colors duration-150 hover:bg-canvas hover:text-navy disabled:cursor-not-allowed disabled:text-navy/40"
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
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gold text-base font-semibold text-navy transition duration-150 hover:brightness-[0.97] hover:shadow-raised active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none disabled:active:scale-100"
            >
              {pending ? (
                <>
                  <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
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

          <p className="mt-6 text-sm leading-relaxed text-navy/70">
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
