# AGENTS.md

Guía operativa para agentes de IA que trabajen en el **Gestor de Semilleros Universitarios**. Define cómo trabajar y qué restricciones respetar; el alcance funcional está en [`README.md`](README.md) y los detalles técnicos en [`docs/`](docs/).

## 1. Propósito y contexto

Plataforma para centralizar la gestión académica, administrativa y organizativa de los semilleros de investigación de una universidad.

Monorepo TypeScript con tres entregables:

- `apps/web` — aplicación web (React).
- `apps/mobile` — aplicación móvil (React Native).
- `apps/backend` — API y lógica de negocio (NestJS).

El alcance, los módulos y el estado se documentan en `README.md`; no los repitas aquí.

## 2. Estado actual del proyecto

- **Fase inicial de implementación:** el backend NestJS incluye autenticación, usuarios y los módulos incorporados desde `Tableros`; la integración está en verificación. La web React tiene inicio de sesión (correo y Google) y vistas de los módulos existentes; los paneles distintos por rol siguen pendientes. Móvil sigue pendiente.
- **Definido:** stack, versiones base, estructura del monorepo, workspace (pnpm + Turborepo) y scripts raíz.
- **Implementado:** esquema de datos y migraciones, PostgreSQL local con Docker Compose ([ADR 0001](docs/decisions/0001-modelo-de-datos-y-entorno-local.md)), y en el backend `PrismaService`, inicio de sesión con Auth.js (correo + contraseña y Google), `SessionGuard`, `GET /api/me` y pruebas ([ADR 0002](docs/decisions/0002-autenticacion-y-pruebas.md)); alta de usuarios `POST /api/users` con `RolesGuard` ([ADR 0003](docs/decisions/0003-alta-de-usuarios.md)); el script `admin:create` y la seed de desarrollo (`db:seed`).
- **Instalado:** dependencias de Turborepo y del backend (`pnpm-lock.yaml` versionado).
- **Implementado también:** proyectos y participantes, tableros y actividades (encargados, aprobación, enlaces adjuntos) con permisos por proyecto ([ADR 0004](docs/decisions/0004-proyectos-tableros-actividades.md); API en `docs/api/projects.md` y `docs/api/boards.md`); novedades y notificaciones con copias por correo (SMTP) y WhatsApp (BuilderBot + Baileys, [ADR 0006](docs/decisions/0006-whatsapp-con-builderbot.md)) según las preferencias de cada usuario ([ADR 0005](docs/decisions/0005-notificaciones-y-copias-externas.md)); reuniones con Microsoft Teams (vinculación de cuentas con OAuth + PKCE, agenda en el calendario, estados y avisos programados; [ADR 0007](docs/decisions/0007-reuniones-con-microsoft-teams.md)).
- **Web ([ADR 0008](docs/decisions/0008-aplicacion-web-y-sistema-visual.md)):** React + Vite + Tailwind y Montserrat local. Login (correo y Google), paneles por rol, proyectos, tableros, reuniones, novedades y preferencias contra la API real; ver [`apps/web/README.md`](apps/web/README.md) y [el relevo](docs/handoffs/2026-11-07-frontend.md). Sin datos simulados ni permisos inventados.
- **Directorio, catálogos y panel ([ADR 0009](docs/decisions/0009-directorio-catalogos-y-paneles.md)):** `GET /api/users` (Admin, Decano, Tutor), `GET /api/areas`, `GET /api/faculties` y `GET /api/dashboard` (una sección por rol; el encargado de área ve sus áreas asignadas).
- **Reglas de dominio resueltas ([ADR 0010](docs/decisions/0010-reglas-pendientes-resueltas.md)):** administración de áreas, facultades, encargados y decanos; encargado de área con los permisos del decano en sus áreas; aprobación solo en `DONE`; límites del tutor; responsables de tablero; publicación de novedades por rol.
- **Gestión de usuarios ([ADR 0011](docs/decisions/0011-gestion-de-usuarios.md)):** editar, desactivar y reactivar usuarios, contraseña temporal con cambio obligatorio, cambio de la contraseña propia y política de contraseñas (10–256, letra y número, distinta del correo). Migración `users_must_change_password`.
- **Despliegue con contenedores ([ADR 0012](docs/decisions/0012-despliegue-con-contenedores.md)):** `apps/backend/Dockerfile` (node:24-alpine, migra al arrancar), `apps/web/Dockerfile` (nginx:1.29-alpine con proxy de `/api`) y `docker/compose.prod.yaml`. Guías por modo en `apps/backend/README.md` y `apps/web/README.md`.
- **Documentos en S3 ([ADR 0013](docs/decisions/0013-documentos-en-s3.md)):** subida y descarga mediadas por el backend, 25 MB con validación de firma, adjuntos de documentos en actividades; RustFS como S3 local.
- **Cuentas personales de Microsoft ([ADR 0014](docs/decisions/0014-cuentas-personales-de-microsoft.md)):** `MICROSOFT_TENANT_ID=common` por defecto; con cuenta personal el organizador indica el enlace de la reunión (`joinUrl`). Migración `microsoft_account_type`.
- **Adjuntos en noticias ([ADR 0015](docs/decisions/0015-adjuntos-en-noticias.md)):** hasta 5 archivos por noticia (`NEWS`) en S3, tabla `announcement_attachments`; publicación multipart en una sola petición.
- **Analítica ([ADR 0016](docs/decisions/0016-modulo-de-analitica.md)):** `GET /api/analytics` y `/filters` (ADMIN global; encargado de área y decano por alcance) con filtros de periodo, área, facultad, proyecto, tutor y estado; `completed_at` en tableros y actividades para medir entregas a tiempo (migración `completed_at`); vista web con gráficas SVG propias. Sin entidad carrera.
- **Paginación ([ADR 0017](docs/decisions/0017-paginacion-de-listas.md)):** híbrida. En el servidor (`page`, `pageSize` 1–100, respuesta `{ items, total, page, pageSize }`): proyectos (con `search`), usuarios, reuniones, novedades y documentos del proyecto. En el cliente (`useClientPagination` + `Pagination`): miembros, tableros, actividades, entregas y tablas de la analítica. En la analítica el decano solo ve su facultad en proyectos compartidos.
- **No implementado:** recordatorios, recuperación de contraseña olvidada, límite de intentos de inicio de sesión, autenticación móvil, HTTPS/infraestructura de producción concreta ni CI/CD.

