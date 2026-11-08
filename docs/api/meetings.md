# API de reuniones (Microsoft Teams)

> **Estado:** implementado en `apps/backend/src/modules/meetings/` (con la parte de Microsoft en `apps/backend/src/modules/integrations/`) y cubierto por `apps/backend/test/meetings.e2e-spec.ts`. Los parsers de entrada tienen pruebas unitarias (`dtos/meeting.dto.spec.ts`). Decisiones: [ADR 0007](../decisions/0007-reuniones-con-microsoft-teams.md) y [ADR 0014](../decisions/0014-cuentas-personales-de-microsoft.md) (`joinUrl` según el tipo de cuenta, implementado).
> Vinculación de la cuenta de Microsoft: [`microsoft.md`](microsoft.md). Avisos y preferencias: [`notification-preferences.md`](notification-preferences.md). Proyectos y participantes: [`projects.md`](projects.md). Autenticación: [`auth.md`](auth.md).

Todas las rutas requieren una sesión válida (cookie de Auth.js). El prefijo global es `/api`.

Una **reunión** se agenda en el calendario de Microsoft 365 del organizador con un enlace de Microsoft Teams, y los participantes reciben avisos por correo y WhatsApp según sus preferencias. El proyecto es **opcional** (P-18); los participantes son usuarios del sistema (RN-74).

Los cuerpos de error de validación son `{ message: "Datos inválidos.", errors: string[] }`. En el resto de errores se documenta el `message`; NestJS añade `statusCode` y `error` a la respuesta. Un `:id` que no sea UUID responde `400` con `Validation failed (uuid is expected)`.

## Endpoints

| Método y ruta | Permiso | Código de éxito |
| --- | --- | --- |
| `POST /api/meetings` | Rol `TUTOR` o `ADMIN`; con proyecto, tutor del proyecto o `ADMIN` | `201` |
| `GET /api/meetings` | Cualquier sesión válida (solo reuniones visibles) | `200` |
| `GET /api/meetings/:id` | Organizador, participante o `ADMIN` | `200` |
| `PATCH /api/meetings/:id/status` | Organizador o `ADMIN` | `200` |
| `PUT /api/meetings/:id/recording` | Organizador o `ADMIN` | `200` |

## Visibilidad

- **Administrador:** ve todas las reuniones no eliminadas.
- **Resto de usuarios:** solo las que organizan o en las que participan.
- Las reuniones de un proyecto eliminado dejan de ser visibles para los no administradores.
- Una reunión que el usuario no puede ver responde `404` (`Reunión no encontrada.`), también en las rutas de escritura, para no revelar su existencia. Si la ve pero no es organizador ni administrador, las rutas de escritura responden `403`.

## Respuesta de una reunión (`MeetingResponseDto`)

Todas las rutas devuelven este objeto (el listado, un arreglo de ellos). El identificador interno del evento de Teams no se expone.

```json
{
  "id": "5d0f6c3e-2a41-4c1b-9d57-0a1f6b9e7c10",
  "reason": "Revisión de avances",
  "startsAt": "2026-11-20T20:00:00.000Z",
  "endsAt": "2026-11-20T21:00:00.000Z",
  "durationMinutes": 60,
  "status": "SCHEDULED",
  "joinUrl": "https://teams.example.test/reunion-1",
  "recordingUrl": null,
  "cancelledAt": null,
  "project": { "id": "0b8e8a5c-6f2d-4a0e-8d3b-3f7c2d9a1e44", "title": "Proyecto de prueba" },
  "organizer": { "id": "a3c1d2e4-7b58-4f60-b1a9-9c0d4e5f6a71", "fullName": "Tutora de Prueba" },
  "participants": [
    { "id": "c7d8e9f0-1a2b-4c3d-8e4f-5a6b7c8d9e01", "fullName": "Líder de Prueba" },
    { "id": "d1e2f3a4-5b6c-4d7e-9f80-1a2b3c4d5e6f", "fullName": "Estudiante de Prueba" }
  ]
}
```

