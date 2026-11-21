# ADR 0020 — Integración y entrega continuas (CI/CD)

- **Estado:** propuesto (pendiente de aprobación; no autoriza crear `.github/`, instalar dependencias ni configurar despliegues).
- **Fecha:** 2026-11-20.
- **Relacionado:** [ADR 0001](0001-modelo-de-datos-y-entorno-local.md) (PostgreSQL y Docker Compose local), [ADR 0002](0002-autenticacion-y-pruebas.md) (pruebas), [ADR 0012](0012-despliegue-con-contenedores.md) (contenedores y `compose.prod.yaml`), [ADR 0019](0019-linting-y-formato.md) (linting y formato, también propuesto).

## Contexto

El monorepo usa Node 24, pnpm 12.18.0 vía Corepack (`packageManager`) y Turborepo (`turbo: latest`, resuelto hoy a 2.11.10 por el lockfile). El backend genera el cliente de Prisma en una carpeta ignorada por git, así que cualquier pipeline debe ejecutar `db:generate` antes de tipar, probar o compilar. Las pruebas unitarias tardan ~18 s en total; la E2E de la API ~263 s (PostgreSQL) y la E2E web ~63 s (PostgreSQL, RustFS en `localhost:9000` y Chromium de Playwright, con el backend ya compilado).

Hoy no existe `.github/`, no hay checks, ninguna rama está protegida y los PR se fusionan sin revisión ni validación automática. En modo estricto, Turborepo no reenvía `TEST_DATABASE_URL`, por lo que `pnpm test:e2e` desde la raíz falla y hay que invocar por filtro o declarar la variable como `passThroughEnv`. Además, un pnpm del sistema distinto al de `packageManager` rompe Turbo: la CI debe usar Corepack.

El despliegue actual es **temporal**: Railway (proyecto `gallant-grace`) construye y despliega desde `develop` mediante su GitHub App, con `checkSuites: false` (no espera a la CI) y con `develop` alimentando a la vez los entornos `development` y `production`. No hay una decisión aprobada que oficialice Railway como infraestructura definitiva: el [ADR 0012](0012-despliegue-con-contenedores.md) y su `docker/compose.prod.yaml` siguen siendo la alternativa autohospedada. Este ADR no toma partido sobre el host final y mantiene la CI independiente de él.

Existe un hallazgo de seguridad (una credencial privada versionada en el repositorio público) que se gestiona por separado, fuera de este ADR. No se reproduce aquí ningún contenido de credencial, token ni secreto.

## Decisión (propuesta)

1. **Herramienta de CI: GitHub Actions.** El repositorio, los PR y la integración con GitHub viven en GitHub; Actions permite exigir checks en los PR sin infraestructura adicional. La decisión es solo de CI y es agnóstica del hosting: no fija proveedor de producción ni contradice el ADR 0012.

2. **Un único workflow de CI** (`.github/workflows/ci.yml`, que solo se creará cuando se apruebe este ADR) con estos jobs:

   | Job | Contenido |
   | --- | --- |
   | `quality` | `corepack enable` + `pnpm install --frozen-lockfile`; `pnpm db:generate`; `pnpm --filter @gestor-semilleros/backend db:validate`; `pnpm typecheck`; `pnpm test`; `pnpm build`. `DATABASE_URL` ficticio, solo para `prisma generate` (no se conecta a ninguna base). |
   | `e2e-api` | Service container `postgres:18.6-alpine` con `TEST_DATABASE_URL` apuntando a una base terminada en `_test`; `pnpm --filter @gestor-semilleros/backend test:e2e`. Las migraciones se aplican en el `globalSetup` de la suite. |
   | `e2e-web` | Services `postgres:18.6-alpine` y `rustfs/rustfs:1.0.4` (puerto 9000); compilación previa del backend; `playwright install --with-deps chromium` con caché; `pnpm --filter @gestor-semilleros/web test:e2e`; traces como artefacto si falla. |
   | `docker` | Matriz `backend`/`web`: build de cada Dockerfile sin `push`, con caché de buildx `type=gha`, y escaneo con Trivy (bloqueante para `CRITICAL` sin corrección disponible). |
   | `audit` | `pnpm audit --prod --audit-level=high`, informativo al inicio (`continue-on-error`) mientras se resuelven los avisos transitivos con aprobación. |
   | `ci-ok` | Job de gate con `if: always()` y `needs: [quality, e2e-api, e2e-web, docker]`; falla si cualquiera de ellos falla o se cancela. Es el **único check requerido** en la protección de ramas. `audit` queda fuera del gate mientras sea informativo. |

   Las suites E2E usan secretos **sintéticos** definidos en el código y transportes de registro: no necesitan secretos reales ni contactan con proveedores externos.