Por lo tanto:

- No asumas dependencias, versiones, comandos ni configuraciones no confirmadas.
- No presentes funcionalidades planificadas como disponibles.
- No ejecutes scaffolding, instalaciones ni inicializaciones sin autorización explícita.
- Ante una decisión pendiente, detente y pregunta (§12).

## 3. Fuentes de verdad

| Documento | Propósito |
| --- | --- |
| `README.md` | Alcance funcional, estado y visión para personas |
| `AGENTS.md` | Reglas operativas para agentes |
| `docs/architecture/` | Arquitectura y estructura del monorepo |
| `docs/domain/` | Dominio del negocio: entidades, glosario, reglas, permisos y flujos |
| `docs/database/` | Modelo de datos, decisiones de diseño y guía de base de datos local |
| `apps/backend/prisma/schema.prisma` | Fuente de verdad técnica del esquema de datos |
| `docs/api/` | Contratos de API (por ahora, autenticación) |
| `docs/decisions/` | Decisiones técnicas (ADR) |

Si dos fuentes se contradicen, **detente y reporta**; no elijas una por tu cuenta.

## 4. Stack y decisiones aprobadas

| Área | Decisión |
| --- | --- |
| Lenguaje | TypeScript |
| Organización | Monorepo |
| Gestor de paquetes | pnpm |
| Orquestador | Turborepo |
| Web | React |
| Móvil | React Native |
| Backend | NestJS |
| Base de datos | PostgreSQL |
| ORM | Prisma |
| Documentos e imágenes | AWS S3 |
| Autenticación y autorización | Auth.js |
| Contenedores | Docker |
| Arquitectura | MVC + monolito modular |