| Campo | Contenido |
| --- | --- |
| `startsAt`, `endsAt` | ISO 8601 en UTC. `endsAt` se calcula como `startsAt` + `durationMinutes` (no se guarda). |
| `status` | `SCHEDULED`, `IN_PROGRESS`, `FINISHED` o `CANCELLED` (ver [Estados](#estados-y-transiciones)). |
| `joinUrl` | Enlace de Teams. |
| `recordingUrl` | Enlace de evidencia de la grabación, o `null`. |
| `cancelledAt` | Momento de la cancelación manual, o `null`. |
| `project` | `{ id, title }`, o `null` si la reunión no tiene proyecto. |
| `participants` | Ordenados por nombre. No incluyen al organizador. |

## `POST /api/meetings`

Crea la reunión. Exige que el organizador tenga su cuenta de Microsoft vinculada ([`microsoft.md`](microsoft.md)).

### Permisos

1. Rol `TUTOR` o `ADMIN` (`RolesGuard`). Otro rol: `403`.
2. Con `projectId`, se resuelve el acceso al proyecto con `ProjectAccessService` (las mismas reglas que en [`projects.md`](projects.md#acceso-y-visibilidad)): el usuario debe ser `ADMIN` o **tutor del proyecto**. Un decano o un participante con otro rol del proyecto recibe `403`; quien no puede ver el proyecto, o si este no existe o está eliminado, recibe `404`.
3. Sin `projectId`, cualquier `TUTOR` o `ADMIN` puede invitar a usuarios activos del sistema.

### Cuerpo (`application/json`)

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `reason` | string | Sí | Motivo; se recorta y no puede quedar vacío. Máximo 200 caracteres. Es el asunto del evento de Teams. |
| `startsAt` | string | Sí | ISO 8601 **con zona** (`Z` o `±HH:MM`), p. ej. `2026-11-20T15:00:00-05:00`. Debe faltar al menos 1 minuto para que empiece. Se rechazan fechas inexistentes. |
| `durationMinutes` | entero | Sí | Entre 5 y 480. |
| `projectId` | string \| null | No | UUID del proyecto. Si se omite o es `null`, la reunión no tiene proyecto. |
| `participantIds` | array de UUID | Sí | De 1 a 100 UUID de usuarios. Los repetidos se unifican. |

Cualquier campo desconocido se rechaza.

Reglas sobre los participantes:

- El organizador se descarta si aparece en la lista (no se invita a sí mismo). Debe quedar al menos un participante.
- Todos deben ser usuarios **activos**.
- Con `projectId`, además deben ser **miembros activos del proyecto**.

Mensajes de validación exactos (`400`, acumulados en `errors`):

- `El cuerpo debe ser un objeto JSON.`
- `Campos no permitidos: campo1, campo2.`
- `reason es obligatorio (máximo 200 caracteres).`
- `startsAt debe ser una fecha y hora ISO 8601 con zona horaria, p. ej. 2026-11-20T15:00:00-05:00.`
- `startsAt debe ser una fecha futura.`
- `durationMinutes debe ser un entero entre 5 y 480.`
- `projectId debe ser un UUID.`
- `participantIds debe ser una lista de 1 a 100 UUID de usuarios.`

Mensajes de participantes (`400`, tras validar el cuerpo):

- `Indica al menos un participante distinto del organizador.`
- `Todos los participantes deben ser usuarios activos y miembros activos del proyecto.` (con proyecto)
- `Alguno de los participantes no existe o no está activo.` (sin proyecto)

### Enlace de la reunión según el tipo de cuenta ([ADR 0014](../decisions/0014-cuentas-personales-de-microsoft.md))

| Cuenta del organizador | `joinUrl` en el cuerpo | Resultado |
| --- | --- | --- |
| `WORK_OR_SCHOOL` | No se admite (`400`) | Evento con Teams; Microsoft genera el enlace |
| `PERSONAL` | **Obligatorio**: `https://…`, hasta 2048 caracteres (`400` si falta o no es válido) | Evento en Outlook sin reunión en línea, con el enlace en la ubicación y en el cuerpo; `joinUrl` se guarda tal cual |

### Ejemplo

```json
{
  "reason": "Revisión de avances",
  "startsAt": "2026-11-20T15:00:00-05:00",
  "durationMinutes": 60,
  "projectId": "0b8e8a5c-6f2d-4a0e-8d3b-3f7c2d9a1e44",
  "participantIds": [
    "c7d8e9f0-1a2b-4c3d-8e4f-5a6b7c8d9e01",
    "d1e2f3a4-5b6c-4d7e-9f80-1a2b3c4d5e6f"
  ]
}
```

Respuesta `201`: la reunión (ver arriba) con estado `SCHEDULED`.

### Respuestas

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `201` | Creada | `MeetingResponseDto`. |
| `400` | Cuerpo inválido o participantes no válidos | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | Sin rol `TUTOR`/`ADMIN`, o con proyecto sin ser su tutor | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | El proyecto no existe, está eliminado o el usuario no puede verlo | `{ message: "Proyecto no encontrado." }` |
| `409` | El organizador no tiene cuenta de Microsoft vinculada | `Vincula tu cuenta de Microsoft antes de crear reuniones (GET /api/integrations/microsoft/connect).` |
| `409` | Microsoft revocó la vinculación (`invalid_grant`); se desvincula la cuenta | `Tu vinculación con Microsoft expiró o fue revocada; vuelve a vincular tu cuenta.` |
| `422` | La cuenta vinculada no genera enlace de Teams (cuenta personal o sin Teams) | `Microsoft no generó el enlace de Teams; la cuenta vinculada debe ser laboral o educativa con Teams.` (u otro `422` que devuelva Microsoft Graph) |
| `502` | Falló la llamada a Microsoft Graph | `No se pudo crear la reunión en Microsoft Teams; inténtalo de nuevo.` |
| `503` | La integración con Microsoft no está configurada | `La integración con Microsoft Teams no está configurada.` |
| `503` | No se pudo renovar el acceso a Microsoft | `No se pudo renovar el acceso a Microsoft; inténtalo más tarde.` |

### Flujo de creación

1. Se validan el cuerpo, los permisos y los participantes (nada se escribe aún).
2. **Primero Teams:** se crea el evento en el calendario del organizador con el enlace de Teams y los participantes como asistentes. Si Teams falla (`409`, `422`, `502`, `503`), **no se crea nada local**.
3. **Después la transacción local:** se guardan la reunión, los participantes y los avisos (invitación y recordatorios).
4. Si la transacción local falla, se **cancela el evento en Teams** con el comentario `No se pudo registrar la reunión en el Gestor de Semilleros.` y se propaga el error original.
5. Se lanza el despachador de avisos y se responde con la reunión.

El cuerpo del evento de Teams es el motivo seguido de `Reunión agendada desde el Gestor de Semilleros` y, si hay proyecto, ` para el proyecto <título>`.

## `GET /api/meetings`

Lista las reuniones visibles para el usuario (ver [Visibilidad](#visibilidad)), ordenadas por `startsAt` ascendente. Antes de leer se aplican los cambios de estado por horario.

### Consulta

| Parámetro | Reglas |
| --- | --- |
| `status` | `SCHEDULED`, `IN_PROGRESS`, `FINISHED` o `CANCELLED`. |
| `from` | Fecha ISO 8601; incluye las reuniones con `startsAt` desde ese momento. |
| `to` | Fecha ISO 8601; incluye las reuniones con `startsAt` hasta ese momento. No puede ser anterior a `from`. |
| `limit` | Entero entre 1 y 100. Por defecto 50. |

Cualquier otro parámetro se rechaza.

Mensajes de validación exactos (`400`):

- `Campos no permitidos: campo1, campo2.`
- `status no es válido. Valores permitidos: SCHEDULED, IN_PROGRESS, FINISHED, CANCELLED.`
- `from debe ser una fecha ISO 8601.`
- `to debe ser una fecha ISO 8601.`
- `to no puede ser anterior a from.`
- `limit debe ser un entero entre 1 y 100.`

### Respuestas

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Correcto | Arreglo de `MeetingResponseDto` (vacío si no hay). |
| `400` | Consulta inválida | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |

## `GET /api/meetings/:id`

Devuelve una reunión visible, con el estado ya actualizado por horario.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Correcto | `MeetingResponseDto`. |
| `400` | `:id` no es UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `404` | No existe o el usuario no puede verla | `{ message: "Reunión no encontrada." }` |

## `PATCH /api/meetings/:id/status`

Cambio **manual** de estado. Solo el organizador o un `ADMIN`.

### Cuerpo (`application/json`)

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `status` | string | Sí | `IN_PROGRESS`, `FINISHED` o `CANCELLED`. No se puede volver a `SCHEDULED`. |
| `comment` | string \| null | No | Motivo de la cancelación. Se recorta; máximo 500 caracteres; vacío equivale a `null`. Solo se usa al cancelar. |

Cualquier campo desconocido se rechaza. Mensajes de validación exactos (`400`):

- `El cuerpo debe ser un objeto JSON.`
- `Campos no permitidos: campo1, campo2.`
- `status debe ser IN_PROGRESS, FINISHED o CANCELLED.`
- `comment admite como máximo 500 caracteres.`

### Respuestas

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Estado cambiado | `MeetingResponseDto`; si se canceló, además `teamsSynced`. |
| `400` | Cuerpo inválido o `:id` no UUID | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | Puede verla, pero no es organizador ni `ADMIN` | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | No existe o el usuario no puede verla | `{ message: "Reunión no encontrada." }` |
| `409` | Transición no permitida | `No se puede pasar una reunión de <Estado> a <Estado>.` |

Etiquetas de estado en el mensaje `409`: `Programada`, `En proceso`, `Finalizada`, `Cancelada`. Ejemplo: `No se puede pasar una reunión de Finalizada a Cancelada.`

### Cancelación

Al cancelar (`status: "CANCELLED"`):

1. Se cancela el evento en Teams con el `comment` (o `Reunión cancelada.` si no hay), lo que avisa a los invitados en su calendario. Si la reunión no tiene evento asociado, se considera sincronizada.
2. En una transacción local se marca la reunión como `CANCELLED` con `cancelledAt`, se **anulan todos los envíos pendientes** de la reunión (invitación y recordatorios pasan a `SKIPPED` con `Reunión cancelada.`) y se encola el aviso de cancelación para los participantes.
3. La respuesta añade `teamsSynced`: `true` si Teams quedó cancelado, `false` si no se pudo (p. ej. cuenta desvinculada o Microsoft caído). **La cancelación local se mantiene aunque `teamsSynced` sea `false`**; el fallo solo se registra en el log del servidor.

```json
{
  "id": "5d0f6c3e-2a41-4c1b-9d57-0a1f6b9e7c10",
  "reason": "Revisión de avances",
  "startsAt": "2026-11-20T20:00:00.000Z",
  "endsAt": "2026-11-20T21:00:00.000Z",
  "durationMinutes": 60,
  "status": "CANCELLED",
  "joinUrl": "https://teams.example.test/reunion-1",
  "recordingUrl": null,
  "cancelledAt": "2026-11-06T17:30:00.000Z",
  "project": { "id": "0b8e8a5c-6f2d-4a0e-8d3b-3f7c2d9a1e44", "title": "Proyecto de prueba" },
  "organizer": { "id": "a3c1d2e4-7b58-4f60-b1a9-9c0d4e5f6a71", "fullName": "Tutora de Prueba" },
  "participants": [
    { "id": "c7d8e9f0-1a2b-4c3d-8e4f-5a6b7c8d9e01", "fullName": "Líder de Prueba" },
    { "id": "d1e2f3a4-5b6c-4d7e-9f80-1a2b3c4d5e6f", "fullName": "Estudiante de Prueba" }
  ],
  "teamsSynced": true
}
```

Los cambios a `IN_PROGRESS` y `FINISHED` no tocan Teams ni envían avisos y no incluyen `teamsSynced`.

## `PUT /api/meetings/:id/recording`

Registra, reemplaza o borra el **enlace de evidencia** de la grabación. Es opcional: la grabación no se obtiene de Teams. Solo el organizador o un `ADMIN`.

### Cuerpo (`application/json`)

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `recordingUrl` | string \| null | Sí | URL absoluta `http` o `https` de hasta 2000 caracteres. `null` borra el enlace. |

Mensajes de validación exactos (`400`):

- `El cuerpo debe ser un objeto JSON.`
- `Campos no permitidos: campo1, campo2.`
- `recordingUrl debe ser una URL http(s) válida o null.` (también si el campo falta)

```json
{ "recordingUrl": "https://stream.example.test/grabacion" }
```

### Respuestas

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Guardado | `MeetingResponseDto` con `recordingUrl` actualizado. |
| `400` | Cuerpo inválido o `:id` no UUID | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | Puede verla, pero no es organizador ni `ADMIN` | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | No existe o el usuario no puede verla | `{ message: "Reunión no encontrada." }` |
| `409` | La reunión está cancelada | `No se puede registrar la grabación de una reunión cancelada.` |

Se admite en cualquier estado salvo `CANCELLED`.

## Estados y transiciones

| Estado | Significado |
| --- | --- |
| `SCHEDULED` | Programada. Estado inicial. |
| `IN_PROGRESS` | En proceso. |
| `FINISHED` | Finalizada. Estado final. |
| `CANCELLED` | Cancelada. Estado final. |

### Automáticas por horario

Antes de cada lectura (`GET`, listado y cambios de estado) se ejecuta `syncStatuses`, con dos actualizaciones sobre las reuniones no eliminadas:

1. `SCHEDULED` o `IN_PROGRESS` cuyo fin (`startsAt` + `durationMinutes`) ya pasó pasan a `FINISHED`.
2. `SCHEDULED` cuya hora de inicio ya pasó pasan a `IN_PROGRESS`.

No hay un proceso en segundo plano: el estado se actualiza al consultar. `CANCELLED` y `FINISHED` nunca cambian por horario. Las automáticas no envían avisos.

### Manuales (organizador o `ADMIN`)

| Desde \ Hacia | `IN_PROGRESS` | `FINISHED` | `CANCELLED` |
| --- | --- | --- | --- |
| `SCHEDULED` | Permitido | No (`409`) | Permitido |
| `IN_PROGRESS` | No (`409`) | Permitido | Permitido |
| `FINISHED` | No (`409`) | No (`409`) | No (`409`) |
| `CANCELLED` | No (`409`) | No (`409`) | No (`409`) |

## Avisos

Los avisos usan la bandeja de salida de [`notification-preferences.md`](notification-preferences.md#envío-de-copias), con tipo `MEETING`, y respetan las preferencias de cada usuario por canal (por defecto, correo sí y WhatsApp no). Una reunión no avisa a quien tenga el tipo `MEETING` desactivado en un canal, ni a usuarios inactivos.

| Aviso (`purpose`) | Destinatarios | Cuándo se envía | Vence |
| --- | --- | --- | --- |
| `MEETING_INVITATION` | Participantes | Inmediatamente al crear | Al empezar la reunión |
| `MEETING_REMINDER` (24 h) | Participantes y organizador | 24 h antes del inicio | Al empezar la reunión |
| `MEETING_REMINDER` (1 h) | Participantes y organizador | 1 h antes del inicio | Al empezar la reunión |
| `MEETING_CANCELLATION` | Participantes | Al cancelar | Al terminar la reunión (`startsAt` + duración) |

- Los recordatorios solo se programan si su hora **todavía está en el futuro** al crear: una reunión que empieza en 30 minutos tiene solo la invitación.
- Un aviso que no llegó a enviarse antes de su vencimiento se descarta (`SKIPPED`) con `El aviso dejó de ser vigente antes de poder enviarse.`
- Al cancelar se anulan los envíos pendientes (invitación y recordatorios) y se envía el aviso de cancelación, **sin enlace de Teams**.
- El organizador no recibe la invitación ni la cancelación (las inicia él), pero sí los recordatorios.

### Formato de los mensajes

La fecha se muestra en español (`es-CO`, fecha completa y hora corta) en la zona horaria de `MEETINGS_TIME_ZONE` (IANA; por defecto `America/Bogota`), y la zona se indica entre paréntesis. Un valor no válido impide arrancar el backend.

| Aviso | Asunto | Primera línea del cuerpo |
| --- | --- | --- |
| Invitación | `[Reunión] <motivo>` | `Te invitaron a una reunión.` |
| Recordatorio 24 h | `[Recordatorio] <motivo> (mañana)` | `La reunión empieza mañana.` |
| Recordatorio 1 h | `[Recordatorio] <motivo> (en 1 hora)` | `La reunión empieza en 1 hora.` |
| Cancelación | `[Reunión cancelada] <motivo>` | `La reunión fue cancelada.` (y `Motivo: <comentario>` si lo hay) |

Tras la primera línea, el cuerpo lista los detalles y cierra con `Gestor de Semilleros`:

```text
Fecha: <fecha completa y hora> (America/Bogota)
Duración: 60 minutos
Organiza: <nombre del organizador>
Proyecto: <título>            (solo si hay proyecto)
Enlace de Teams: <url>        (no se incluye en la cancelación)
```

## Grabación

La grabación es **opcional** y manual: el organizador (o un administrador) pega un enlace de evidencia con `PUT /api/meetings/:id/recording`. El backend no la descarga ni la guarda; solo conserva la URL.

## Pendiente

- **Reprogramar o editar** una reunión (fecha, duración, motivo) y **modificar participantes** después de crearla: no hay endpoints; hoy solo se puede cancelar y crear otra.
- **Sincronizar cambios hechos en Teams** (P-18): si el organizador mueve o cancela el evento desde Outlook o Teams, el Gestor no se entera. La sincronización va solo del Gestor hacia Teams.
- **Obtener la grabación automáticamente** desde Teams: hoy solo se registra el enlace a mano.
- **Asistencia**: no se registra quién asistió.
