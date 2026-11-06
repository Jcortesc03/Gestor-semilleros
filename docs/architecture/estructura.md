# Estructura del proyecto

> **Estado:** estructura inicial de carpetas, sin código fuente. Los archivos `.gitkeep` solo preservan los directorios vacíos en Git.

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
│   │   ├── prisma/
│   │   │   └── migrations/         # Migraciones de Prisma
│   │   └── src/
│   │       ├── common/             # Código transversal
│   │       │   ├── decorators/
│   │       │   ├── filters/
│   │       │   ├── guards/
│   │       │   ├── interceptors/
│   │       │   ├── pipes/
│   │       │   └── utils/
│   │       ├── config/             # Configuración y validación de entorno
│   │       ├── database/           # PrismaService y utilidades de datos
│   │       └── modules/            # Módulos de dominio
│   │           ├── auth/           # Autenticación y autorización (Auth.js)
│   │           ├── users/          # Integrantes, tutores y decanos
│   │           ├── faculties/      # Facultades
│   │           ├── semilleros/     # Semilleros de investigación
│   │           ├── meetings/       # Reuniones
│   │           ├── documents/      # Gestión documental (S3)
│   │           ├── tasks/          # Tareas, Kanban y estados
│   │           ├── reminders/      # Recordatorios
│   │           ├── notifications/  # WhatsApp y correo electrónico
│   │           ├── tracking/       # Seguimiento y progreso
│   │           ├── reports/        # Reportes
│   │           ├── dashboard/      # Indicadores y panel de control
│   │           ├── integrations/   # Microsoft Teams y otros servicios
│   │           └── ai/             # Análisis y seguimiento con IA
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
├── docs/
│   ├── architecture/               # Arquitectura y esta guía
│   ├── api/                        # Documentación de la API
│   └── decisions/                  # ADRs
├── scripts/                        # Automatizaciones del monorepo
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

## Pendiente de definición

- Gestor de paquetes y herramienta del monorepo.
- Versiones de Node.js, PostgreSQL y Prisma.
- Contenido de los Dockerfiles y archivos Compose.
- Framework de pruebas y pipeline de CI/CD.
