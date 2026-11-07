# API de proyectos y participantes

> **Estado:** implementado en `apps/backend/src/modules/projects/` y cubierto por `apps/backend/test/projects.e2e-spec.ts`. Los parsers de entrada tienen además pruebas unitarias (`dtos/*.spec.ts`).
> Autenticación: [`auth.md`](auth.md). Tableros y actividades: [`boards.md`](boards.md). Roles y permisos: [`roles-permissions.md`](../domain/roles-permissions.md).

Todas las rutas requieren una sesión válida (cookie de Auth.js). El prefijo global es `/api`.
El acceso se resuelve **por proyecto** en cada petición (`ProjectAccessService`): no basta con tener un rol global, hay que ser Administrador, Decano vigente de una facultad del proyecto, Encargado de área del área del proyecto o participante activo.

## Acceso y visibilidad

`ProjectAccessService.resolve` calcula la relación del usuario con el proyecto:

| Campo | Significado |
| --- | --- |
| `isAdmin` | El usuario tiene el rol global `ADMIN`. |
| `isDean` | El usuario tiene el rol global `DEAN` y es decano **vigente** (`endsAt = null`) de al menos una facultad del proyecto. |
| `isAreaManager` | El usuario tiene el rol global `AREA_MANAGER` y el área del proyecto está entre sus áreas asignadas (`area_managers`). Tiene los mismos permisos que `isDean`; ninguno prevalece sobre el otro (ADR 0010, sec. 2-3). |
| `role` | Rol de proyecto (`TUTOR`, `STUDENT`, `STUDENT_LEADER`) si es participante `ACTIVE`; si no, `null`. |

Si el proyecto no existe, está eliminado lógicamente (`deletedAt`) o el usuario no puede verlo, la respuesta es **`404 { message: "Proyecto no encontrado." }`**. Así no se revela la existencia de proyectos ajenos. Los permisos insuficientes sobre un proyecto visible responden **`403 { message: "No tienes permisos para realizar esta acción." }`**.

### Reglas de permiso (`can` en `models/project-access.ts`)

| Regla | Quién puede | Se usa en |
| --- | --- | --- |
| `manageProject` | Administrador, Decano o Encargado de área del proyecto | Editar y eliminar el proyecto. |
| `manageTutors` | Administrador, Decano o Encargado de área del proyecto | Asignar, retirar o marcar como principal a los tutores. |
| `manageStudents` | Administrador, Decano, Encargado de área o Tutor del proyecto | Añadir o retirar estudiantes y elegir al líder. |
| `manageBoards` | Administrador o Tutor del proyecto | Crear, editar y eliminar tableros (ver [`boards.md`](boards.md)). |
| `manageActivities` | Administrador, Tutor o Estudiante líder | Crear, editar y eliminar actividades y gestionar encargados. |
| `review` | Administrador o Tutor del proyecto | Aprobar o rechazar actividades y fijar su resultado. |

> Los roles globales se suman (P-02). Un `DEAN` que además es `TUTOR` de un proyecto acumula los permisos de ambos.

### Visibilidad en `GET /api/projects`

| Rol | Proyectos que ve |
| --- | --- |
| `ADMIN` | Todos los no eliminados. |
| `DEAN` | Los de las facultades donde es decano vigente **y** aquellos donde participa activamente. |
| `AREA_MANAGER` | Los de sus áreas asignadas **y** aquellos donde participa activamente. |
| Resto | Solo aquellos donde es participante `ACTIVE`. Un `TUTOR` global que no participa en el proyecto no lo ve. |

Los proyectos se devuelven ordenados por `createdAt` descendente. No hay paginación ni filtros.

## Endpoints

| Método y ruta | Permiso | Código de éxito |
| --- | --- | --- |
| `POST /api/projects` | Rol global `DEAN` o `ADMIN` | `201` |
| `GET /api/projects` | Cualquier sesión válida (filtrado por visibilidad) | `200` |
| `GET /api/projects/:projectId` | Ver el proyecto | `200` |
| `PATCH /api/projects/:projectId` | `manageProject` | `200` |
| `DELETE /api/projects/:projectId` | `manageProject` | `204` |
| `GET /api/projects/:projectId/members` | Ver el proyecto | `200` |
| `POST /api/projects/:projectId/members` | `manageTutors` o `manageStudents` según el rol | `201` |
| `PATCH /api/projects/:projectId/members/:memberId` | `manageTutors` o `manageStudents` según el campo | `200` |
| `DELETE /api/projects/:projectId/members/:memberId` | `manageTutors` (tutor) o `manageStudents` (estudiante) | `204` |

