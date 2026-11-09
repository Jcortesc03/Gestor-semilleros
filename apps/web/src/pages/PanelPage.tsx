import { BookOpen, LoaderCircle, LogOut, Mail, ShieldCheck, User } from "lucide-react";
import type { CurrentUser } from "../types/auth";
import { AlertMessage } from "../components/AlertMessage";
import { BrandMark } from "../components/BrandMark";

interface PanelPageProps {
  user: CurrentUser;
  /** El padre cierra la sesión y comunica cualquier fallo con `error`. */
  onSignOut: () => Promise<void>;
  signingOut: boolean;
  error: string | null;
}

/**
 * Panel personal de la persona autenticada (vista visual independiente).
 *
 * Muestra únicamente datos reales del usuario recibido: perfil, correo y
 * roles. Sin analíticas, proyectos ni autorizaciones inventadas; los
 * módulos de gestión aún no están disponibles en esta versión.
 */
export function PanelPage({ user, onSignOut, signingOut, error }: PanelPageProps) {
  async function handleSignOut() {
    if (signingOut) return;
    try {
      await onSignOut();
    } catch {
      // El padre resuelve sus callbacks y comunica el fallo con la prop `error`;
      // aquí solo se evita una promesa sin tratar.
    }
  }

  const initials = getInitials(user);

  return (
    <div className="min-h-dvh bg-canvas font-sans text-navy lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Barra lateral de marca y sesión */}
      <aside className="on-dark relative overflow-hidden bg-navy text-white">
        <div
          aria-hidden="true"
          className="texture-dots pointer-events-none absolute -left-10 bottom-0 h-48 w-48 opacity-30"
        />

        <div className="relative flex flex-col gap-8 px-6 py-6 sm:px-8 lg:min-h-dvh lg:px-8 lg:py-10">
          <BrandMark variant="light" />

          {/* Resumen de la persona usuaria */}
          <section
            aria-labelledby="panel-user-heading"
            className="rounded-xl bg-navy-soft p-5"
          >
            <h2 id="panel-user-heading" className="sr-only">
              Tu cuenta
            </h2>
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="grid size-12 shrink-0 place-items-center rounded-full bg-gold text-base font-bold text-navy"
              >
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-white">{user.fullName}</p>
                <p className="truncate text-sm text-white/70">{user.email}</p>
              </div>
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                Roles
              </p>
              {user.roles.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {user.roles.map((role) => (
                    <li
                      key={role}
                      className="rounded-lg bg-gold px-3 py-1 text-xs font-semibold text-navy"
                    >
                      {role}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-white/70">Sin roles asignados</p>
              )}
            </div>
          </section>

          <div className="lg:mt-auto">
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gold text-base font-semibold text-navy transition duration-150 hover:brightness-[0.97] hover:shadow-raised active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none disabled:active:scale-100"
            >
              {signingOut ? (
                <>
                  <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                  Cerrando sesión…
                </>
              ) : (
                <>
                  <LogOut aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  Cerrar sesión
                </>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Contenido principal */}
      <main className="px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div className="mx-auto w-full max-w-5xl">
          <header className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-navy/70">
              Panel personal
            </p>
            <h1 className="mt-2 break-words text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
              Hola, {user.fullName}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-navy/70">
              Tu información de cuenta y el estado de tu sesión, en un solo
              lugar.
            </p>
          </header>

          {error ? (
            <div className="mb-8">
              <AlertMessage message={error} />
            </div>
          ) : null}

          <div className="grid gap-6 md:grid-cols-2">
            {/* Perfil */}
            <section
              aria-labelledby="panel-profile-heading"
              className="rounded-xl border border-navy/10 bg-white p-6 shadow-card sm:p-8"
            >
              <div className="mb-6 flex items-center gap-4">
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-gold/20 text-navy"
                >
                  <User className="size-5" strokeWidth={1.75} />
                </span>
                <h2
                  id="panel-profile-heading"
                  className="text-xl font-bold tracking-tight text-navy"
                >
                  Perfil
                </h2>
              </div>

              <dl className="space-y-5">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-navy/70">
                    Nombre completo
                  </dt>
                  <dd className="mt-1 break-words text-base font-semibold text-navy">{user.fullName}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-navy/70">
                    Correo electrónico
                  </dt>
                  <dd className="mt-1 flex items-center gap-2 break-all text-base font-semibold text-navy">
                    <Mail aria-hidden="true" className="size-4 shrink-0 text-navy/50" />
                    {user.email}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Roles */}
            <section
              aria-labelledby="panel-roles-heading"
              className="rounded-xl border border-navy/10 bg-white p-6 shadow-card sm:p-8"
            >
              <div className="mb-6 flex items-center gap-4">
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-gold/20 text-navy"
                >
                  <ShieldCheck className="size-5" strokeWidth={1.75} />
                </span>
                <h2
                  id="panel-roles-heading"
                  className="text-xl font-bold tracking-tight text-navy"
                >
                  Roles
                </h2>
              </div>

              {user.roles.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {user.roles.map((role) => (
                    <li
                      key={role}
                      className="rounded-lg bg-gold px-4 py-1.5 text-sm font-semibold text-navy"
                    >
                      {role}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-base leading-relaxed text-navy/70">
                  Sin roles asignados. Tu cuenta aún no tiene roles en esta
                  aplicación.
                </p>
              )}
            </section>

            {/* Estado de la sesión */}
            <section
              aria-labelledby="panel-session-heading"
              className="rounded-xl border border-navy/10 bg-white p-6 shadow-card sm:p-8"
            >
              <div className="mb-6 flex items-center gap-4">
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-gold/20 text-navy"
                >
                  <ShieldCheck className="size-5" strokeWidth={1.75} />
                </span>
                <h2
                  id="panel-session-heading"
                  className="text-xl font-bold tracking-tight text-navy"
                >
                  Sesión
                </h2>
              </div>

              <p className="flex items-center gap-3 text-base font-semibold text-navy">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full bg-gold ring-4 ring-gold/25"
                />
                Sesión activa
              </p>
              <p className="mt-3 text-base leading-relaxed text-navy/70">
                Estás conectado con tu cuenta en esta aplicación. Puedes
                cerrar la sesión en cualquier momento desde el panel lateral.
              </p>
            </section>

            {/* Módulos no disponibles */}
            <section
              aria-labelledby="panel-modules-heading"
              className="rounded-xl border border-navy/10 bg-canvas p-6 sm:p-8 md:col-span-2"
            >
              <div className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-navy text-gold"
                >
                  <BookOpen className="size-5" strokeWidth={1.75} />
                </span>
                <div>
                  <h2
                    id="panel-modules-heading"
                    className="text-xl font-bold tracking-tight text-navy"
                  >
                    Módulos de gestión
                  </h2>
                  <p className="mt-3 max-w-2xl text-base leading-relaxed text-navy/70">
                    Los módulos de gestión aún no están disponibles en esta
                    versión de la aplicación. Por ahora, este panel muestra
                    únicamente tu información de cuenta.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Iniciales a partir del nombre; si no hay nombre, la inicial del correo. */
function getInitials(user: CurrentUser): string {
  const nameParts = user.fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (nameParts.length >= 2) {
    return nameParts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }

  if (nameParts.length === 1) {
    return nameParts[0].charAt(0).toUpperCase();
  }

  const emailInitial = user.email.trim().charAt(0).toUpperCase();
  return emailInitial || "U";
}
