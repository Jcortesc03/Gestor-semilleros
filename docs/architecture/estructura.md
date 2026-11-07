# Estructura del proyecto

> **Estado:** el backend tiene código inicial (autenticación y usuarios); `apps/web`, `apps/mobile` y `packages/` son solo carpetas vacías. Los archivos `.gitkeep` solo preservan los directorios vacíos en Git.

El backend se organiza como un **monolito modularizado**: un único despliegue, dividido en módulos por dominio que pueden evolucionar o extraerse a un servicio independiente si la escala lo exige.

## Principios

- **MVC:** el modelo (dominio y persistencia) y los controladores viven en el backend; las vistas son React (web) y React Native (móvil).
- **Límites de dominio:** cada módulo del backend encapsula sus controladores, servicios, DTOs y modelos. Un módulo no accede directamente a la persistencia de otro.
- **Código compartido:** lo reutilizable entre aplicaciones vive en `packages/`; lo transversal del backend, en `src/common/`.
- **Clientes delgados:** web y móvil solo consumen la API; nunca acceden a PostgreSQL ni a S3 directamente.

## Árbol

```text
.
├── apps/
│   ├── backend/                    # NestJS + Prisma
│   │   ├── .env.example            # Plantilla de variables de entorno
│   │   ├── package.json            # Scripts db:*, admin:create, test, test:e2e
│   │   ├── prisma.config.ts        # Configuración de Prisma CLI
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Esquema de datos
│   │   │   └── migrations/         # Migraciones de Prisma
│   │   └── src/
│   │       ├── main.ts             # Arranque de NestJS
│   │       ├── app.module.ts
│   │       ├── app.setup.ts        # Prefijo /api y montaje de Auth.js (compartido con pruebas)
│   │       ├── generated/prisma/   # Cliente de Prisma generado (no versionado)
│   │       ├── types/              # Declaraciones de tipos (Auth.js)
│   │       ├── cli/                # Comandos de terminal: create-admin.ts (y seed.ts, seed de desarrollo)
│   │       ├── common/             # Código transversal
│   │       │   ├── decorators/     # current-user, roles
│   │       │   ├── filters/
│   │       │   ├── guards/         # session.guard, roles.guard
│   │       │   ├── interceptors/
│   │       │   ├── pipes/
│   │       │   └── utils/
│   │       ├── config/             # Configuración y validación de entorno
│   │       ├── database/           # PrismaService y utilidades de datos
│   │       ├── modules/            # Módulos de dominio (los de abajo, salvo auth y users, solo tienen carpetas vacías)
│   │       │   ├── auth/           # Implementado: Auth.js, GET /api/me (index.ts expone su API pública)
│   │       │   ├── users/          # Implementado: POST /api/users (index.ts expone su API pública)
│   │       │   ├── faculties/      # Facultades
│   │       │   ├── semilleros/     # Semilleros de investigación
│   │       │   ├── meetings/       # Reuniones
│   │       │   ├── documents/      # Gestión documental (S3)
│   │       │   ├── tasks/          # Tareas, Kanban y estados
│   │       │   ├── reminders/      # Recordatorios
│   │       │   ├── notifications/  # WhatsApp y correo electrónico
│   │       │   ├── tracking/       # Seguimiento y progreso
│   │       │   ├── reports/        # Reportes
│   │       │   ├── dashboard/      # Indicadores y panel de control
│   │       │   ├── integrations/   # Microsoft Teams y otros servicios
│   │       │   └── ai/             # Análisis y seguimiento con IA
│   │       └── **/*.spec.ts        # Pruebas unitarias junto al código
│   │   └── test/                   # Pruebas de la API (e2e): *.e2e-spec.ts, jest-e2e.config.js, global-setup y helpers
│   ├── web/                        # React
│   │   ├── public/
│   │   └── src/
│   │       ├── assets/
│   │       ├── components/         # Componentes compartidos
│   │       ├── features/           # Funcionalidades por dominio
│   │       ├── hooks/
│   │       ├── layouts/
│   │       ├── lib/                # Cliente API y utilidades
│   │       ├── pages/
│   │       ├── routes/
│   │       ├── services/
│   │       ├── store/              # Estado global
│   │       ├── styles/
│   │       └── types/
│   └── mobile/                     # React Native
│       └── src/
│           ├── assets/
│           ├── components/
│           ├── features/
│           ├── hooks/
│           ├── navigation/
│           ├── screens/
│           ├── services/
│           ├── store/
│           ├── theme/
│           └── types/
├── packages/                       # Código compartido
│   ├── types/                      # Tipos y contratos comunes
│   ├── validation/                 # Esquemas de validación
│   └── utils/                      # Utilidades compartidas
├── docker/                         # Configuración de contenedores
│   ├── compose.yaml                # PostgreSQL local
│   └── .env.example
├── docs/
│   ├── architecture/               # Arquitectura y esta guía
│   ├── domain/                     # Dominio del negocio (independiente de la tecnología)
│   │   ├── README.md
│   │   ├── glossary.md
│   │   ├── entities.md
│   │   ├── business-rules.md
│   │   ├── roles-permissions.md
│   │   └── workflows.md
│   ├── database/                   # Modelo de datos y base de datos local
│   │   ├── data-model.md
│   │   ├── database-decisions.md
│   │   └── local-setup.md
│   ├── api/                        # Documentación de la API (auth.md, users.md)
│   └── decisions/                  # ADRs
├── scripts/                        # Automatizaciones del monorepo
├── package.json                    # Scripts raíz (delegan en Turborepo)
├── pnpm-workspace.yaml             # Workspace de pnpm
├── turbo.json                      # Tareas de Turborepo
├── .gitignore
├── README.md
└── AGENTS.md
```

