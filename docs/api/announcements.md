# API de novedades y notificaciones

> **Estado:** implementado en `apps/backend/src/modules/notifications/` y cubierto por `apps/backend/test/notifications.e2e-spec.ts`. Los parsers y el cálculo de permisos tienen además pruebas unitarias (`dtos/announcement.dto.spec.ts`, `models/publish-scope.spec.ts`). Decisión: [ADR 0005](../decisions/0005-notificaciones-y-copias-externas.md).
> Preferencias y envío de copias: [`notification-preferences.md`](notification-preferences.md). Autenticación: [`auth.md`](auth.md). Proyectos y visibilidad: [`projects.md`](projects.md). Reglas de negocio: [`business-rules.md`](../domain/business-rules.md).

Todas las rutas requieren una sesión válida (cookie de Auth.js). El prefijo global es `/api`.

Una **novedad** es una noticia, un comunicado, un cambio o una notificación (`NEWS`, `COMMUNICATION`, `CHANGE`, `NOTIFICATION`; P-16: la notificación es un tipo de novedad). Se publica para una o varias audiencias (`ALL`, `ROLE`, `FACULTY`, `AREA`, `PROJECT`) y se guarda con `publishedAt` igual al momento de crearla. La eliminación es **lógica** (`deletedAt`): la novedad deja de ser visible y se cancelan sus copias pendientes.

La definición de la audiencia se guarda con la novedad, pero la **pertenencia** de cada usuario se calcula al consultar, tanto para el feed como para los destinatarios de las copias (RN-53, RN-54).

## Acceso y visibilidad

### Quién puede publicar

`POST /api/announcements` exige, con `RolesGuard`, uno de los roles globales `ADMIN`, `AREA_MANAGER`, `DEAN` o `TUTOR`. Después, `AnnouncementsService` aplica `models/publish-scope.ts` con los cargos **vigentes** del usuario (ADR 0010, sección 8):

| Audiencia | Quién puede usarla |
| --- | --- |
| `ALL` | Solo administrador. |
| `ROLE` | Administrador, o encargado de área (cualquier rol global; ADR 0010, sección 9). |
| `AREA` | Administrador, o encargado de área **de esa área** (`area_managers`). |
| `FACULTY` | Administrador, o decano **vigente** de esa facultad (`faculty_deans` con `endsAt = null`). |
| `PROJECT` | Administrador; decano de alguna facultad del proyecto; o tutor **activo** del proyecto (membresía `ACTIVE` con rol de proyecto `TUTOR`). Siempre que el proyecto no esté eliminado. |

| Tipo (`kind`) | Quién puede usarlo |
| --- | --- |
| `NOTIFICATION` | Administrador o decano (P-16, RN-93). |
| `NEWS`, `COMMUNICATION`, `CHANGE` | Administrador, decano, encargado de área o tutor. |

Los roles se suman (P-02): un usuario que sea, por ejemplo, `DEAN` y `AREA_MANAGER` acumula los permisos de ambos. Un encargado de área publica para `AREA` de sus áreas y para `ROLE`, pero **no** para `ALL`, `FACULTY` ni `PROJECT`. Un tutor solo publica `PROJECT` de sus proyectos: no puede publicar para `FACULTY`, `AREA`, `ALL` ni `ROLE`, ni el tipo `NOTIFICATION`. Tampoco puede publicar en `PROJECT` de proyectos donde no es tutor activo, aunque sean de su misma área.

Antes de comprobar los permisos, el servicio valida que existan las facultades, áreas y proyectos que quedan tras normalizar las audiencias. Por eso, si el destino no existe, la respuesta es `400` aunque el usuario tampoco tuviera permiso para usarlo.

### Visibilidad del feed

`AudienceService.visibleWhere` decide qué novedades ve cada usuario. Siempre se excluyen las eliminadas lógicamente.

| Usuario | Novedades que ve |
| --- | --- |
| `ADMIN` | **Todas** las no eliminadas, sin filtrar por audiencia. |
| Autor | Siempre ve las que publicó, aunque ya no pertenezca a la audiencia. |
| Resto | Las que tienen alguna audiencia que le corresponde. |

Una audiencia corresponde al usuario así:

| Audiencia | Quién la cumple |
| --- | --- |
| `ALL` | Cualquier usuario. |
| `ROLE` | El usuario tiene ese rol global (`user_roles`). |
| `FACULTY` | Es decano vigente de la facultad **o** participante `ACTIVE` de un proyecto no eliminado de esa facultad. |
| `AREA` | Es encargado del área (`area_managers`) **o** participante `ACTIVE` de un proyecto no eliminado de esa área. |
| `PROJECT` | Es participante `ACTIVE` del proyecto, y el proyecto no está eliminado. |

