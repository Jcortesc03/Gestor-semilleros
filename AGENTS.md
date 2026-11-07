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

- **Fase inicial de implementación:** el backend NestJS incluye autenticación, usuarios y los módulos incorporados desde `Tableros`; la integración está en verificación. La web React tiene inicio de sesión y panel personal; las vistas de los cinco roles están autorizadas y pendientes. Móvil sigue pendiente.
- **Definido:** stack, versiones base, estructura del monorepo, workspace (pnpm + Turborepo) y scripts raíz.
- **Implementado:** esquema de datos y migraciones, PostgreSQL local con Docker Compose ([ADR 0001](docs/decisions/0001-modelo-de-datos-y-entorno-local.md)), y en el backend `PrismaService`, inicio de sesión con Auth.js (correo + contraseña y Google), `SessionGuard`, `GET /api/me` y pruebas ([ADR 0002](docs/decisions/0002-autenticacion-y-pruebas.md)); alta de usuarios `POST /api/users` con `RolesGuard` ([ADR 0003](docs/decisions/0003-alta-de-usuarios.md)); el script `admin:create` y la seed de desarrollo (`db:seed`).
- **Instalado:** dependencias de Turborepo y del backend (`pnpm-lock.yaml` versionado).
- **Implementado también:** proyectos y participantes, tableros y actividades (encargados, aprobación, enlaces adjuntos) con permisos por proyecto ([ADR 0004](docs/decisions/0004-proyectos-tableros-actividades.md); API en `docs/api/projects.md` y `docs/api/boards.md`); novedades y notificaciones con copias por correo (SMTP) y WhatsApp (BuilderBot + Baileys, [ADR 0006](docs/decisions/0006-whatsapp-con-builderbot.md)) según las preferencias de cada usuario ([ADR 0005](docs/decisions/0005-notificaciones-y-copias-externas.md)).
- **Web ([ADR 0007](docs/decisions/0007-aplicacion-web-y-sistema-visual.md)):** React + Vite + Tailwind y Montserrat local. Login y vistas compartidas por roles en desarrollo, con defectos de carga y asincronía pendientes; no hay cinco paneles terminados. Leer [el relevo](docs/handoffs/2026-11-07-frontend.md). El usuario aclaró que su entrega es frontend: no ampliar el backend; cualquier demo debe identificarse como simulada, sin fingir persistencia real ni inventar permisos.
- **No implementado:** documentos (S3), reuniones, recordatorios, dashboards, permisos del encargado de área, resto de la gestión de usuarios, autenticación móvil, Docker de despliegue ni CI/CD.

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

**Web aprobada** ([ADR 0007](docs/decisions/0007-aplicacion-web-y-sistema-visual.md)): React/React DOM 19.3.1, Vite 8.3.6, Tailwind CSS y `@tailwindcss/vite` 4.3.4, `@vitejs/plugin-react` 6.2.1, Montserrat local (`@fontsource/montserrat` 5.3.0) e iconos `lucide-react` 1.68.0. Sin biblioteca de componentes, router ni estado global adicional. Pruebas HTTP con el runner incorporado de Node 24. Frontlipe implementa las vistas y la guía específica del proyecto prevalece sobre preferencias visuales genéricas.

**Pendiente de definición:** versión de Turborepo (`latest`, fijada solo por el lockfile), linting y formato, CI/CD, infraestructura de despliegue, contratos de API de los demás módulos, autenticación móvil, permisos por rol y preguntas abiertas del dominio (`docs/domain/business-rules.md`).

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
- Linting y formato: herramientas **pendientes**; no imponerlas. Las pruebas aprobadas son Jest en backend y el runner de Node 24 en el cliente HTTP web.

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
| `pnpm db:up` / `db:down` / `db:logs` | ✅ PostgreSQL local con `docker/compose.yaml`. |
| `pnpm db:migrate` / `db:generate` / `db:studio` | ✅ Delegan en `apps/backend` (Prisma). |
| `db:validate`, `db:format`, `db:status`, `db:deploy`, `db:reset` | ✅ Scripts de `apps/backend`. `db:reset` borra los datos locales: requiere confirmación. |
| `pnpm dev`, `pnpm build`, `pnpm typecheck` | Backend y web mediante Turborepo; el backend requiere `apps/backend/.env`. La integración de Tableros se verifica por separado en `odd/tasks/web-application.md`. |
| `pnpm test` | Pruebas sin base de datos: Jest en backend y Node en el cliente HTTP web. |
| `pnpm --filter @gestor-semilleros/web dev` | Vite en `127.0.0.1:5173`; proxy `/api` al backend local en el puerto 3000. |
| `pnpm --filter @gestor-semilleros/backend admin:create` | ✅ Crea un administrador (`ADMIN_EMAIL`, `ADMIN_FULL_NAME`, `ADMIN_PASSWORD`). |
| `pnpm db:seed` | ✅ Siembra datos de **desarrollo** (`src/cli/seed.ts`): un usuario por tipo (`admin@example.test`, `encargado.area@`, `decano@`, `tutor@`, `lider@`, `estudiante@`), área, facultad y un proyecto demo. Requiere `SEED_PASSWORD` (8–256 caracteres), es idempotente y se niega a correr con `NODE_ENV=production`. Ej.: `SEED_PASSWORD='…' pnpm db:seed` (fish: anteponer `env`). |
| `pnpm test:e2e` | ✅ Pruebas de la API contra `TEST_DATABASE_URL` (requiere `pnpm db:up`). |
| `pnpm lint` | Configurado; ningún paquete lo implementa (herramienta pendiente). |
| Docker de despliegue | **Pendiente** de configuración. |

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
| `docs/decisions/` | ADRs |

Antes de implementar cualquier funcionalidad del dominio (entidades, permisos, flujos o esquema de datos), consulta `docs/domain/` empezando por su `README.md`, y `docs/database/` si afecta a la persistencia. Lo marcado como 🟡 hipótesis o ❓ pendiente **no** se implementa sin confirmación. **No inventes reglas de negocio ni permisos** que sigan pendientes.

## 14. Mantenimiento de este archivo

Actualiza `AGENTS.md` cuando:

- Se apruebe una tecnología, se fije una versión o cambie la estructura.
- Existan comandos reales o cambien los existentes.
- Cambien las convenciones o el flujo de trabajo.
- Se definan reglas de negocio, permisos o contratos.

Mantén este documento operativo y compacto; mueve el detalle a `docs/`.
