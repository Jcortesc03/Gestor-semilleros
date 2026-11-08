# ADR 0012 — Despliegue con contenedores

- **Estado:** aceptado (decisiones del usuario, 2026-11-07).
- **Relacionado:** [ADR 0001](0001-modelo-de-datos-y-entorno-local.md) (PostgreSQL local con Docker Compose), [ADR 0002](0002-autenticacion-y-pruebas.md), [ADR 0008](0008-aplicacion-web-y-sistema-visual.md).

## Contexto

Solo existía `docker/compose.yaml`, que levanta PostgreSQL para desarrollo. Faltaban imágenes del backend y de la web y una forma de desplegar la aplicación completa. Las cookies de sesión de Auth.js exigen que la web y `/api` compartan origen.

## Decisión

- **Backend:** `apps/backend/Dockerfile`, multietapa sobre `node:24-alpine`, con pnpm vía Corepack. La imagen final contiene solo dependencias de producción y el CLI de Prisma; al arrancar aplica `prisma migrate deploy` y después ejecuta `node dist/main`. Corre con un usuario sin privilegios.
- **Web:** `apps/web/Dockerfile`, que compila con `node:24-alpine` y sirve con `nginx:1.29-alpine`. nginx entrega el build estático de Vite, devuelve `index.html` para las rutas de la SPA y hace de **proxy de `/api`** hacia el backend (`BACKEND_URL`), reenviando `Host` y `X-Forwarded-*` para que Auth.js construya bien las URL de callback.
- **Orquestación:** `docker/compose.prod.yaml` con PostgreSQL 18.6, backend y web. Solo se publica el puerto de la web (`WEB_PORT`). La base de datos y el backend quedan en la red interna. Los volúmenes guardan los datos de PostgreSQL y la sesión de WhatsApp.
- **Configuración:** las variables van en `docker/.env.prod`, que no se versiona; la plantilla es `docker/env.prod.example`. Las imágenes no contienen secretos.
- **Contexto de build:** la raíz del monorepo, con un `.dockerignore`.

## Consecuencias

- El TLS (HTTPS) y el dominio quedan fuera de este compose: se resuelven con un proxy o balanceador delante del puerto publicado. Auth.js y Google necesitan la URL pública final.
- Las URI de redirección de Google y Microsoft deben usar el dominio público (`https://DOMINIO/api/...`).
- Siguen pendientes la CI/CD (publicación de imágenes en un registro), las copias de seguridad de PostgreSQL y la infraestructura de producción concreta.