La pertenencia es una **unión**: basta con cumplir una audiencia de la novedad. Los roles de proyecto no cuentan como roles globales para `ROLE`.

### Códigos de error de acceso

- Si la novedad no existe, está eliminada o el usuario no puede verla: **`404 { message: "Novedad no encontrada." }`**. Así no se revela la existencia de novedades ajenas.
- Si la novedad es visible pero el usuario no es su autor ni administrador (al eliminar o consultar los envíos): **`403 { message: "No tienes permisos para realizar esta acción." }`**.
- Sin sesión válida o con el usuario desactivado: **`401 { message: "Sesión no válida o expirada." }`**.

## Endpoints

| Método y ruta | Permiso | Código de éxito |
| --- | --- | --- |
| `POST /api/announcements` | Rol global `ADMIN`, `AREA_MANAGER`, `DEAN` o `TUTOR`, y audiencia/tipo permitidos | `201` |
| `GET /api/announcements` | Cualquier sesión válida (filtrado por visibilidad) | `200` |
| `GET /api/announcements/:id` | Ver la novedad | `200` |
| `GET /api/announcements/:id/deliveries` | Autor o administrador | `200` |
| `DELETE /api/announcements/:id` | Autor o administrador | `204` |

Los cuerpos de error de validación son `{ message: "Datos inválidos.", errors: string[] }`. En el resto de errores se documenta el `message`; NestJS añade `statusCode` y `error` a la respuesta. Un identificador de ruta que no sea UUID responde `400` con `Validation failed (uuid is expected)`.

## `POST /api/announcements`

Publica una novedad y, en la misma transacción, encola las copias por correo y WhatsApp de sus destinatarios.

### Cuerpo (`application/json`)

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `kind` | string | No | `NEWS`, `COMMUNICATION`, `CHANGE` o `NOTIFICATION`. Por defecto `NEWS`. |
| `title` | string | Sí | Se recortan los espacios; entre 1 y 200 caracteres. |
| `content` | string | Sí | Se recortan los espacios; entre 1 y 5000 caracteres. |
| `audiences` | array | Sí | Entre 1 y 20 elementos (ver abajo). |

Cada elemento de `audiences` tiene un `type` y solo los campos de ese tipo:

| `type` | Campos permitidos | Reglas |
| --- | --- | --- |
| `ALL` | `type` | — |
| `ROLE` | `type`, `role` | `role` es un rol global: `ADMIN`, `AREA_MANAGER`, `DEAN`, `TUTOR` o `STUDENT`. |
| `FACULTY` | `type`, `facultyId` | UUID; la facultad debe existir. |
| `AREA` | `type`, `areaId` | UUID; el área debe existir. |
| `PROJECT` | `type`, `projectId` | UUID; el proyecto debe existir y no estar eliminado. |

Cualquier campo desconocido en el cuerpo o dentro de una audiencia se rechaza. Las audiencias se normalizan antes de guardarse:

- los duplicados (mismo tipo y mismo destino) se eliminan conservando el orden;
- si aparece `ALL`, el resultado es únicamente `[{ "type": "ALL" }]`, porque cubre a cualquier otra audiencia.

```json
{
  "kind": "NOTIFICATION",
  "title": "Cambio de horario del seminario",
  "content": "El seminario del viernes pasa a las 10:00.",
  "audiences": [
    { "type": "FACULTY", "facultyId": "00000000-0000-0000-0000-000000000020" },
    { "type": "PROJECT", "projectId": "00000000-0000-0000-0000-000000000010" }
  ]
}
```

Ese ejemplo solo es válido para un administrador o para un decano de la facultad indicada que además sea decano de alguna facultad del proyecto. El tipo `NOTIFICATION` exige ser decano o administrador.

Un tutor activo del proyecto puede publicar ese mismo cuerpo siempre que el `kind` no sea `NOTIFICATION` y la audiencia sea `{ "type": "PROJECT", "projectId": "…" }` de un proyecto suyo.

### Copias encoladas

Al publicar se encolan copias para los destinatarios según estas reglas:

