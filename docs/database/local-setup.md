# Base de datos local

Guía para levantar PostgreSQL y aplicar el esquema de Prisma en cualquier equipo (Linux, macOS o Windows con WSL2).

## Requisitos

| Herramienta | Versión | Notas |
| --- | --- | --- |
| Node.js | 24 LTS (`.nvmrc`) | Con `nvm`: `nvm use` |
| pnpm | 12.18.0 (`packageManager`) | Se activa con Corepack, incluido en Node 24 |
| Docker + Docker Compose | Compose v2 o superior | Ejecuta PostgreSQL 18.6 |

No hace falta instalar PostgreSQL ni Prisma de forma global.

## Primera instalación

Ejecuta los comandos desde la raíz del repositorio:

```bash
# 1. Activar pnpm en la versión del proyecto (una vez por equipo)
corepack enable

# 2. Instalar dependencias (incluye Prisma 7.10.1)
pnpm install

# 3. Crear la configuración local
cp apps/backend/.env.example apps/backend/.env
# Opcional, solo para cambiar el usuario, la contraseña o el puerto de PostgreSQL:
# cp docker/.env.example docker/.env   (y ajusta DATABASE_URL en apps/backend/.env)

# 4. Levantar PostgreSQL y esperar a que esté listo
pnpm db:up

# 5. Aplicar las migraciones y generar el cliente de Prisma
pnpm db:migrate
```

> Si `corepack enable` pide permisos de administrador, usa `corepack pnpm <comando>` en su lugar.

## Comandos

**Desde la raíz:**

| Comando | Qué hace |
| --- | --- |
| `pnpm db:up` | Inicia el contenedor de PostgreSQL y espera a que esté sano |
| `pnpm db:down` | Detiene el contenedor y **conserva** los datos |
| `pnpm db:logs` | Muestra los registros de PostgreSQL |
| `pnpm db:migrate` | Aplica las migraciones pendientes (`prisma migrate dev`) y regenera el cliente |
| `pnpm db:generate` | Regenera el cliente de Prisma en `apps/backend/src/generated/prisma` |
| `pnpm db:studio` | Abre Prisma Studio para explorar los datos |

**Desde `apps/backend`**, o con `pnpm --filter @gestor-semilleros/backend <script>`:

| Script | Qué hace |
| --- | --- |
| `db:validate` | Valida `schema.prisma` |
| `db:format` | Formatea `schema.prisma` |
| `db:status` | Muestra el estado de las migraciones |
| `db:deploy` | Aplica las migraciones sin crear ninguna nueva (entornos no interactivos) |
| `db:reset` | ⚠️ **Borra la base de datos local** y vuelve a aplicar todas las migraciones |

## Cambiar el esquema

1. Edita `apps/backend/prisma/schema.prisma` y actualiza `docs/database/data-model.md`.
2. Crea la migración: `pnpm --filter @gestor-semilleros/backend exec prisma migrate dev --name <descripcion>`.
3. Si necesitas restricciones que Prisma no puede expresar (CHECK o índices únicos parciales), crea la migración con `--create-only`, añade el SQL al final de `migration.sql` y luego aplícala con `pnpm db:migrate`.
4. **Nunca** edites una migración que ya está versionada; crea una nueva.

> Las restricciones personalizadas de la migración inicial están en `apps/backend/prisma/migrations/*_init/migration.sql`, sección *Restricciones no expresables en schema.prisma*. Se comprobó que Prisma no las marca como drift.

## Archivos implicados

| Archivo | Propósito |
| --- | --- |
| `docker/compose.yaml` | Servicio `postgres` (imagen `postgres:18.6-alpine`, volumen persistente) |
| `docker/.env.example` | Variables opcionales del contenedor |
| `apps/backend/.env.example` | Plantilla de `DATABASE_URL` |
| `apps/backend/prisma.config.ts` | Configuración de Prisma CLI: rutas y URL de la base de datos |
| `apps/backend/prisma/schema.prisma` | Esquema de datos |
| `apps/backend/prisma/migrations/` | Migraciones versionadas |

## Backend y pruebas

```bash
# AUTH_SECRET es obligatorio en apps/backend/.env (mínimo 32 caracteres):
openssl rand -base64 32

pnpm dev        # backend en http://localhost:3000 (API bajo /api)
pnpm test       # pruebas unitarias
pnpm test:e2e   # pruebas de la API; usa TEST_DATABASE_URL (semilleros_test) y la vacía en cada prueba
```

La base de pruebas se crea y se migra automáticamente. Su nombre **debe** terminar en `_test`; si no, las pruebas se niegan a ejecutarse.

## Problemas frecuentes

| Síntoma | Solución |
| --- | --- |
| `port is already allocated` al ejecutar `db:up` | Otro PostgreSQL usa el puerto 5432. Define `POSTGRES_PORT` en `docker/.env` y ajusta `DATABASE_URL`. |
| `ERR_PNPM_IGNORED_BUILDS` | Los scripts de Prisma ya están autorizados en `pnpm-workspace.yaml` (`allowBuilds`). Comprueba que usas pnpm 12.18.0. |
| `Environment variable not found: DATABASE_URL` o `Falta la variable de entorno AUTH_SECRET` | Falta `apps/backend/.env` o está incompleto. Repite el paso 3. |
| `Unable to find package manager binary` al usar Turborepo | `pnpm` no está en el PATH: ejecuta `corepack enable`. |
| Quiero empezar de cero | `docker compose -f docker/compose.yaml down -v` elimina el volumen. ⚠️ **Borra todos los datos locales.** |

Las credenciales de las plantillas son solo para desarrollo local. Nunca uses estos valores en otros entornos ni versiones archivos `.env`.