## Organización interna de un módulo

Todos los módulos del backend siguen la misma estructura:

```text
modules/<dominio>/
├── controllers/   # Endpoints, validación de entrada y delegación
├── services/      # Casos de uso y reglas de negocio
├── dtos/          # Contratos de entrada y salida
└── models/        # Tipos y modelos del dominio
```

- Los **controladores** no contienen lógica de negocio.
- Los **servicios** coordinan el dominio y el acceso a datos.
- Los **DTOs** definen y validan los contratos de la API.
- Los **modelos** representan el dominio; la persistencia se define en el esquema de Prisma.
- El acceso a PostgreSQL se realiza con `PrismaService` (`src/database/`); los binarios se gestionan con AWS S3 desde el backend.

## Reglas de dependencia

```text
apps/web ─┐
          ├──> apps/backend ──> PostgreSQL (Prisma)
apps/mobile ┘             └──> AWS S3
          │
          └──> packages/*
```

- `apps/*` puede importar desde `packages/*`.
- `packages/*` no puede importar desde `apps/*`.
- Un módulo del backend no debe importar archivos internos de otro módulo.
- Las vistas (React y React Native) no importan código del backend; solo consumen su API.

## Workspace

El monorepo se gestiona con **pnpm** y **Turborepo**:

- `pnpm-workspace.yaml` define los paquetes en `apps/*` y `packages/*`.
- `turbo.json` declara las tareas `build`, `dev`, `lint`, `test`, `test:e2e`, `typecheck` y `clean`.
- Los scripts de la raíz (`package.json`) delegan en `turbo run`.
- Cada aplicación o paquete tiene su propio `package.json` con sus scripts (hoy solo existe el del backend).
- Las dependencias internas se referencian con `workspace:*`.

Comandos desde la raíz (hoy solo el backend los implementa; `lint` aún no tiene herramienta):

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm typecheck
```

## Pendiente de definición

- Versión de Turborepo (el resto está en el ADR 0001).
- Dockerfiles y Compose de despliegue (el Compose local ya existe).
- Pipeline de CI/CD y herramientas de linting y formato (las pruebas usan Jest + Supertest, ADR 0002).
