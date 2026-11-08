# Imagen de la web: build de Vite con pnpm y servicio estático con nginx.
# Contexto de build: la raíz del repositorio.
#   docker build -f apps/web/Dockerfile -t semilleros-web:local .

# ---------- Etapa build ----------
FROM node:24-alpine AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /repo

# Manifiestos y lockfile primero para aprovechar la caché de capas.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile --filter @gestor-semilleros/web...

# Código fuente de la web. No se copia apps/web completo para no arrastrar node_modules locales.
COPY apps/web/index.html apps/web/vite.config.ts ./apps/web/
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public

RUN pnpm --filter @gestor-semilleros/web exec vite build

# ---------- Etapa runtime ----------
FROM nginx:1.29-alpine AS runtime

# Origen del backend que recibe /api/. Solo origen (sin ruta), p. ej. http://backend:3000.
ENV BACKEND_URL=http://backend:3000

# La imagen oficial aplica envsubst a /etc/nginx/templates/*.template y deja el resultado en conf.d/.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80
