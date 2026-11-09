# ADR 0009 — Directorio de usuarios, catálogos y paneles por rol

- **Estado:** aceptado.
- **Fecha:** 2026-11-07.

## Contexto

La web obligaba a escribir UUID para elegir área, facultad, tutor, estudiantes y participantes, y no tenía paneles por rol. La matriz de permisos no definía la lectura de usuarios, áreas ni facultades, ni el alcance del panel del encargado de área (P-08).

## Decisión (aprobada por el usuario)

1. **`GET /api/users`** (directorio de selección): solo `ADMIN`, `DEAN` y `TUTOR`; devuelve únicamente `id`, `fullName`, `email` y `roles` de usuarios activos. Contrato: [`users.md`](../api/users.md).
2. **`GET /api/areas` y `GET /api/faculties`**: cualquier sesión válida; solo `id` y nombre. Contrato: [`catalogs.md`](../api/catalogs.md).
3. **`GET /api/dashboard`**: una sección por rol global, sumadas (P-02). El encargado de área ve **solo sus áreas asignadas** (`area_managers`); esto resuelve P-08 **solo para la lectura de métricas**. Contrato: [`dashboard.md`](../api/dashboard.md).
4. La web muestra el `message` y los `errors[]` que devuelve el backend en lugar de mensajes genéricos por código HTTP.

## Consecuencias

- Se actualiza la matriz de `docs/domain/roles-permissions.md` (filas Usuarios, Áreas, Facultades y Dashboard).
- Siguen pendientes: administrar áreas y facultades, el resto de P-08 y las incompatibilidades entre roles.