3. **Disparadores y concurrencia:** `pull_request` hacia `develop` y `master`; `push` a `develop` y `master`; `workflow_dispatch` para relanzar. `concurrency` agrupada por workflow y ref, con `cancel-in-progress` solo en PR. Si se añaden `paths-ignore` para documentación en los jobs pesados, `ci-ok` debe seguir ejecutándose siempre para no dejar checks pendientes.

4. **Caché, versiones y variables:** caché del store de pnpm con clave basada en `pnpm-lock.yaml`, de `.turbo/cache` por SHA con `restore-keys`, de Playwright por la versión fijada (1.65.0) y de buildx con `type=gha`. Se fija `turbo` a una versión exacta —la que resuelve hoy el lockfile, 2.11.10— en sustitución de `latest` (requiere la aprobación indicada en AGENTS.md §4). Se declara `passThroughEnv: ["TEST_DATABASE_URL"]` en la tarea `test:e2e` de `turbo.json`; las invocaciones de los jobs E2E se hacen por filtro de paquete para no depender del modo de entorno de Turbo. Las acciones se fijan por SHA (no por etiqueta `@vN`); los SHAs concretos se resuelven y aprueban al implementar el workflow.

5. **Permisos mínimos:** `permissions: contents: read` por defecto en el workflow; solo se elevan los permisos que un job necesite (`security-events: write` para CodeQL; `packages: write` en su caso para publicar imágenes). Ningún secreto de runtime de la aplicación se copia a GitHub: los checks no lo necesitan.

6. **Protección de ramas** (se configura en GitHub, no en el repo): `master` exige PR, al menos una revisión, rama actualizada y el check `ci-ok`; `develop` exige PR, rama actualizada y `ci-ok`. Queda prohibido el push directo. El flujo de release es PR de `develop` a `master`. Hoy ninguna de las dos está protegida.

7. **Encaje del ADR 0019:** cuando se apruebe, los pasos `format:check` y `lint` se añaden al job `quality`, siempre después de `db:generate` (el lint con tipos necesita el cliente de Prisma). Mientras el ADR 0019 siga propuesto, `pnpm lint` es un no-op y no se incluye como check; este ADR no instala ESLint, Prettier ni ninguna otra herramienta.

8. **Política de seguridad:** Dependabot semanal para npm/pnpm, Docker y GitHub Actions; CodeQL con *default setup* para `javascript-typescript`; secret scanning con push protection activado; `pnpm audit` informativo y Trivy sobre las imágenes; acciones fijadas por SHA y permisos mínimos. El hallazgo de seguridad mencionado en el contexto se atiende por su propio cauce: no se guarda ni se imprime material sensible en el repositorio.

9. **Entrega continua: fase futura, hosts sin decidir.** El destino definitivo de producción **está sin decidir**. El [ADR 0012](0012-despliegue-con-contenedores.md) (`compose.prod.yaml` en un VPS) permanece como alternativa y no se descarta aquí. La recomendación para cuando se elija el host es construir las imágenes **una sola vez** en la CI, publicarlas en GHCR y promover el mismo *digest* probado, en lugar de reconstruir en el destino; ese camino es portable a VPS u otro proveedor. Su diseño (credenciales de registro, aprobación manual, migraciones, rollback, copias de seguridad, dominio y HTTPS) se decide en un **ADR posterior de hosting/CD**; este documento no lo implementa ni fija secretos para él.

10. **Railway solo como despliegue temporal actual:** mientras exista, activar su opción *Wait for CI* y separar `development` (desde `develop`) de `production` (desde `master`) puede ser una **mejora transitoria opcional**, no una pieza central del pipeline ni un check requerido. El gate `ci-ok` de GitHub es la condición de calidad; la CI funciona igual si Railway desaparece o se sustituye.