Los cuerpos de error de validación son `{ message: "Datos inválidos.", errors: string[] }`. En el resto de errores se documenta el `message`; NestJS añade `statusCode` y `error` a la respuesta. Un identificador de ruta que no sea UUID responde `400` con `Validation failed (uuid is expected)`.

## `POST /api/projects`

Crea un proyecto. Exige el rol global `DEAN`, `AREA_MANAGER` o `ADMIN` (`RolesGuard`).

**Reglas adicionales (se suman):** el decano debe ser vigente de **al menos una** de las facultades indicadas; el encargado de área solo puede crear con un `areaId` de un área que tenga asignada (puede elegir cualquier facultad existente). Quien cumpla cualquiera de las dos reglas puede crear. Un Administrador no tiene restricción.

### Cuerpo (`application/json`)

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `title` | string | Sí | Se recortan los espacios; entre 1 y 200 caracteres. |
| `description` | string \| null | No | Máximo 5000 caracteres. Vacía o `null` se guarda como `null`. |
| `areaId` | string (UUID) | Sí | El área debe existir. |
| `facultyIds` | string[] | Sí | Al menos un UUID; todos deben existir. Los duplicados se ignoran conservando el orden. |
| `startsOn` | string (`YYYY-MM-DD`) \| null | No | Fecha válida. |
| `endsOn` | string (`YYYY-MM-DD`) \| null | No | Fecha válida; no puede ser anterior a `startsOn`. |

Cualquier otro campo se rechaza. El proyecto se crea con `status: ACTIVE`.

```json
{
  "title": "Semillero de robótica",
  "description": "Robótica educativa para ingeniería.",
  "areaId": "00000000-0000-0000-0000-000000000001",
  "facultyIds": ["00000000-0000-0000-0000-000000000002"],
  "startsOn": "2026-02-01",
  "endsOn": "2026-11-30"
}
```

### Respuestas

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `201` | Proyecto creado | `ProjectResponseDto` (ver abajo). |
| `400` | Datos inválidos, área inexistente o facultad inexistente | `{ message: "Datos inválidos.", errors: string[] }` con todos los errores. |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | El usuario no es `DEAN`/`AREA_MANAGER`/`ADMIN`, el decano no dirige ninguna de las facultades indicadas o el encargado de área no tiene asignada el área indicada | `{ message: "No tienes permisos para realizar esta acción." }` |

Mensajes de validación exactos:

- `El cuerpo debe ser un objeto JSON.`
- `Campos no permitidos: campo1, campo2.`
- `title es obligatorio (máximo 200 caracteres).`
- `description debe ser texto.`
- `description admite como máximo 5000 caracteres.`
- `areaId debe ser un UUID.`
- `facultyIds debe ser una lista con al menos un UUID de facultad.`
- `startsOn debe ser una fecha válida con formato YYYY-MM-DD.`
- `endsOn debe ser una fecha válida con formato YYYY-MM-DD.`
- `endsOn no puede ser anterior a startsOn.`
- `El área indicada no existe.`
- `Alguna de las facultades indicadas no existe.`

### `ProjectResponseDto`

```json
{
  "id": "00000000-0000-0000-0000-000000000010",
  "title": "Semillero de robótica",
  "description": "Robótica educativa para ingeniería.",
  "status": "ACTIVE",
  "area": { "id": "00000000-0000-0000-0000-000000000001", "name": "Semilleros" },
  "faculties": [{ "id": "00000000-0000-0000-0000-000000000002", "name": "Ingeniería" }],
  "startsOn": "2026-02-01",
  "endsOn": "2026-11-30",
  "createdAt": "2026-11-06T15:00:00.000Z"
}
```

`status` es `ACTIVE`, `FINISHED` o `CANCELLED`. Las facultades se ordenan por nombre y las fechas sin hora se devuelven como `YYYY-MM-DD`.

## `GET /api/projects`