1. Se calculan los usuarios **activos** que pertenecen a al menos una audiencia (unión). Si hay `ALL`, son todos los usuarios activos.
2. Se excluye al autor: **el autor nunca recibe copia de su propia novedad**.
3. Para cada destinatario se mira su preferencia de ese `kind` en cada canal registrado (ver [`notification-preferences.md`](notification-preferences.md)). Por defecto el correo está activo y WhatsApp desactivado.
4. WhatsApp solo se encola si el destinatario tiene teléfono.
5. El mensaje se redacta una sola vez: asunto `[Etiqueta] {title}` (por ejemplo `[Noticia] Convocatoria`) y cuerpo `{content}\n\n— {nombre del autor}\nGestor de Semilleros`.

`queuedDeliveries` es el número de envíos creados (destinatario × canal), no el número de personas. Es `0` si no hay canales registrados o si nadie quiere copia.

### Respuestas

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `201` | Novedad creada | `AnnouncementResponseDto` + `queuedDeliveries` (ver abajo). |
| `400` | Cuerpo inválido, o alguna facultad, área o proyecto no existe | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | Sin rol global permitido, tipo no permitido o audiencia fuera del alcance | `{ message: "No tienes permisos para realizar esta acción." }` |

Mensajes de validación exactos:

- `El cuerpo debe ser un objeto JSON.`
- `Campos no permitidos: campo1, campo2.`
- `kind no es válido. Valores permitidos: NEWS, COMMUNICATION, CHANGE, NOTIFICATION.`
- `title es obligatorio (máximo 200 caracteres).`
- `content es obligatorio (máximo 5000 caracteres).`
- `audiences debe ser una lista de 1 a 20 audiencias.`
- `audiences[0] debe ser un objeto.`
- `audiences[0].type no es válido. Valores permitidos: ALL, ROLE, FACULTY, AREA, PROJECT.`
- `audiences[0]: campos no permitidos: role.`
- `audiences[0].role es obligatorio.`
- `audiences[0].role no es válido.`
- `audiences[0].facultyId es obligatorio.`
- `audiences[0].facultyId debe ser un UUID.`
- `audiences[0].areaId es obligatorio.`
- `audiences[0].areaId debe ser un UUID.`
- `audiences[0].projectId es obligatorio.`
- `audiences[0].projectId debe ser un UUID.`

Los errores se acumulan en `errors`; el índice `[0]` es el de la audiencia que falla. Los destinos inexistentes añaden, además, uno de estos mensajes:

- `Alguna de las facultades indicadas no existe.`
- `Alguna de las áreas indicadas no existe.`
- `Alguno de los proyectos indicados no existe.`

Ejemplo de `400` con un destino inexistente:

```json
{
  "message": "Datos inválidos.",
  "errors": ["Alguno de los proyectos indicados no existe."]
}
```

### `AnnouncementResponseDto`

```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "kind": "NOTIFICATION",
  "title": "Cambio de horario del seminario",
  "content": "El seminario del viernes pasa a las 10:00.",
  "publishedAt": "2026-11-06T15:00:00.000Z",
  "author": { "id": "00000000-0000-0000-0000-000000000030", "fullName": "Decano de Ejemplo" },
  "audiences": [
    {
      "type": "FACULTY",
      "faculty": { "id": "00000000-0000-0000-0000-000000000020", "name": "Facultad de Ejemplo" }
    },
    {
      "type": "PROJECT",
      "project": { "id": "00000000-0000-0000-0000-000000000010", "title": "Proyecto de Ejemplo" }
    }
  ],
  "queuedDeliveries": 12
}
```

`audiences` solo incluye el campo propio de cada tipo (`role`, `faculty`, `area` o `project`). `queuedDeliveries` solo aparece en la respuesta de creación.

## `GET /api/announcements`

Devuelve el feed visible para el usuario.

### Consulta

| Parámetro | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `kind` | string | No | `NEWS`, `COMMUNICATION`, `CHANGE` o `NOTIFICATION`. |
| `limit` | string numérica | No | Entero entre 1 y 100. Por defecto `50`. |
| `before` | string de fecha | No | Se interpreta con `Date.parse`; se devuelven las novedades con `publishedAt` **estrictamente anterior**. |

Los parámetros desconocidos se rechazan. El feed solo incluye novedades con `publishedAt <= ahora`.

```http
GET /api/announcements?kind=NOTIFICATION&limit=20&before=2026-11-06T00:00:00.000Z
```

Orden: `publishedAt` descendente y, a igual fecha, `id` descendente. No hay paginación por cursor más allá de `before`.