## Alternativas consideradas

- **GitLab CI:** se descarta. Exigiría espejo del repositorio, sus checks no llegarían de forma nativa a los PR de GitHub y el plan gratuito de runners compartidos es limitado.
- **Solo Railway (CD nativo sin CI externa):** se descarta. Construye y despliega, pero no ejecuta las pruebas unitarias, E2E, auditoría ni escaneo; además hoy despliega sin esperar checks y `develop` publica en producción.
- **VPS con SSH y `compose.prod.yaml` (ADR 0012):** no se descarta ni se adopta ahora. Es coherente con el ADR 0012, pero obliga a definir HTTPS, dominio, copias de seguridad y monitorización, y requiere una decisión de hosting en un ADR posterior. Las claves, si se llega a usar SSH, vivirían solo en secretos de GitHub o en un entorno protegido.

## Consecuencias

- Todo PR a `develop` o `master` pasa por los mismos checks antes de poder fusionarse; el estado de `ci-ok` es verificable en cada commit.
- La ejecución completa añade varios minutos por PR (los E2E dominan el tiempo); los jobs corren en paralelo y se mitiga con cachés.
- Hay que configurar la protección de ramas y las herramientas de seguridad en GitHub, y obtener aprobación para fijar `turbo` y los SHAs de las acciones antes de implementar el workflow.
- La decisión de CI no resuelve el hosting: Railway sigue siendo un despliegue temporal, con los riesgos de publicar `develop` en producción y de no esperar a la CI, hasta que se apruebe el ADR de hosting/CD.
- No se crea `.github/`, no se instalan dependencias y no se toca la configuración de despliegue mientras este ADR esté propuesto.

## Riesgos

- **E2E lentos o inestables:** Playwright con `workers: 1` y la API en `--runInBand` alargan el gate; puede haber que ajustar timeouts o estabilizar pruebas antes de exigirlos.
- **Turborepo `latest`:** cambiar el comportamiento de la caché o del modo de entorno; se mitiga fijando la versión exacta y declarando `passThroughEnv`.
- **Falsos positivos:** Trivy y `pnpm audit` pueden bloquear por avisos transitivos; `audit` empieza informativo y Trivy se limita a `CRITICAL` sin corrección.
- **ADR 0019 no aprobado:** `lint` y `format:check` aún no existen como comprobaciones reales; no se pueden exigir en la CI.
- **Tamaño de la imagen del backend:** ~989 MB en frío (frente a ~94 MB de la web); conviene investigarlo antes de publicarla en un registro.
- **Visibilidad del repositorio:** hoy es público; si pasa a privado cambian el coste de Actions y la disponibilidad de CodeQL y secret scanning.
- **Hosting pendiente:** mientras no se decida, no hay CD portable ni respuesta definitiva para migraciones, rollback, backups, dominio o HTTPS.

## Estrategia de adopción gradual

1. **Aprobación:** aprobar este ADR y la fijación de `turbo` a 2.11.10. La rotación de la credencial expuesta y el resto del incidente de seguridad se gestionan aparte; no son parte de este ADR.
2. **CI mínima:** job `quality`, job `ci-ok` y protección de `develop` y `master`.
3. **E2E:** jobs `e2e-api` y `e2e-web` con Postgres y RustFS como services y `passThroughEnv` declarado.
4. **Seguridad:** Dependabot, CodeQL, secret scanning y push protection, `pnpm audit` informativo, Trivy y acciones fijadas por SHA.
5. **Lint y formato:** solo cuando se apruebe el ADR 0019; primero sin bloquear y después como checks del job `quality`.
6. **Transitorio mientras exista Railway:** valorar *Wait for CI* y la separación de entornos por rama, sin convertirlos en dependencia de la CI.
7. **ADR posterior de CD/hosting:** decidir el destino definitivo y, sobre esa decisión, publicar imágenes en GHCR y promover por *digest*; el ADR 0012 permanece como alternativa.

Este ADR queda **propuesto** hasta que el dueño lo apruebe; mientras tanto no se crean workflows, no se protegen ramas, no se instalan herramientas y no se modifica ningún despliegue.