**Versiones fijadas** ([ADR 0001](docs/decisions/0001-modelo-de-datos-y-entorno-local.md)): Node.js 24 LTS (`.nvmrc`), pnpm 12.18.0 (`packageManager`, vía Corepack), Prisma 7.10.1 (con `@prisma/adapter-pg`) y PostgreSQL 18.6 (`postgres:18.6-alpine`). Backend y pruebas ([ADR 0002](docs/decisions/0002-autenticacion-y-pruebas.md)): NestJS 12.3.3, TypeScript 6.0.3, `@auth/express` 0.12.3, Argon2id (`@node-rs/argon2`), Jest 30 + ts-jest + Supertest. Correo ([ADR 0005](docs/decisions/0005-notificaciones-y-copias-externas.md)): nodemailer 10.3.1 (SMTP); WhatsApp con BuilderBot 1.4.4 (`@builderbot/bot`, `@builderbot/provider-baileys`) y provider intercambiable, inicialmente Baileys ([ADR 0006](docs/decisions/0006-whatsapp-con-builderbot.md)).

**Web aprobada** ([ADR 0008](docs/decisions/0008-aplicacion-web-y-sistema-visual.md)): React/React DOM 19.3.1, Vite 8.3.6, Tailwind CSS y `@tailwindcss/vite` 4.3.4, `@vitejs/plugin-react` 6.2.1, Montserrat local (`@fontsource/montserrat` 5.3.0) e iconos `lucide-react` 1.68.0. Sin biblioteca de componentes, router ni estado global adicional. Pruebas: runner de Node 24 (adaptadores), Vitest 5.1.0 + Testing Library (componentes) y Playwright 1.65.0 (E2E). Frontlipe implementa las vistas y la guía específica del proyecto prevalece sobre preferencias visuales genéricas.

**Contenedores** ([ADR 0012](docs/decisions/0012-despliegue-con-contenedores.md)): `node:24-alpine` y `nginx:1.29-alpine`.

**Documentos** ([ADR 0013](docs/decisions/0013-documentos-en-s3.md)): `@aws-sdk/client-s3` 3.1164.0 y `@types/multer` 2.3.0; S3 compatible local con RustFS 1.0.4 (`rustfs/rustfs:1.0.4`) en `docker/compose.yaml`.

**Pendiente de definición:** versión de Turborepo (`latest`, fijada solo por el lockfile), linting y formato, CI/CD, infraestructura de producción concreta (HTTPS, dominio, copias de seguridad), contratos de API de los demás módulos, autenticación móvil, permisos por rol y preguntas abiertas del dominio (`docs/domain/business-rules.md`).

No fijes versiones ni agregues herramientas para cubrir estos pendientes sin aprobación.

## 5. Reglas de oro

1. **No inventar:** ni versiones, ni dependencias, ni scripts, ni rutas, ni contratos, ni datos.
2. **No adelantar implementación:** limitar los cambios a las entregas autorizadas; los módulos pendientes no se implementan por inferencia.
3. **Cambios mínimos:** no refactorices fuera del alcance solicitado.
4. **Sin secretos:** nunca credenciales, tokens, `.env` reales ni datos personales.
5. **Preguntar antes de asumir:** ante ambigüedad técnica o funcional, detente.
6. **Registrar decisiones:** toda elección técnica relevante va a `docs/decisions/` y actualiza el stack.
7. **Documentación sincronizada:** si cambia el alcance, la estructura o los comandos, actualiza README/AGENTS/docs.

## 6. Arquitectura y estructura del monorepo

Backend como **monolito modularizado**: un solo despliegue, dividido en módulos por dominio.

