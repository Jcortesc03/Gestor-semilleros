# ADR 0017 — Paginación de listas

- **Estado:** aceptado.
- **Fecha:** 2026-11-08.

## Contexto

Con datos reales (o la seed masiva, miles de filas) las listas de la plataforma devolvían todo de una vez y los paneles crecían sin límite. Se pidió paginar todas las listas.

## Decisión (aprobada por el usuario): paginación híbrida

### 1. En el servidor: listas que crecen sin límite

| Endpoint | Antes | Ahora |
| --- | --- | --- |
| `GET /api/projects` | arreglo completo | página; admite además `search` (título, sin distinguir mayúsculas) |
| `GET /api/users` | arreglo, `limit` 1–50 | página; `limit` se sustituye por `pageSize` |
| `GET /api/meetings` | arreglo, `limit` 1–100 (50) | página; `limit` se sustituye por `pageSize` (por defecto 50) |
| `GET /api/announcements` | arreglo, `limit` 1–100 (50) y `before` | página; `limit` → `pageSize` (por defecto 50); `before` se conserva como filtro |
| `GET /api/projects/:projectId/documents` | arreglo completo | página |

**Contrato común** (implementado en `apps/backend/src/common/utils/pagination.ts` y `apps/web/src/lib/pagination.ts`):

- Query: `page` (entero ≥ 1, por defecto 1) y `pageSize` (entero 1–100, por defecto 20 salvo lo indicado). Errores `400` con `page debe ser un entero mayor o igual que 1.` y `pageSize debe ser un entero entre 1 y 100.`
- Respuesta `200`: `{ "items": [...], "total": 123, "page": 1, "pageSize": 20 }`. `total` cuenta todos los elementos que cumplen los filtros. Una página más allá del final devuelve `items: []` con el `total` real.
- Orden **estable**: el orden documentado de cada lista más `id` como desempate, para que las páginas no se solapen.
- Es un **cambio incompatible**: la web se actualiza en la misma entrega; no hay otros clientes.
- Los selectores (pickers) siguen usando búsqueda y `pageSize` hasta 100, no cargan listas completas.
- `GET /api/projects/tutored` no se pagina (lista corta para selectores).

### 2. En el cliente: listas acotadas

Miembros de un proyecto, tableros y actividades de un proyecto/tablero, adjuntos, entregas de una novedad y tablas de la analítica: la API las sigue devolviendo completas (están acotadas por un proyecto o por el alcance) y la web las pagina con `useClientPagination` y el componente `Pagination` (`apps/web/src/components/Pagination.tsx`), 10 elementos por página.

### 3. Interfaz

`Pagination` muestra «X–Y de N · página P de T» y botones Anterior/Siguiente accesibles; se oculta si todo cabe en una página. Al cambiar un filtro se vuelve a la página 1.

## Consecuencias

- Se actualizan los contratos en `docs/api/` de cada endpoint y sus pruebas e2e.
- Sin dependencias nuevas.
- Pendiente: paginación por cursor si el volumen llega a hacer costoso `OFFSET`.
