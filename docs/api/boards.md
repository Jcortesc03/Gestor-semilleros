# API de tableros y actividades

> **Estado:** implementado en `apps/backend/src/modules/boards/` y cubierto por `apps/backend/test/boards.e2e-spec.ts`. Los parsers de entrada tienen además pruebas unitarias (`dtos/*.spec.ts`).
> Proyectos y participantes: [`projects.md`](projects.md). Autenticación: [`auth.md`](auth.md). Reglas de negocio: [`business-rules.md`](../domain/business-rules.md).

Todas las rutas requieren una sesión válida (cookie de Auth.js). El prefijo global es `/api`.

Un **tablero** pertenece a un proyecto y tiene un tutor responsable y un estudiante encargado. Una **actividad** pertenece a un tablero y tiene autor, progreso, resultado opcional, estado de aprobación, encargados y adjuntos (RN-45, P-11, P-12, P-14). Progreso (`PENDING`, `IN_PROGRESS`, `DONE`, `CANCELLED`) y resultado (`SUCCESS`, `FAILURE`) son independientes; la aprobación es un tercer estado (`PENDING`, `APPROVED`, `REJECTED`).

## Acceso

El acceso al proyecto se resuelve con las mismas reglas que en [`projects.md`](projects.md#acceso-y-visibilidad) (Administrador, Decano vigente de una facultad del proyecto, Encargado de área del área del proyecto o participante activo).

Si el tablero no existe, está eliminado lógicamente, su proyecto está eliminado o el usuario no puede ver el proyecto, la respuesta es **`404 { message: "Tablero no encontrado." }`**. Para actividades es **`404 { message: "Actividad no encontrada." }`**. Los endpoints que reciben `projectId` (`/api/projects/:projectId/boards`) responden **`404 { message: "Proyecto no encontrado." }`**. Los permisos insuficientes sobre un recurso visible responden **`403 { message: "No tienes permisos para realizar esta acción." }`**.

### Quién puede hacer qué

| Acción | Permiso | Roles |
| --- | --- | --- |
| Crear, editar y eliminar tableros | `can.manageBoards` | Administrador o Tutor del proyecto. |
| Ver tableros | Acceso al proyecto | Cualquier participante activo, Decano o Administrador. Los estudiantes ven todos los tableros del proyecto, no solo los suyos. |
| Crear, editar y eliminar actividades; gestionar encargados | `can.manageActivities` | Administrador, Tutor o Estudiante líder. |
| Ver actividades | Acceso al tablero | Cualquier usuario que pueda ver el tablero; no se filtra por encargado. |
| Cambiar el progreso de una actividad | `manageActivities` **o** ser encargado | El encargado solo puede fijar `PENDING`, `IN_PROGRESS` o `DONE`; `CANCELLED` queda reservado a quien gestiona. |
| Fijar el resultado (`result`) | `can.review` | Administrador o Tutor del proyecto. |
| Aprobar o rechazar | `can.review` | Administrador o Tutor del proyecto. |
| Añadir o quitar enlaces adjuntos | `manageActivities` **o** ser encargado | — |

Un Estudiante líder gestiona actividades y encargados, pero **no** puede fijar el resultado ni aprobar. Un estudiante no encargado solo puede leer.

## Endpoints

| Método y ruta | Permiso | Código de éxito |
| --- | --- | --- |
| `POST /api/projects/:projectId/boards` | `manageBoards` | `201` |
| `GET /api/projects/:projectId/boards` | Ver el proyecto | `200` |
| `GET /api/boards/:boardId` | Ver el tablero | `200` |
| `PATCH /api/boards/:boardId` | `manageBoards` | `200` |
| `DELETE /api/boards/:boardId` | `manageBoards` | `204` |
| `POST /api/boards/:boardId/activities` | `manageActivities` | `201` |
| `GET /api/boards/:boardId/activities` | Ver el tablero | `200` |
| `GET /api/activities/:activityId` | Ver la actividad | `200` |
| `PATCH /api/activities/:activityId` | Según el campo (ver abajo) | `200` |
| `DELETE /api/activities/:activityId` | `manageActivities` | `204` |
| `POST /api/activities/:activityId/approval` | `review` | `200` |
| `POST /api/activities/:activityId/assignees` | `manageActivities` | `201` |
| `DELETE /api/activities/:activityId/assignees/:userId` | `manageActivities` | `200` (devuelve la actividad) |
| `POST /api/activities/:activityId/attachments` | `manageActivities` o encargado | `201` |
| `DELETE /api/activities/:activityId/attachments/:attachmentId` | `manageActivities` o encargado | `200` (devuelve la actividad) |

Los cuerpos de error de validación son `{ message: "Datos inválidos.", errors: string[] }`. En el resto de errores se documenta el `message`; NestJS añade `statusCode` y `error` a la respuesta. Un identificador de ruta que no sea UUID responde `400` con `Validation failed (uuid is expected)`.

## Tableros

### `POST /api/projects/:projectId/boards`

Solo `manageBoards` (Administrador o Tutor del proyecto).

#### Cuerpo (`application/json`)

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `title` | string | Sí | Se recortan los espacios; entre 1 y 200 caracteres. |
| `dueDate` | string (`YYYY-MM-DD`) | Sí | Fecha válida. |
| `responsibleTutorId` | string (UUID) | Sí | Debe ser participante `ACTIVE` con rol de proyecto `TUTOR`. |
| `responsibleStudentId` | string (UUID) | Sí | Debe ser participante `ACTIVE` con rol `STUDENT` o `STUDENT_LEADER`. No tiene que ser el líder. |

El tablero se crea con `progressStatus: PENDING` y `result: null`.

```json
{
  "title": "Entrega del protocolo",
  "dueDate": "2026-12-01",
  "responsibleTutorId": "00000000-0000-0000-0000-000000000030",
  "responsibleStudentId": "00000000-0000-0000-0000-000000000031"
}
```

#### Respuestas

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `201` | Tablero creado | `BoardResponseDto` (ver abajo). |
| `400` | Datos inválidos, o los responsables no son participantes activos con el rol exigido | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | El usuario no es Administrador ni Tutor del proyecto | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Proyecto no visible | `{ message: "Proyecto no encontrado." }` |

Mensajes de validación exactos:

- `El cuerpo debe ser un objeto JSON.`
- `Campos no permitidos: campo1, campo2.`
- `title es obligatorio.`
- `title admite como máximo 200 caracteres.`
- `dueDate es obligatorio.`
- `dueDate debe tener formato AAAA-MM-DD.`
- `responsibleTutorId es obligatorio.`
- `responsibleStudentId es obligatorio.`
- `responsibleTutorId debe ser un UUID válido.`
- `responsibleStudentId debe ser un UUID válido.`
- `responsibleTutorId debe ser un participante activo del proyecto con rol TUTOR.`
- `responsibleStudentId debe ser un participante activo del proyecto con rol STUDENT o STUDENT_LEADER.`

#### `BoardResponseDto`

```json
{
  "id": "00000000-0000-0000-0000-000000000040",
  "projectId": "00000000-0000-0000-0000-000000000010",
  "title": "Entrega del protocolo",
  "dueDate": "2026-12-01",
  "progressStatus": "PENDING",
  "result": null,
  "responsibleTutor": { "id": "00000000-0000-0000-0000-000000000030", "fullName": "Tutor de Ejemplo" },
  "responsibleStudent": { "id": "00000000-0000-0000-0000-000000000031", "fullName": "Estudiante de Ejemplo" },
  "activityCount": 0,
  "createdAt": "2026-11-06T15:00:00.000Z"
}
```

`activityCount` cuenta las actividades no eliminadas del tablero.

### `GET /api/projects/:projectId/boards`

Cualquier usuario que pueda ver el proyecto. Devuelve los tableros no eliminados ordenados por `dueDate` y luego `createdAt`, ambos ascendentes.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Correcto | `BoardResponseDto[]` (vacío si no hay tableros). |
| `400` | `projectId` no es UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `404` | Proyecto no visible | `{ message: "Proyecto no encontrado." }` |

### `GET /api/boards/:boardId`

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | El usuario puede ver el tablero | `BoardResponseDto`. |
| `400` | `boardId` no es UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `404` | No existe, está eliminado, su proyecto está eliminado o el usuario no puede verlo | `{ message: "Tablero no encontrado." }` |

### `PATCH /api/boards/:boardId`

Solo `manageBoards` (Administrador o Tutor del proyecto).

#### Cuerpo (`application/json`)

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `title` | string | Se recortan los espacios; entre 1 y 200 caracteres. |
| `dueDate` | string (`YYYY-MM-DD`) | Fecha válida. |
| `progressStatus` | string | `PENDING`, `IN_PROGRESS`, `DONE` o `CANCELLED`. |
| `result` | string \| null | `SUCCESS`, `FAILURE` o `null` para borrarlo. |
| `responsibleTutorId` | string (UUID) | Debe ser participante `ACTIVE` con rol `TUTOR`. |
| `responsibleStudentId` | string (UUID) | Debe ser participante `ACTIVE` con rol `STUDENT` o `STUDENT_LEADER`. |

Debe indicarse al menos un campo. Los responsables solo se validan si se envían.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Actualizado | `BoardResponseDto`. |
| `400` | Datos inválidos, sin campos o responsable no válido | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | No es Administrador ni Tutor del proyecto | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Tablero no visible | `{ message: "Tablero no encontrado." }` |

Mensajes de validación adicionales: `progressStatus no es válido. Valores permitidos: PENDING, IN_PROGRESS, DONE, CANCELLED.`, `result no es válido. Valores permitidos: SUCCESS, FAILURE.`, `Debe indicar al menos un campo para actualizar.`

### `DELETE /api/boards/:boardId`

Eliminación **lógica** (P-20): guarda `deletedAt`. Las actividades del tablero dejan de ser accesibles y no se cuentan en `activityCount`. No se borran físicamente.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `204` | Eliminado | Sin cuerpo. |
| `400` | `boardId` no es UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | No es Administrador ni Tutor del proyecto | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Tablero no visible o ya eliminado | `{ message: "Tablero no encontrado." }` |

## Actividades

### `POST /api/boards/:boardId/activities`

Solo `manageActivities` (Administrador, Tutor o Estudiante líder).

#### Cuerpo (`application/json`)

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `title` | string | Sí | Se recortan los espacios; entre 1 y 200 caracteres. |
| `description` | string \| null | No | Máximo 5000 caracteres. Vacía o `null` se guarda como `null`. |

La actividad se crea con `progressStatus: PENDING`, `result: null`, `approvalStatus: PENDING`, `approvedBy: null`, sin encargados ni adjuntos. El autor es el usuario de la sesión.

```json
{ "title": "Redactar la introducción", "description": "Máximo dos páginas." }
```

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `201` | Actividad creada | `ActivityResponseDto` (ver abajo). |
| `400` | Datos inválidos | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | Sin `manageActivities` | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Tablero no visible | `{ message: "Tablero no encontrado." }` |

Mensajes de validación exactos: `El cuerpo debe ser un objeto JSON.`, `Campos no permitidos: campo1, campo2.`, `title es obligatorio.`, `title admite como máximo 200 caracteres.`, `description debe ser texto.`, `description admite como máximo 5000 caracteres.`

#### `ActivityResponseDto`

```json
{
  "id": "00000000-0000-0000-0000-000000000050",
  "boardId": "00000000-0000-0000-0000-000000000040",
  "title": "Redactar la introducción",
  "description": "Máximo dos páginas.",
  "progressStatus": "PENDING",
  "result": null,
  "approvalStatus": "PENDING",
  "approvedBy": null,
  "approvedAt": null,
  "author": { "id": "00000000-0000-0000-0000-000000000030", "fullName": "Tutor de Ejemplo" },
  "assignees": [],
  "attachments": [],
  "createdAt": "2026-11-06T15:00:00.000Z",
  "updatedAt": "2026-11-06T15:00:00.000Z"
}
```

Los encargados se ordenan por `assignedAt` y los adjuntos por `createdAt`, ambos ascendentes. `author`, `approvedBy` y los usuarios de encargados/adjuntos se devuelven como `{ id, fullName }`.

### `GET /api/boards/:boardId/activities`

Cualquier usuario que pueda ver el tablero. Devuelve las actividades no eliminadas ordenadas por `createdAt` ascendente. No se filtra por encargado.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Correcto | `ActivityResponseDto[]` (vacío si no hay actividades). |
| `400` | `boardId` no es UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `404` | Tablero no visible | `{ message: "Tablero no encontrado." }` |

### `GET /api/activities/:activityId`

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | El usuario puede ver la actividad | `ActivityResponseDto`. |
| `400` | `activityId` no es UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `404` | No existe, está eliminada, su tablero o proyecto está eliminado, o el usuario no puede verla | `{ message: "Actividad no encontrada." }` |

### `PATCH /api/activities/:activityId`

Actualización parcial con permisos **por campo**:

| Campo | Tipo | Permiso | Reglas |
| --- | --- | --- | --- |
| `title` | string | `manageActivities` | Entre 1 y 200 caracteres. |
| `description` | string \| null | `manageActivities` | Máximo 5000 caracteres; vacía o `null` se guarda como `null`. |
| `progressStatus` | string | `manageActivities` **o** encargado | `PENDING`, `IN_PROGRESS`, `DONE` o `CANCELLED`. El encargado solo puede usar las tres primeras. |
| `result` | string \| null | `review` | `SUCCESS`, `FAILURE` o `null` para borrarlo. |

Si `progressStatus` cambia a un valor distinto de `DONE` y la aprobación era `APPROVED` o `REJECTED`, la aprobación vuelve a `PENDING` y se limpian `approvedBy` y `approvedAt`. Debe indicarse al menos un campo. Si se envían varios, se exige el permiso de **todos**. Si un encargado envía `progressStatus: CANCELLED` junto con un campo que no puede editar, la petición falla con `403`.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Actualizado | `ActivityResponseDto`. |
| `400` | Datos inválidos o sin campos | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | Falta el permiso de algún campo enviado | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Actividad no visible | `{ message: "Actividad no encontrada." }` |

Mensajes de validación adicionales: `progressStatus no es válido. Valores permitidos: PENDING, IN_PROGRESS, DONE, CANCELLED.`, `result no es válido. Valores permitidos: SUCCESS, FAILURE.`, `Debe indicar al menos un campo para actualizar.`

### `POST /api/activities/:activityId/approval`

Registra la aprobación del tutor (RN-49, P-12). Solo `review`: Administrador o **cualquier tutor activo** del proyecto.

#### Cuerpo (`application/json`)

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `status` | string | Sí | `PENDING`, `APPROVED` o `REJECTED`. |

- `PENDING`: reinicia la aprobación; deja `approvedBy` y `approvedAt` en `null`.
- `APPROVED` o `REJECTED`: guarda el usuario actual en `approvedBy` y la fecha actual en `approvedAt`.

Solo se conserva el estado actual: **no hay historial ni observaciones**. **Aprobar o rechazar exige que la actividad tenga `progressStatus: DONE`** (ADR 0010, sec. 5). Si una actividad `APPROVED` o `REJECTED` cambia a un progreso distinto de `DONE` (por `PATCH /api/activities/:activityId`), su aprobación vuelve a `PENDING` y se limpian `approvedBy` y `approvedAt` en la misma escritura. Reiniciar a `PENDING` siempre es posible.

```json
{ "status": "APPROVED" }
```

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Registrado | `ActivityResponseDto`. |
| `400` | Datos inválidos | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | No es Administrador ni Tutor del proyecto | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Actividad no visible | `{ message: "Actividad no encontrada." }` |
| `409` | `APPROVED`/`REJECTED` con progreso distinto de `DONE` | `{ message: "Solo se puede aprobar o rechazar una actividad con progreso Terminada (DONE)." }` |

Mensajes de validación exactos: `status es obligatorio.`, `status no es válido. Valores permitidos: PENDING, APPROVED, REJECTED.`

### `DELETE /api/activities/:activityId`

Solo `manageActivities`. Eliminación **lógica** (P-20): guarda `deletedAt`; la actividad desaparece de los listados y de `activityCount`.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `204` | Eliminada | Sin cuerpo. |
| `400` | `activityId` no es UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | Sin `manageActivities` | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Actividad no visible o ya eliminada | `{ message: "Actividad no encontrada." }` |

### Encargados

Puede haber **varios encargados** por actividad (P-10, RN-46). El encargado debe ser participante `ACTIVE` del proyecto con rol `STUDENT` o `STUDENT_LEADER`.

#### `POST /api/activities/:activityId/assignees`

Solo `manageActivities`.

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `userId` | string (UUID) | Sí | Participante activo del proyecto con rol `STUDENT` o `STUDENT_LEADER`. |

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `201` | Encargado añadido | `ActivityResponseDto` actualizada. |
| `400` | Datos inválidos o el usuario no es participante activo con el rol exigido | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | Sin `manageActivities` | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Actividad no visible | `{ message: "Actividad no encontrada." }` |
| `409` | El usuario ya es encargado | `{ message: "El usuario ya es encargado de esta actividad." }` |

Mensajes de validación exactos: `userId es obligatorio.`, `userId debe ser un UUID válido.`, `userId debe ser un participante activo del proyecto con rol STUDENT o STUDENT_LEADER.`

#### `DELETE /api/activities/:activityId/assignees/:userId`

Solo `manageActivities`. Devuelve la actividad actualizada con código `200` (no `204`).

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Encargado retirado | `ActivityResponseDto`. |
| `400` | Identificador no UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | Sin `manageActivities` | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Actividad no visible, o el usuario no era encargado | `{ message: "Actividad no encontrada." }` / `{ message: "El usuario no es encargado de esta actividad." }` |

### Adjuntos

Hoy solo se pueden crear adjuntos de tipo **`LINK`** mediante la API; `DOCUMENT` existe en el modelo pero requiere el módulo de documentos/S3. Cada adjunto es un enlace **o** un documento, nunca ambos (RN-49b).

#### `POST /api/activities/:activityId/attachments`

Permitido a `manageActivities` **o** a un encargado de la actividad.

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `url` | string | Sí | Se recorta; máximo 2048 caracteres; debe ser un enlace `http` o `https` válido. |

```json
{ "url": "https://example.test/documento.pdf" }
```

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `201` | Adjunto creado | `ActivityResponseDto` con el nuevo adjunto (`kind: "LINK"`, `documentId: null`). |
| `400` | Datos inválidos | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | No gestiona actividades ni es encargado | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Actividad no visible | `{ message: "Actividad no encontrada." }` |

Mensajes de validación exactos: `url es obligatoria.`, `url admite como máximo 2048 caracteres.`, `url debe ser un enlace http(s) válido.`

`AttachmentResponseDto` dentro de la actividad:

```json
{
  "id": "00000000-0000-0000-0000-000000000060",
  "kind": "LINK",
  "url": "https://example.test/documento.pdf",
  "documentId": null,
  "createdBy": { "id": "00000000-0000-0000-0000-000000000030", "fullName": "Tutor de Ejemplo" },
  "createdAt": "2026-11-06T15:00:00.000Z"
}
```

#### `DELETE /api/activities/:activityId/attachments/:attachmentId`

Permitido a `manageActivities` **o** a un encargado. Devuelve la actividad actualizada con código `200`.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Adjunto eliminado | `ActivityResponseDto`. |
| `400` | Identificador no UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | No gestiona actividades ni es encargado | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Actividad no visible, o el adjunto no existe en esa actividad | `{ message: "Actividad no encontrada." }` / `{ message: "Adjunto no encontrado." }` |

> **Caso límite:** si la actividad desaparece entre la comprobación y la recarga posterior a una escritura, `load()` responde `400 { message: "Actividad no encontrada." }`. Es una carrera muy improbable, no un estado normal.

## Errores comunes

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `400` | Cuerpo inválido, UUID de ruta inválido, sin campos que actualizar o responsable no participante | `{ message: "Datos inválidos.", errors: string[] }` o el mensaje del pipe. |
| `401` | Sin sesión, sesión expirada o usuario desactivado | `{ message: "Sesión no válida o expirada." }` |
| `403` | El recurso es visible pero falta el permiso | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Recurso inexistente, eliminado o proyecto no visible | `{ message: "Proyecto no encontrado." }`, `{ message: "Tablero no encontrado." }` o `{ message: "Actividad no encontrada." }` |
| `409` | Encargado duplicado o conflicto de unicidad | `{ message: "El usuario ya es encargado de esta actividad." }` |

## Pendiente

- **Adjuntos de tipo `DOCUMENT`**: no hay endpoint para subir documentos ni integrar S3. `ActivityAttachment` ya admite `kind: DOCUMENT` y `documentId`, pero crear uno requiere el módulo de documentos (P-14, P-15).
- **Notificaciones**: no se avisa al encargado asignado, al tutor que debe aprobar ni al autor de cambios de estado (P-16).
- **Historial de aprobaciones**: solo se guarda el estado actual con quién y cuándo (P-12); no hay historial ni observaciones/motivo de rechazo.
- **Paginación y filtros**: los listados de tableros y actividades no paginan ni filtran por estado, responsable, encargado, fecha o texto. No hay ordenación configurable.
- **Comentarios y otras interacciones** de estudiantes con actividades: no definidos (P-13).
- **Validación de transiciones** de progreso y resultado: el código acepta cualquier combinación de los valores permitidos.
- **Documentación desactualizada**: `AGENTS.md` §2 y `docs/domain/roles-permissions.md` siguen diciendo que la autorización por proyecto no está implementada.