```text
.
├── apps/
│   ├── backend/   # NestJS + Prisma, módulos por dominio
│   ├── web/       # React
│   └── mobile/    # React Native
├── packages/      # types, validation, utils
├── docs/          # arquitectura, dominio, API, ADRs
├── docker/        # configuración de contenedores
├── scripts/       # automatizaciones
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

Detalle completo: [`docs/architecture/estructura.md`](docs/architecture/estructura.md).

**Dependencias**

- `apps/*` puede importar `packages/*`; lo contrario no.
- Cada módulo del backend encapsula `controllers/`, `services/`, `dtos/` y `models/`.
- Un módulo no importa archivos internos de otro ni accede a su persistencia.
- El código compartido vive en `packages/`; evita duplicarlo entre web, móvil y backend.

**Reglas accionables**

- La lógica de negocio no vive en componentes de UI ni en controladores de transporte.
- **Prisma** es el único acceso a PostgreSQL.
- Web y móvil no acceden directamente a PostgreSQL ni a S3.
- Binarios en S3; metadatos en PostgreSQL.
- **Auth.js** es el único mecanismo de autenticación; no crear alternativas.
- No agregar tecnologías o dependencias sin aprobación.

## 7. Convenciones de implementación

### Generales

- TypeScript estricto; evitar `any` sin justificación.
- Documentación, interfaz y mensajes al usuario en español; identificadores en inglés (salvo términos del dominio acordados).
- Validar datos en los límites del sistema.
- Commits con **Conventional Commits**.
- Linting y formato: herramientas **pendientes**; no imponerlas. Las pruebas aprobadas son Jest en backend y, en web, el runner de Node 24, Vitest + Testing Library y Playwright.

### Backend

- Un módulo por dominio, con controladores delgados y lógica en servicios.
- DTOs para contratos de entrada/salida; no exponer modelos de persistencia.
- Acceso a datos mediante `PrismaService` (`src/database/`).
- Esquema y migraciones de Prisma versionados; no modificarlos sin necesidad.

### Web y móvil

- Componentes funcionales y hooks cuando corresponda.
- Separar la UI de la capa de acceso a la API.
- Reutilizar tipos y validaciones de `packages/`.
- Estados de carga, error y vacío explícitos.

### Dependencias

- Usar **pnpm** exclusivamente; no npm ni yarn.
- Dependencias internas con `workspace:*`.
- Los scripts raíz delegan en Turborepo; no dupliques lógica.
- No agregar dependencias, plugins ni herramientas sin aprobación.

## 8. Comandos y ejecución

El workspace contiene `@gestor-semilleros/backend` y la primera entrega de `@gestor-semilleros/web`. Requiere `pnpm` en el PATH (`corepack enable`) para que Turborepo funcione. Guías: [`docs/database/local-setup.md`](docs/database/local-setup.md) y [`apps/web/README.md`](apps/web/README.md).

| Comando | Estado |
| --- | --- |
| `pnpm install` | ✅ Funcional; instala Turborepo y Prisma. |
| `pnpm db:up` / `db:down` / `db:logs` | ✅ PostgreSQL y S3 local (RustFS, API en 9000 y consola en 9001) con `docker/compose.yaml`. |
| `pnpm db:migrate` / `db:generate` / `db:studio` | ✅ Delegan en `apps/backend` (Prisma). |
| `db:validate`, `db:format`, `db:status`, `db:deploy`, `db:reset` | ✅ Scripts de `apps/backend`. `db:reset` borra los datos locales: requiere confirmación. |
| `pnpm dev`, `pnpm build`, `pnpm typecheck` | Backend y web mediante Turborepo; el backend requiere `apps/backend/.env`. La integración de Tableros se verifica por separado en `odd/tasks/web-application.md`. |
| `pnpm test` | Pruebas sin base de datos: Jest en backend; Node + Vitest en web. |
| `pnpm --filter @gestor-semilleros/web test:e2e` | Playwright contra el backend real y la base aislada `semilleros_web_e2e_test` (requiere `pnpm db:up`; usa los puertos 3100/5174, compatibles con `pnpm dev`). |
| `pnpm --filter @gestor-semilleros/web dev` | Vite en `127.0.0.1:5173`; proxy `/api` al backend local en el puerto 3000. |
| `pnpm --filter @gestor-semilleros/backend admin:create` | ✅ Crea un administrador (`ADMIN_EMAIL`, `ADMIN_FULL_NAME`, `ADMIN_PASSWORD`). |
| `pnpm db:seed` | ✅ Siembra datos de **desarrollo** (`src/cli/seed.ts`): un usuario por tipo (`admin@example.test`, `encargado.area@`, `decano@`, `tutor@`, `lider@`, `estudiante@`), área, facultad y un proyecto demo. Requiere `SEED_PASSWORD` (política del ADR 0011: 10–256, letra y número), es idempotente y se niega a correr con `NODE_ENV=production`. Ej.: `SEED_PASSWORD='…' pnpm db:seed` (fish: anteponer `env`). |
| `pnpm db:seed:bulk` | ✅ Seed masiva de **desarrollo** (`src/cli/seed-bulk.ts`): miles de usuarios, proyectos, actividades, adjuntos y reuniones ficticios (`@semillero.example.test`, sufijo ` · demo`) para la analítica. Requiere `SEED_PASSWORD`; `SEED_BULK_SCALE` (1–10) y `SEED_BULK_RESET=1` (borra solo esos datos). No corre en producción; los documentos no tienen archivo en S3. |
| `pnpm test:e2e` | ✅ Pruebas de la API contra `TEST_DATABASE_URL` (requiere `pnpm db:up`). |
| `pnpm lint` | Configurado; ningún paquete lo implementa (herramienta pendiente). |
| `docker compose -f docker/compose.prod.yaml --env-file docker/.env.prod up -d --build` | ✅ Despliegue completo (PostgreSQL + backend + web nginx) en `WEB_PORT` (8080). Plantilla: `docker/env.prod.example`. |

Reglas:

- No presentes comandos como funcionales si aún no producen resultados.
- No ejecutes instalaciones ni agregues dependencias sin autorización.
- No inventes scripts: deben existir en un `package.json`.
- No ejecutes comandos destructivos (`rm -rf`, resets, limpiezas de historial) sin confirmación.

## 9. Flujo de trabajo para agentes

**OpenCode (solo este proyecto):** `opencode.json` mantiene `gentle-orchestrator` con `openai/gpt-6.1-sol` como agente principal y registra diez subagentes `free-*`, uno por modelo gratuito disponible al configurarlos. El orquestador delega tareas acotadas en sesiones hijas cuando corresponde; no es necesario ejecutar todos los modelos en cada solicitud. La gratuidad y disponibilidad de los subagentes dependen del proveedor y no se extienden al modelo del orquestador. No se modifica la configuración global.

1. Leer `AGENTS.md`, `README.md` y la documentación relevante.
2. Verificar el estado real (`git status`, árbol, archivos existentes).
3. Clasificar la tarea: documentación, decisión técnica o implementación.
4. Identificar decisiones pendientes (§4 y §12).
5. Detenerse y preguntar si corresponde.
6. Planificar el cambio mínimo y avisarlo si afecta varios archivos.
7. Implementar únicamente lo solicitado.
8. Verificar según las herramientas disponibles.
9. Actualizar la documentación o el ADR afectados.
10. Reportar cambios, pendientes y supuestos.

## 10. Seguridad y privacidad

- No versionar `.env`, credenciales, tokens ni cadenas de conexión.
- Configurar secretos por entorno; nunca en el código.
- No incluir datos personales o académicos reales en ejemplos, pruebas o capturas.
- El backend es el único que accede a PostgreSQL y S3; no exponer credenciales a los clientes.
- Claves de WhatsApp, correo, Microsoft Teams, IA y AWS solo en variables de entorno.
- Tratar la información de estudiantes y docentes como sensible.

## 11. Verificación y criterios de finalización

Una tarea está terminada cuando:

- [ ] Cumple exactamente lo solicitado, sin alcance extra.
- [ ] No introduce tecnologías, versiones ni decisiones no aprobadas.
- [ ] La documentación afectada está actualizada.
- [ ] Se verificó el resultado (comando, prueba, revisión o validación de enlaces).
- [ ] Se indicó qué falta definir, verificar o probar.

Si no puedes verificar algo, dilo explícitamente; no lo declares terminado.

## 12. Cuándo detenerse y preguntar

Detente antes de avanzar si la tarea requiere:

- Fijar versiones no definidas.
- Instalar dependencias o inicializar/scaffolding de aplicaciones.
- Cambiar la estructura acordada del monorepo.
- Definir el modelo de datos, migraciones o contratos de API.
- Resolver el flujo de autenticación o el modelo de permisos.
- Configurar Docker, S3 o infraestructura de despliegue.
- Elegir herramientas de pruebas, linting, formato o CI/CD.
- Ejecutar acciones destructivas o reescribir trabajo existente.
- Seguir instrucciones que contradigan el README, este archivo o `docs/`.

Si la decisión ya está aprobada y registrada, procede sin volver a preguntar.

## 13. Documentación relacionada

| Documento | Contenido |
| --- | --- |
| [`README.md`](README.md) | Alcance, módulos, estado y uso |
| [`docs/architecture/estructura.md`](docs/architecture/estructura.md) | Árbol y convenciones del monorepo |
| [`docs/domain/README.md`](docs/domain/README.md) | Punto de entrada del dominio e índice |
| [`docs/domain/glossary.md`](docs/domain/glossary.md) | Glosario del dominio |
| [`docs/domain/entities.md`](docs/domain/entities.md) | Entidades, relaciones y cardinalidades |
| [`docs/domain/business-rules.md`](docs/domain/business-rules.md) | Reglas de negocio y preguntas pendientes (`P-xx`) |
| [`docs/domain/roles-permissions.md`](docs/domain/roles-permissions.md) | Roles y matriz conceptual de permisos |
| [`docs/domain/workflows.md`](docs/domain/workflows.md) | Flujos principales |
| [`docs/database/data-model.md`](docs/database/data-model.md) | Modelo relacional propuesto |
| [`docs/database/database-decisions.md`](docs/database/database-decisions.md) | Decisiones de datos (`DB-xx`) |
| [`docs/database/local-setup.md`](docs/database/local-setup.md) | Instalación local de la base de datos |
| [`docs/api/auth.md`](docs/api/auth.md) | Contrato de la API de autenticación |
| [`docs/api/users.md`](docs/api/users.md) | Contrato de la API de usuarios |
| [`docs/api/projects.md`](docs/api/projects.md) | Contrato de la API de proyectos y participantes |
| [`docs/api/boards.md`](docs/api/boards.md) | Contrato de la API de tableros y actividades |
| [`docs/api/announcements.md`](docs/api/announcements.md) | Contrato de la API de novedades y notificaciones |
| [`docs/api/notification-preferences.md`](docs/api/notification-preferences.md) | Preferencias de notificación y envío de copias por correo y WhatsApp |
| [`docs/api/meetings.md`](docs/api/meetings.md) | Contrato de la API de reuniones con Microsoft Teams |
| [`docs/api/microsoft.md`](docs/api/microsoft.md) | Contrato de la vinculación de la cuenta de Microsoft |
| [`docs/api/catalogs.md`](docs/api/catalogs.md) | Catálogos de áreas y facultades |
| [`docs/api/dashboard.md`](docs/api/dashboard.md) | Panel por rol |
| [`docs/api/documents.md`](docs/api/documents.md) | Documentos en S3 |
| [`docs/api/analytics.md`](docs/api/analytics.md) | Analítica con filtros |
| [`docs/decisions/0017-paginacion-de-listas.md`](docs/decisions/0017-paginacion-de-listas.md) | Contrato común de paginación |
| `docs/decisions/` | ADRs |

Antes de implementar cualquier funcionalidad del dominio (entidades, permisos, flujos o esquema de datos), consulta `docs/domain/` empezando por su `README.md`, y `docs/database/` si afecta a la persistencia. Lo marcado como 🟡 hipótesis o ❓ pendiente **no** se implementa sin confirmación. **No inventes reglas de negocio ni permisos** que sigan pendientes.

## 14. Mantenimiento de este archivo

Actualiza `AGENTS.md` cuando:

- Se apruebe una tecnología, se fije una versión o cambie la estructura.
- Existan comandos reales o cambien los existentes.
- Cambien las convenciones o el flujo de trabajo.
- Se definan reglas de negocio, permisos o contratos.

Mantén este documento operativo y compacto; mueve el detalle a `docs/`.
