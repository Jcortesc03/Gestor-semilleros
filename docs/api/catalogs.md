# API de catálogos institucionales

> **Estado:** implementado en `apps/backend/src/modules/faculties/` (`FacultiesModule`). Lectura ([ADR 0009](../decisions/0009-directorio-catalogos-y-paneles.md)) cubierta por `apps/backend/test/catalogs.e2e-spec.ts`; administración ([ADR 0010](../decisions/0010-reglas-pendientes-resueltas.md), sección 1) cubierta por `apps/backend/test/catalogs-admin.e2e-spec.ts` y pruebas unitarias en `src/modules/faculties/`.

Las rutas de lectura sirven para elegir área y facultades al crear o editar proyectos sin escribir identificadores. La sección [Administración](#administración) cubre crear, editar y borrar áreas y facultades, y asignar encargados y decanos.

**Requieren** cualquier sesión válida (`SessionGuard`). Sin sesión → `401 { message: "Sesión no válida o expirada." }`.

## `GET /api/areas`

`200`, ordenado por nombre:

```json
[{ "id": "uuid", "name": "Investigación", "description": "Texto o null" }]
```

### Filtro `scope=managed` (contrato aprobado, ADR 0010 §9; **implementado**)

`GET /api/areas?scope=managed` devuelve solo las áreas en las que el usuario actual es **encargado asignado** (`area_managers`), con la misma forma y orden. Sin asignaciones → `[]`. Cualquier otro valor de `scope` (incluido `dean`) o un parámetro distinto de `scope` → `400 { message: "Datos inválidos.", errors: string[] }`.

## `GET /api/faculties`

`200`, ordenado por nombre:

```json
[{ "id": "uuid", "name": "Facultad de Ingeniería" }]
```

### Filtro `scope=dean` (contrato aprobado, ADR 0010 §9; **implementado**)

`GET /api/faculties?scope=dean` devuelve solo las facultades de las que el usuario actual es **decano vigente** (`ends_at` nulo o futuro), con la misma forma y orden. Sin decanatos → `[]`. Cualquier otro valor de `scope` (incluido `managed`) o un parámetro distinto de `scope` → `400 { message: "Datos inválidos.", errors: string[] }`.

No exponen decanos, encargados ni proyectos asociados.

---

# Administración

Todas las rutas requieren sesión (`SessionGuard`) y rol global (`RolesGuard`). Sin permiso → `403 { message: "No tienes permisos para realizar esta acción." }`; sin sesión → `401`. Los identificadores de la ruta deben ser UUID (si no, `400`). Errores de validación → `400 { message: "Datos inválidos.", errors: string[] }`. Los cuerpos no admiten campos desconocidos.

## Áreas

| Método y ruta | Quién | Éxito |
| --- | --- | --- |
| `POST /api/areas` | ADMIN | `201` con el área |
| `PATCH /api/areas/:id` | ADMIN; AREA_MANAGER solo si el área está entre las suyas | `200` con el área |
| `DELETE /api/areas/:id` | ADMIN | `204` |

Cuerpo de `POST`: `{ "name": string, "description"?: string | null }`. `name` es obligatorio (1 a 150 caracteres tras recortar espacios; los espacios internos repetidos se colapsan). `description`: hasta 2000 caracteres; una cadena vacía o `null` equivale a sin descripción.

Cuerpo de `PATCH`: `{ "name"?: string, "description"?: string | null }`, con al menos un campo. Mismas reglas.

Respuesta (igual que `GET /api/areas`): `{ "id", "name", "description" }`.

Errores:

- `404 { message: "Área no encontrada." }` si no existe.
- `403` si es un encargado de área que edita un área que no tiene asignada (o cualquier otro rol).
- `409 { message: "Ya existe un área con ese nombre." }` si el nombre coincide (sin distinguir mayúsculas) con otra área.
- `DELETE`: `409 { message: "No se puede eliminar el área: tiene proyectos asociados." }` o `"... tiene novedades dirigidas a ella."` (los proyectos eliminados lógicamente también cuentan). Si no tiene ninguno, se elimina físicamente junto con sus asignaciones de encargados.

## Facultades

| Método y ruta | Quién | Éxito |
| --- | --- | --- |
| `POST /api/faculties` | ADMIN | `201` con la facultad |
| `PATCH /api/faculties/:id` | ADMIN | `200` con la facultad |
| `DELETE /api/faculties/:id` | ADMIN | `204` |

Cuerpo: `{ "name": string }` (obligatorio en ambos; mismas reglas de nombre que las áreas). Respuesta: `{ "id", "name" }`.

Errores: `404 { message: "Facultad no encontrada." }`; `409 { message: "Ya existe una facultad con ese nombre." }`; en `DELETE`, `409` con `"No se puede eliminar la facultad: tiene proyectos asociados."` o `"... tiene novedades dirigidas a ella."`. Al eliminarla se borra también su historial de decanatos.

## Encargados de área

Solo ADMIN. Un encargado es un usuario `ACTIVE` con el rol global `AREA_MANAGER`.

### `GET /api/areas/:id/managers`

`200`, ordenado por fecha de asignación y nombre:

```json
[{ "userId": "uuid", "fullName": "Nombre", "email": "correo@example.test", "assignedAt": "ISO-8601" }]
```

`404` si el área no existe.

### `PUT /api/areas/:id/managers/:userId`

Sin cuerpo. Asigna al usuario como encargado del área. Es idempotente: si ya lo es, no cambia nada. `200` con el elemento anterior.

- `404 "Área no encontrada."` / `404 "Usuario no encontrado."`.
- `400 { message: "El usuario debe estar activo." }` si no está `ACTIVE`.
- `400 { message: "El usuario debe tener el rol de encargado de área." }` si no tiene el rol `AREA_MANAGER`.

### `DELETE /api/areas/:id/managers/:userId`

`204`. `404 { message: "El usuario no es encargado de esta área." }` si no lo era (o el área no existe).

## Decanos de facultad

Solo ADMIN. Hay como máximo un decano vigente (`ends_at` nulo) por facultad (DB-03); el historial se conserva.

### `GET /api/faculties/:id/deans`

`200`, el vigente primero y luego los anteriores del más reciente al más antiguo:

```json
[{ "id": "uuid", "userId": "uuid", "fullName": "Nombre", "email": "correo@example.test", "startsAt": "ISO-8601", "endsAt": null }]
```

`404` si la facultad no existe.

### `PUT /api/faculties/:id/dean`

Cuerpo `{ "userId": "uuid" }`. En una transacción cierra el decanato vigente (`endsAt = ahora`), si existe, y crea uno nuevo (`startsAt = ahora`, `endsAt = null`). `200` con el decanato creado (misma forma que el historial).

- `400` si `userId` falta o no es UUID, si el usuario no está `ACTIVE` (`"El usuario debe estar activo."`) o no tiene el rol `DEAN` (`"El usuario debe tener el rol de decano."`).
- `404` si la facultad o el usuario no existen.
- `409 { message: "El usuario ya es el decano vigente de esta facultad." }`. También `409` si una asignación concurrente ocupa antes el puesto vigente.

### `DELETE /api/faculties/:id/dean`

Cierra el decanato vigente sin sustituirlo. `204`. `404 { message: "La facultad no tiene un decano vigente." }` si no hay vigente (o la facultad no existe).

## Pruebas

- Unitarias: `src/modules/faculties/dtos/*.spec.ts` y `src/modules/faculties/services/*.spec.ts`.
- e2e: `apps/backend/test/catalogs.e2e-spec.ts` (incluye los filtros `scope`), `apps/backend/test/catalogs-admin.e2e-spec.ts` (permisos por rol, encargado que edita su área y no otra, validaciones, nombres duplicados, borrado con dependencias, asignación de encargados y cambio de decano con historial).