### Respuestas

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Correcto | `AnnouncementResponseDto[]` (vacío si no hay novedades visibles). |
| `400` | Parámetros inválidos | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |

Mensajes de validación exactos:

- `El cuerpo debe ser un objeto JSON.`
- `Campos no permitidos: campo1, campo2.`
- `kind no es válido. Valores permitidos: NEWS, COMMUNICATION, CHANGE, NOTIFICATION.`
- `limit debe ser un entero entre 1 y 100.`
- `before debe ser una fecha ISO 8601.`

```json
[
  {
    "id": "00000000-0000-0000-0000-000000000001",
    "kind": "NEWS",
    "title": "Convocatoria de semilleros",
    "content": "La convocatoria estará abierta hasta el 30 de noviembre.",
    "publishedAt": "2026-11-06T15:00:00.000Z",
    "author": { "id": "00000000-0000-0000-0000-000000000030", "fullName": "Encargado de Área" },
    "audiences": [{ "type": "ALL" }]
  }
]
```

## `GET /api/announcements/:id`

Devuelve una novedad visible para el usuario.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | El usuario puede verla | `AnnouncementResponseDto`. |
| `400` | `id` no es UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `404` | No existe, está eliminada o el usuario no puede verla | `{ message: "Novedad no encontrada." }` |

## `GET /api/announcements/:id/deliveries`

Resumen de las copias externas de la novedad: cuántos envíos hay por canal y estado. Solo el autor o un administrador. La novedad debe ser visible para el usuario; si no, responde `404` antes de comprobar la propiedad.

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Es autor o administrador | `DeliverySummary` (ver abajo). |
| `400` | `id` no es UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | La ve, pero no es su autor ni administrador | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | No existe, está eliminada o el usuario no puede verla | `{ message: "Novedad no encontrada." }` |

`DeliverySummary` siempre incluye los dos canales y los cuatro estados, con `0` donde no haya envíos:

```json
{
  "EMAIL": { "PENDING": 0, "SENT": 10, "FAILED": 1, "SKIPPED": 1 },
  "WHATSAPP": { "PENDING": 0, "SENT": 2, "FAILED": 0, "SKIPPED": 0 }
}
```

No hay endpoint para ver el detalle por destinatario. El significado de cada estado y los reintentos se explican en [`notification-preferences.md`](notification-preferences.md#envío-de-copias).

## `DELETE /api/announcements/:id`

Eliminación **lógica**: guarda `deletedAt`, la novedad desaparece del feed y de `GET /api/announcements/:id`, y sus envíos `PENDING` pasan a `SKIPPED` con `lastError: "Novedad eliminada."`. No se borran filas.

Solo el autor o un administrador, y solo si la novedad es visible para el usuario. Un tutor, decano o encargado de área elimina sus propias novedades; no puede eliminar las de otros (`403`, o `404` si no las ve).

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `204` | Eliminada | Sin cuerpo. |
| `400` | `id` no es UUID | `Validation failed (uuid is expected)` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `403` | La ve, pero no es su autor ni administrador | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | No existe, está eliminada o el usuario no puede verla | `{ message: "Novedad no encontrada." }` |

## Errores comunes

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `400` | Cuerpo o consulta inválidos, destino inexistente o `id` no UUID | `{ message: "Datos inválidos.", errors: string[] }` o el mensaje del pipe. |
| `401` | Sin sesión, sesión expirada o usuario desactivado | `{ message: "Sesión no válida o expirada." }` |
| `403` | Falta el rol, el tipo o la audiencia; o no es autor ni administrador | `{ message: "No tienes permisos para realizar esta acción." }` |
| `404` | Novedad inexistente, eliminada o no visible | `{ message: "Novedad no encontrada." }` |

## Pendiente

- **Editar novedades**: no hay `PATCH`; la matriz de permisos solo confirma crear (ADR 0005).
- **Publicación programada**: no se puede fijar `publishedAt`; siempre es la hora de creación, aunque el feed ya filtra por `publishedAt <= ahora`.
- **Notificaciones automáticas por eventos** de proyectos y tableros (asignaciones, aprobaciones): no implementadas.
- **Consentimiento explícito de WhatsApp** desde la aplicación y verificación del teléfono: pendientes (ADR 0005).
- **Permisos para publicar**: según ADR 0010 (sección 8), que resuelve P-17 para administrador, encargado de área, decano y tutor.
- **Detalle de envíos**: solo hay conteos por canal y estado, no el listado de destinatarios ni sus errores.
