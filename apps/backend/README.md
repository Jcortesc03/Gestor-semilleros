# Backend — Gestor de Semilleros

API NestJS + Prisma + PostgreSQL con autenticación Auth.js (correo y contraseña, y Google). Expone todo bajo `/api`. Contratos en [`docs/api/`](../../docs/api/); decisiones en [`docs/decisions/`](../../docs/decisions/).

Hay tres formas de ejecutarlo:

| Modo | Para qué | Base de datos |
| --- | --- | --- |
| [1. Desarrollo](#1-desarrollo) | Programar, con recarga automática | PostgreSQL en Docker (`pnpm db:up`) |
| [2. Producción sin Docker](#2-producción-sin-docker) | Servidor con Node 24 instalado | La que indique `DATABASE_URL` |
| [3. Producción con Docker](#3-producción-con-docker) | Despliegue completo (base de datos + API + web) | Contenedor `postgres` interno |

Todos los comandos se ejecutan desde la **raíz del repositorio**, salvo que se indique otra cosa.

## Requisitos

- **Node.js 24** (`.nvmrc`) y **pnpm 12.18.0** mediante Corepack: `corepack enable`. Si no quieres activarlo globalmente, antepón `corepack` a cada comando (`corepack pnpm install`).
- **Docker** con Compose v2, para la base de datos de desarrollo y para el modo 3.

## 1. Desarrollo

```bash
pnpm install                                    # dependencias del monorepo
pnpm db:up                                      # PostgreSQL 18.6 y S3 local RustFS (docker/compose.yaml)
cp apps/backend/.env.example apps/backend/.env  # completa AUTH_SECRET (openssl rand -base64 32)
pnpm db:migrate                                 # aplica las migraciones y genera el cliente Prisma
SEED_PASSWORD='Semilla-Local-2026' pnpm db:seed # opcional: datos de desarrollo (fish: env SEED_PASSWORD=… pnpm db:seed)
pnpm --filter @gestor-semilleros/backend dev    # API con recarga en http://localhost:3000/api
```

- `pnpm dev` (sin filtro) arranca a la vez el backend y la web mediante Turborepo.
- La seed crea un usuario por rol (`admin@example.test`, `encargado.area@`, `decano@`, `tutor@`, `lider@`, `estudiante@`), todos con la contraseña de `SEED_PASSWORD`. Debe cumplir la política del [ADR 0011](../../docs/decisions/0011-gestion-de-usuarios.md): 10–256 caracteres, con al menos una letra y un número, distinta del correo. La seed es idempotente y se niega a correr con `NODE_ENV=production`.
- Para crear un administrador real: `ADMIN_EMAIL=… ADMIN_FULL_NAME=… ADMIN_PASSWORD=… pnpm --filter @gestor-semilleros/backend admin:create`.
- **Documentos (S3):** con los valores de `.env.example` el backend usa el RustFS local y crea solo el bucket `semilleros-documentos`. La consola de RustFS está en `http://localhost:9001` (usuario `semilleros`, clave `semilleros-local`). Sin variables `S3_*`, la API arranca igual, pero subir y descargar documentos responde 503 ([ADR 0013](../../docs/decisions/0013-documentos-en-s3.md)).
- Otros comandos de base de datos: `pnpm db:studio`, `pnpm db:logs`, `pnpm db:down`, y en el paquete `db:status`, `db:validate` y `db:reset` (`db:reset` **borra** los datos locales).
- Guía detallada de la base de datos: [`docs/database/local-setup.md`](../../docs/database/local-setup.md).

### Pruebas

```bash
pnpm --filter @gestor-semilleros/backend typecheck
pnpm --filter @gestor-semilleros/backend test      # unitarias (Jest), sin base de datos
pnpm --filter @gestor-semilleros/backend test:e2e  # API contra TEST_DATABASE_URL (requiere pnpm db:up)
```

Las e2e usan la base de `TEST_DATABASE_URL`, cuyo nombre debe terminar en `_test`. Le aplican las migraciones solas y la vacían entre pruebas: no ejecutes dos e2e a la vez sobre la misma base.

## 2. Producción sin Docker

En un servidor con Node 24, pnpm y acceso a PostgreSQL:

```bash
pnpm install --frozen-lockfile
pnpm --filter @gestor-semilleros/backend db:generate   # cliente Prisma
pnpm --filter @gestor-semilleros/backend build         # compila a apps/backend/dist

# Variables: copia apps/backend/.env.example a apps/backend/.env o defínelas en el entorno.
# Como mínimo: DATABASE_URL, AUTH_SECRET y NODE_ENV=production.
pnpm --filter @gestor-semilleros/backend db:deploy     # aplica migraciones pendientes (nunca usa db:migrate en producción)
pnpm --filter @gestor-semilleros/backend start         # node dist/main, puerto PORT (3000 por defecto)
```

- **Mismo origen:** sirve la web y `/api` bajo el mismo dominio, porque las cookies de sesión lo requieren. Ver el modo 2 de [`apps/web/README.md`](../web/README.md#2-producción-sin-docker).
- **Detrás de un proxy:** usa `AUTH_TRUST_HOST=true` y reenvía `Host` (con puerto) y `X-Forwarded-Proto`.
- **Google y Microsoft:** registra las URI de redirección con el dominio público: `https://DOMINIO/api/auth/callback/google` y `https://DOMINIO/api/integrations/microsoft/callback`.
- **Documentos:** define `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY` de AWS. `S3_ENDPOINT` solo hace falta con un servidor compatible. Si hay un proxy delante, debe aceptar cuerpos de al menos 26 MB.
- **WhatsApp (Baileys):** guarda su sesión en `<WHATSAPP_SESSION_NAME>_sessions/`, relativo al directorio de trabajo. Mantén esa carpeta persistente y trátala como un secreto.
- Usa un gestor de procesos (systemd, pm2…) para reiniciar el proceso si cae.

## 3. Producción con Docker

La imagen del backend (`apps/backend/Dockerfile`) se usa dentro del despliegue completo [`docker/compose.prod.yaml`](../../docker/compose.prod.yaml), que levanta PostgreSQL, el backend y la web (nginx). Decisión: [ADR 0012](../../docs/decisions/0012-despliegue-con-contenedores.md).

```bash
cp docker/env.prod.example docker/.env.prod
# Edita docker/.env.prod: como mínimo POSTGRES_PASSWORD y AUTH_SECRET (openssl rand -base64 32).
docker compose -f docker/compose.prod.yaml --env-file docker/.env.prod up -d --build
docker compose -f docker/compose.prod.yaml --env-file docker/.env.prod ps   # postgres y backend deben quedar "healthy"
```

La aplicación queda en `http://localhost:${WEB_PORT}` (8080 por defecto). Solo la web publica un puerto: nginx sirve la interfaz y redirige `/api` al backend.

Tareas habituales:

```bash
# Alias para no repetir los parámetros (bash/zsh)
dc() { docker compose -f docker/compose.prod.yaml --env-file docker/.env.prod "$@"; }

dc logs -f backend                    # registros (incluye las migraciones aplicadas al arrancar)
dc exec -e ADMIN_EMAIL=admin@universidad.edu -e ADMIN_FULL_NAME="Nombre" -e ADMIN_PASSWORD='Clave-Segura-2026' \
   backend node dist/cli/create-admin.js   # primer administrador
dc up -d --build                      # actualizar tras un git pull (migra al arrancar)
dc down                               # detener (los volúmenes conservan los datos)
```

Detalles de la imagen:

- **Construcción:** multietapa sobre `node:24-alpine`, con contexto en la raíz del monorepo. Para construirla sola: `docker build -f apps/backend/Dockerfile -t gestor-semilleros/backend .`
- **Arranque:** `docker-entrypoint.sh` ejecuta `prisma migrate deploy` y luego `node dist/main`. Si la base no está accesible, el contenedor termina con error en lugar de arrancar a medias.
- **Ejecución:** corre como el usuario `node`, en el puerto 3000. Tiene un healthcheck sobre `/api/auth/providers`.
- **Volúmenes:** `postgres-data` (base de datos) y `whatsapp-sessions`, montado en `/app/whatsapp_sessions`. Si cambias `WHATSAPP_SESSION_NAME`, ajusta esa ruta en el compose.
- **Tamaño (~876 MB):** la imagen incluye el CLI de Prisma para poder migrar al arrancar. En la imagen, `prisma` se mueve a dependencias de producción solo durante la construcción; el `package.json` del repositorio no cambia.
- **Documentos:** configura las variables `S3_*` de AWS en `docker/.env.prod`. nginx admite subidas de hasta 26 MB.
- **HTTPS:** el compose no lo gestiona. Pon un proxy o balanceador con TLS delante del puerto publicado y usa esa URL pública en Google y Microsoft.
- **Copias de seguridad:** no están automatizadas. Por ejemplo: `dc exec postgres pg_dump -U semilleros semilleros > respaldo.sql`.

## Variables de entorno

Referencia completa y comentada: [`apps/backend/.env.example`](.env.example) (desarrollo) y [`docker/env.prod.example`](../../docker/env.prod.example) (contenedores). El backend valida las variables al arrancar y se detiene con un mensaje claro si falta alguna obligatoria.