Devuelve los proyectos visibles para el usuario (ver [visibilidad](#visibilidad-en-get-apiprojects)).

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Siempre que haya sesión | `ProjectResponseDto[]` (vacío si no hay proyectos visibles). |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |

## `GET /api/projects/:projectId`

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | El usuario puede ver el proyecto | `ProjectResponseDto`. |
| `400` | `projectId` no es UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `404` | No existe, está eliminado o el usuario no puede verlo | `{ message: "Proyecto no encontrado." }` |

## `PATCH /api/projects/:projectId`

Actualización parcial. Solo `manageProject` (Administrador, Decano o Encargado de área del proyecto). Si cambia `facultyIds` o `areaId`, el proyecto resultante debe seguir bajo la autoridad del usuario (decano de al menos una facultad o encargado del área resultante); si no, `403`.

### Cuerpo (`application/json`)

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `title` | string | Se recortan los espacios; entre 1 y 200 caracteres. |
| `description` | string \| null | Máximo 5000 caracteres; vacía o `null` se guarda como `null`. |
| `areaId` | string (UUID) | El área debe existir. |
| `facultyIds` | string[] | Reemplaza **todo** el conjunto de facultades; al menos un UUID existente. |
| `status` | string | `ACTIVE`, `FINISHED` o `CANCELLED`. No hay validación de transiciones. |
| `startsOn` | string (`YYYY-MM-DD`) \| null | Fecha válida. |
| `endsOn` | string (`YYYY-MM-DD`) \| null | Fecha válida; no puede ser anterior a `startsOn`. |

Debe indicarse al menos un campo. El orden de las fechas se valida también contra los valores actuales del proyecto: si solo se envía `endsOn`, se compara con el `startsOn` guardado (y viceversa). El cambio de facultades y el resto de campos se aplican en una transacción.

```json
{ "status": "FINISHED", "endsOn": "2026-12-15", "facultyIds": ["00000000-0000-0000-0000-000000000002"] }
```

### Respuestas

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Actualizado | `ProjectResponseDto`. |
| `400` | Datos inválidos, sin campos, área/facultad inexistente o fechas invertidas | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | No es Administrador, Decano ni Encargado de área del proyecto; o el cambio de facultades/área deja el proyecto fuera de su autoridad | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | No existe, está eliminado o no puede verlo | `{ message: "Proyecto no encontrado." }` |

Mensajes de validación adicionales: `Debe indicar al menos un campo para actualizar.` y `status debe ser uno de: ACTIVE, FINISHED, CANCELLED.`

## `DELETE /api/projects/:projectId`

Eliminación **lógica** (P-20): guarda `deletedAt`. No borra tableros, actividades ni participantes. El proyecto deja de aparecer en los listados y sus tableros y actividades dejan de ser accesibles (el acceso por tablero/actividad resuelve el proyecto y lo trata como inexistente).

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `204` | Eliminado | Sin cuerpo. |
| `400` | `projectId` no es UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | No es Administrador, Decano ni Encargado de área del proyecto | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | No existe, ya está eliminado o no puede verlo | `{ message: "Proyecto no encontrado." }` |

## Participantes

Los participantes son registros de `ProjectMember`. La salida de un participante **no lo borra**: queda `INACTIVE` con `leftAt` (RN-38, P-25), por lo que el historial se conserva. Solo se muestran por defecto los `ACTIVE`.

`MemberResponseDto`:

```json
{
  "id": "00000000-0000-0000-0000-000000000020",
  "user": {
    "id": "00000000-0000-0000-0000-000000000030",
    "fullName": "Tutor de Ejemplo",
    "email": "tutor@example.test"
  },
  "projectRole": "TUTOR",
  "isPrimary": true,
  "status": "ACTIVE",
  "joinedAt": "2026-11-06T15:00:00.000Z",
  "leftAt": null
}
```

### `GET /api/projects/:projectId/members`

Cualquier usuario que pueda ver el proyecto. Por defecto solo participantes `ACTIVE`.

| Parámetro | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `includeInactive` | boolean (query) | No | `true` incluye también los `INACTIVE` con su `leftAt`. |

Orden: `status`, luego `projectRole`, luego `joinedAt` ascendente.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Correcto | `MemberResponseDto[]` (vacío si no hay participantes). |
| `400` | `projectId` no es UUID, o `includeInactive` no es booleano | `Validation failed (uuid is expected)` / `Validation failed (boolean string is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `404` | No existe, está eliminado o no puede verlo | `{ message: "Proyecto no encontrado." }` |

### `POST /api/projects/:projectId/members`

Da de alta a un participante. El permiso depende del rol solicitado:

| Rol solicitado | Permiso exigido |
| --- | --- |
| `TUTOR` | `manageTutors` (Administrador, Decano o Encargado de área). **El tutor no puede añadir tutores (`403`).** |
| `STUDENT` o `STUDENT_LEADER` con `isPrimary: false` | `manageStudents` (Administrador, Decano, Encargado de área o Tutor). |
| Cualquiera con `isPrimary: true` | `manageTutors`. |

### Cuerpo (`application/json`)

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `userId` | string (UUID) | Sí | El usuario debe existir y estar `ACTIVE`. |
| `projectRole` | string | Sí | `TUTOR`, `STUDENT` o `STUDENT_LEADER`. |
| `isPrimary` | boolean | No | Por defecto `false`. Solo puede ser `true` para un `TUTOR`. |

Además del usuario activo, se exige el **rol global** correspondiente:

| Rol de proyecto | Rol global requerido |
| --- | --- |
| `TUTOR` | `TUTOR` |
| `STUDENT` | `STUDENT` |
| `STUDENT_LEADER` | `STUDENT` |

Reglas de unicidad (todas responden `409`):

- Un usuario no puede tener dos registros `ACTIVE` en el mismo proyecto: `El usuario ya participa en este proyecto.`
- Un estudiante (incluido el líder) solo puede participar en **un proyecto activo**: `El estudiante ya participa en otro proyecto activo.`
- Como máximo un `STUDENT_LEADER` activo por proyecto: `El proyecto ya tiene un estudiante líder.`
- Como máximo un tutor principal activo por proyecto: `El proyecto ya tiene un tutor principal.`
- Si dos peticiones simultáneas chocan con un índice único parcial: `La operación entra en conflicto con otro participante del proyecto.`

```json
{ "userId": "00000000-0000-0000-0000-000000000030", "projectRole": "TUTOR", "isPrimary": true }
```

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `201` | Participante añadido | `MemberResponseDto`. |
| `400` | Datos inválidos, usuario inexistente/inactivo o sin el rol global requerido | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | Sin permiso para el rol solicitado (incluido `isPrimary: true`) | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Proyecto no visible | `{ message: "Proyecto no encontrado." }` |
| `409` | Duplicado o plaza única ocupada | `{ message: string }` con los mensajes indicados arriba. |

Mensajes de validación exactos:

- `userId debe ser un UUID.`
- `projectRole debe ser uno de: TUTOR, STUDENT, STUDENT_LEADER.`
- `isPrimary debe ser un booleano.`
- `Solo un tutor puede ser principal.`
- `El usuario no existe o está inactivo.`
- `El usuario debe tener el rol global TUTOR para participar como TUTOR.`
- `El usuario debe tener el rol global STUDENT para participar como STUDENT.` (o `... como STUDENT_LEADER.`)

### `PATCH /api/projects/:projectId/members/:memberId`

Solo modifica participantes `ACTIVE`; un participante inactivo responde `404 { message: "Participante no encontrado." }`.

| Campo | Tipo | Permiso | Reglas |
| --- | --- | --- | --- |
| `projectRole` | string | `manageStudents` | Solo `STUDENT` ↔ `STUDENT_LEADER`. El rol de un `TUTOR` no se puede cambiar (`400`; `403` si quien lo intenta no tiene `manageTutors`, p. ej. otro tutor). Un tutor sí cambia `STUDENT` ↔ `STUDENT_LEADER` (máximo un líder). Si pasa a `STUDENT_LEADER`, no debe existir otro líder activo (`409`). |
| `isPrimary` | boolean | `manageTutors` | Solo sobre un `TUTOR` (`400` en otro caso). Si es `true`, no debe existir otro tutor principal activo (`409`). |

Debe indicarse al menos un campo. Se pueden enviar ambos. No se puede cambiar `userId`, reactivar ni editar `status`/`leftAt`.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Actualizado | `MemberResponseDto`. |
| `400` | Datos inválidos, sin campos, rol de tutor inmutable, `isPrimary` sobre no tutor o plaza única ocupada | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | Sin el permiso del campo | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Proyecto no visible o participante inexistente/inactivo | `{ message: "Proyecto no encontrado." }` / `{ message: "Participante no encontrado." }` |
| `409` | Ya hay un líder o tutor principal activo, o conflicto de índice único | `{ message: string }` |

Mensajes de validación exactos: `projectRole solo puede cambiar entre STUDENT y STUDENT_LEADER.`, `Solo un tutor puede ser principal.`, `isPrimary debe ser un booleano.`, `Debe indicar al menos un campo para actualizar.`

### `DELETE /api/projects/:projectId/members/:memberId`

Retira al participante: lo marca `INACTIVE`, fija `leftAt` y pone `isPrimary` en `false`. No se borra el registro.

El permiso depende del rol del participante objetivo: `manageTutors` si es `TUTOR`, `manageStudents` en caso contrario.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `204` | Retirado | Sin cuerpo. |
| `400` | Identificador no UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | Sin permiso sobre ese tipo de participante | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Proyecto no visible o participante inexistente/inactivo | `{ message: "Proyecto no encontrado." }` / `{ message: "Participante no encontrado." }` |

## Reglas de participantes (resumen)

- **Un líder activo por proyecto** (P-03): `STUDENT_LEADER` es un rol de proyecto, no global.
- **Un tutor principal activo por proyecto** (P-05): solo un `TUTOR` puede ser `isPrimary`.
- **Un proyecto activo por estudiante** (P-25): aplica a `STUDENT` y `STUDENT_LEADER`; un tutor puede estar en varios.
- **Rol global requerido**: `TUTOR` global para ser tutor del proyecto; `STUDENT` global para estudiante o líder.
- **Salida con historial** (P-25): `INACTIVE` + `leftAt`; nunca se elimina el registro.
- **Rol de tutor inmutable**: no se puede convertir un tutor en estudiante ni viceversa desde este endpoint.

## Pendiente

- **Adjuntos de tipo `DOCUMENT`**: la API de actividades solo admite enlaces (`LINK`); cargar documentos requiere el módulo de documentos con S3 (ver [`boards.md`](boards.md#pendiente)).
- **Notificaciones**: no se notifica al participante añadido, retirado o cambiado de rol (P-16).
- **Historial de aprobaciones**: no existe; solo se guarda el estado actual (ver [`boards.md`](boards.md#pendiente)).
- **Paginación y filtros**: `GET /api/projects` y `GET /api/projects/:projectId/members` no paginan ni filtran (por área, facultad, estado, rol o texto). Tampoco hay endpoint de proyectos por facultad o área.
- **Reactivación del registro anterior**: se puede volver a dar de alta al mismo usuario (nuevo registro `ACTIVE`), pero no hay endpoint para reactivar el registro inactivo.
- **Permisos de `AREA_MANAGER`**: no participan en la resolución de acceso a proyectos.
- **Transiciones de estado del proyecto**: el código acepta cualquier cambio entre `ACTIVE`, `FINISHED` y `CANCELLED`; las reglas de negocio no están definidas.
- **Documentación desactualizada**: `AGENTS.md` §2 y el encabezado de `docs/domain/roles-permissions.md` siguen diciendo que la autorización por proyecto no está implementada.

## `GET /api/projects/tutored`

> Contrato aprobado ([ADR 0010](../decisions/0010-reglas-pendientes-resueltas.md) §9). **Estado:** implementado (`projects.controller.ts`, `ProjectsService.tutored`), cubierto por pruebas unitarias (`services/projects.service.spec.ts`) y e2e (`test/projects.e2e-spec.ts`).

Proyectos **no eliminados** en los que el usuario actual es participante `ACTIVE` con rol de proyecto `TUTOR`, ordenados por título. Requiere sesión válida; un usuario sin tutorías recibe `[]`.

`200`:

```json
[{ "id": "uuid", "title": "Proyecto demo de semillero", "status": "ACTIVE", "isPrimaryTutor": true }]
```

| Código | Cuándo |
| --- | --- |
| `401` | Sin sesión |
