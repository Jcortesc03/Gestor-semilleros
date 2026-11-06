# ADR 0001 · Modelo de datos inicial y entorno local de base de datos

- **Estado:** Aceptada
- **Fecha:** 2026-11-06

## Contexto

El dominio está documentado en `docs/domain/` y la propuesta relacional en `docs/database/`. Para empezar a implementar el backend hacía falta un esquema de Prisma, versiones fijas y una forma reproducible de levantar PostgreSQL en cualquier equipo.

## Decisión

1. **Versiones:** Node.js 24 LTS, pnpm 12.18.0 (activado con Corepack), Prisma 7.10.1 (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) y PostgreSQL 18.6. Se descartó Prisma 8, que solo está publicado como versión rc.
2. **Esquema:** `apps/backend/prisma/schema.prisma` implementa el modelo de `docs/database/data-model.md` con las respuestas del usuario a P-01–P-06, P-10–P-12, P-14–P-16, P-18, P-20, P-25 y P-26. También aprueba las decisiones DB-01 a DB-14 descritas en `docs/database/database-decisions.md`.
3. **Identificadores:** UUID generados por Prisma, guardados como `uuid` en PostgreSQL (DB-14).
4. **Restricciones personalizadas:** los CHECK y los índices únicos parciales se añaden con SQL en las migraciones. Sus nombres están documentados en `data-model.md` §6.
5. **Configuración de Prisma 7:** `prisma.config.ts` carga `DATABASE_URL` con `dotenv`. El cliente se genera con el generador `prisma-client` en `apps/backend/src/generated/prisma`, que no se versiona.
6. **Entorno local:** `docker/compose.yaml` con `postgres:18.6-alpine` y un volumen persistente. La raíz tiene los scripts `db:*` y la guía está en `docs/database/local-setup.md`.
7. **Builds de pnpm:** se autorizan los scripts de instalación de `prisma` y `@prisma/engines` en `pnpm-workspace.yaml` (`allowBuilds`).

## Dependencias añadidas

| Paquete | Versión | Motivo |
| --- | --- | --- |
| `prisma` (dev) | 7.10.1 | CLI de migraciones y generación |
| `@prisma/client` | 7.10.1 | Cliente de acceso a datos |
| `@prisma/adapter-pg` | 7.10.1 | Prisma 7 necesita un adaptador de conexión para PostgreSQL |
| `dotenv` (dev) | 18.0.9 | Prisma 7 no carga `.env` automáticamente |

## Consecuencias

- El backend aún no tiene NestJS ni `PrismaService`. Para usar el cliente hará falta instanciarlo con `PrismaPg` cuando se cree el backend.
- Cambiar los valores de los enums requiere una migración.
- Siguen abiertas P-08, P-09, P-13, P-17, P-19, P-21, P-22, P-23 y P-24. `AreaManager` y `Reminder` son modelos provisionales.
- La eliminación lógica (`deleted_at`) necesitará un filtro central en las consultas cuando exista el backend.
