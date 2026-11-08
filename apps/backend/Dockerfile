# syntax=docker/dockerfile:1
#
# Imagen del backend (NestJS + Prisma). Contexto de build: la RAÍZ del monorepo.
#   docker build -f apps/backend/Dockerfile -t semilleros-backend:local .
#
# Etapas:
#   base     -> Node 24 Alpine con pnpm vía Corepack (versión fijada en package.json raíz).
#   build    -> instala dependencias (lockfile congelado), genera el cliente de Prisma y compila.
#   prune    -> deja solo las dependencias de producción del backend (más el CLI de Prisma).
#   runtime  -> imagen final sin herramientas de compilación, usuario no root.

ARG NODE_VERSION=24-alpine

# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Corepack lee "packageManager" del package.json raíz y descarga pnpm 12.18.0.
RUN corepack enable
WORKDIR /repo

# ---------------------------------------------------------------------------
FROM base AS build
# Primero los manifiestos: la capa de instalación solo se invalida si cambian las dependencias.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --filter @gestor-semilleros/backend...

COPY apps/backend apps/backend
# El cliente se genera en apps/backend/src/generated (ignorado por git).
# prisma.config.ts lee DATABASE_URL con env(); solo para generar se usa una URL ficticia,
# que no se conecta a ninguna base de datos.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm --filter @gestor-semilleros/backend db:generate \
 && pnpm --filter @gestor-semilleros/backend build

# ---------------------------------------------------------------------------
FROM build AS prune
# "pnpm deploy --prod" copia el backend con solo sus dependencias de producción (~196 MB frente a ~564 MB
# con devDependencies). El CLI de Prisma es devDependency del backend y "prisma migrate deploy" lo necesita
# al arrancar, así que en esta etapa (solo de build, no altera el repositorio) se mueve "prisma" a
# dependencies, se actualiza el lockfile sin cambiar versiones (--lockfile-only) y luego se despliega en prod.
RUN node -e "\
const fs = require('fs'); \
const f = 'apps/backend/package.json'; \
const p = JSON.parse(fs.readFileSync(f, 'utf8')); \
p.dependencies.prisma = p.devDependencies.prisma; \
delete p.devDependencies.prisma; \
fs.writeFileSync(f, JSON.stringify(p, null, 2) + '\\n');" \
 && pnpm install --lockfile-only --filter @gestor-semilleros/backend... \
 && pnpm --filter @gestor-semilleros/backend deploy --prod /out

# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

COPY --from=prune --chown=node:node /out/ ./
COPY --from=build --chown=node:node /repo/apps/backend/dist ./dist
COPY --from=build --chown=node:node /repo/apps/backend/prisma ./prisma
COPY --from=build --chown=node:node /repo/apps/backend/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node --chmod=755 apps/backend/docker-entrypoint.sh ./docker-entrypoint.sh

# Directorio de trabajo escribible: Baileys guarda la sesión de WhatsApp en
# "<cwd>/<WHATSAPP_SESSION_NAME>_sessions" (por defecto "whatsapp_sessions").
RUN mkdir -p /app/whatsapp_sessions && chown node:node /app /app/whatsapp_sessions
VOLUME ["/app/whatsapp_sessions"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT}/api/auth/providers || exit 1

CMD ["./docker-entrypoint.sh"]
