# Inscripciones (demo de importación desde Google Sheets)

Base: `/api/enrollments`. Requiere sesión (`SessionGuard`) y rol `ADMIN` o `AREA_MANAGER` (`RolesGuard`).

## Opciones

`GET /api/enrollments/options` → `{ areas, faculties, areaTypes, documentTypes, statuses }`.

- `areas`: `[{ id, name, sourceConfigured, source: null | { spreadsheetId, range, areaType } }]`.
- `faculties`: `SYSTEMS_ENGINEERING`, `SOFTWARE_ENGINEERING`.
- `areaTypes`: `SEEDLING`, `DEGREE_PROJECT`.
- `documentTypes`: `CC`, `TI`.
- `statuses`: `PENDING`, `ACCEPTED`, `REJECTED`.

## Fuente por área

`PUT /api/enrollments/sources/:areaId` body `{ spreadsheetId, range, areaType }`. Solo áreas asignadas (o admin). La hoja debe estar en la asignación confiable del servidor (`ENROLLMENT_SHEETS_ALLOWLIST`). Devuelve `{ spreadsheetId, range, areaType }`.

Fuente no configurada o servicio externo no disponible: `503`.

La asignación exige el ID exacto de área y hoja; `*` no concede acceso. Se comprueba de nuevo antes de leer y confirmar una importación. Revocar la asignación bloquea las vistas previas anteriores (`403`).

## Vista previa

`POST /api/enrollments/preview` body `{ areaId }` → `{ previewToken, rows, summary }`.

- `rows`: `{ sourceRow, firstNames, lastNames, email, documentType, documentNumber, faculty, areaType, period, consent, errors: string[], duplicate: boolean }`. `documentType` y `faculty` pueden ser `null` para filas inválidas (fuera de área o sin catálogo válido); el cliente las renderiza con un guion.
- `summary`: `{ read, valid, invalid, duplicates }`.
- No persiste solicitudes.
- Valida la respuesta de `Área`; si corresponde a otro tipo de área, la fila se informa como inválida sin mostrar sus datos personales.

## Importación

`POST /api/enrollments/import` body `{ previewToken }` → `{ imported, duplicates, invalid }`.

Vincula la vista previa al actor/área/fuente y rechaza si la hoja cambió. La repetición no duplica ni sobrescribe.

Cambiar la configuración invalida la vista previa mediante su revisión. Los contadores reflejan las filas realmente insertadas, incluso con confirmaciones simultáneas; los conflictos por documento o correo dentro del área y período no sobrescriben registros.

## Listado

`GET /api/enrollments?areaId=&faculty=&period=&status=&search=&limit=&offset=` → `{ items, total }`. La primera página usa `limit=20`, `offset=0`; el máximo permitido por página es 200.

Item: `{ id, firstNames, lastNames, email, documentType, documentNumber, faculty, areaId, areaType, period, status, createdAt, rejectedAt }`.

## Estado

- `PATCH /api/enrollments/:id/status` body `{ status }` → item.
  - `REJECTED` solo marca la solicitud como rechazada (`rejectedAt` con fecha); no crea usuarios ni envía correo.
  - `ACCEPTED` marca la solicitud como aceptada y crea en la misma transacción un usuario `STUDENT` activo: `fullName` es `firstNames` + un espacio + `lastNames` (recortados), `email` es el correo de la solicitud, `mustChangePassword=true` y contraseña temporal aleatoria (Argon2id, nunca CC/TI ni datos de identidad). No crea participante de proyecto. La contraseña en claro nunca se registra, audita ni devuelve.
  - Si el correo ya existe (sin distinguir mayúsculas), devuelve `409` y la solicitud no queda aceptada; la cuenta existente no se reutiliza ni modifica. Una carrera de unicidad en Prisma se mapea al mismo `409`.
  - Tras el commit, envía un correo SMTP (vía `SmtpEmailSender`) a la persona inscrita: asunto `Inscripción aprobada - Universidad de Colombia` y cuerpo `Por parte de la Universidad de Colombia, ya tienes acceso a la plataforma de Semilleros. Correo: <correo registrado>. Contraseña temporal: <contraseña generada>. Por tu seguridad, cambia la contraseña apenas ingresar.`. La contraseña en claro nunca se registra, audita ni devuelve. Si SMTP falla después de crear la cuenta (política demo), la cuenta y el estado aceptado se conservan, se audita el fallo sin PII/contraseña y se devuelve el item aceptado.
- `PATCH /api/enrollments/status` body `{ ids, status }` → `{ updated }`. Solo `REJECTED` (masivo acotado); `ACCEPTED` devuelve `400` seguro porque requiere creación y correo individual, sin cambios parciales. Rechaza atómicamente si algún ID está fuera de alcance.

## Borrado

`DELETE /api/enrollments/:id` → `204`. Solo rechazadas. No borra la hoja original. Evita reimportar la misma respuesta (tombstone).

La marca de exclusión usa un HMAC del área, período y documento, independiente del número de fila: ordenar la hoja no habilita la reimportación. El borrado manual y la limpieza a partir de 72 horas revalidan el estado al eliminar; no borran una solicitud que haya pasado a aceptada.

## Exportación

`GET /api/enrollments/export.xlsx` con los filtros de listado → archivo `.xlsx` autenticado, MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

## Historial interno

`enrollment_audit_events` registra configuración de fuente, importación, cambios de estado, borrado, limpieza, exportación y fallo de correo de aprobación. Conserva actor (o sistema), área cuando corresponde, fecha y cantidad; no copia nombres, documentos ni correos en el historial. No agrega una ruta pública de consulta.

## Cabeceras guía

`Nombres`, `Apellidos`, `Correo electrónico`, `Tipo de documento`, `Número de documento`, `Facultad`, `Área`, `Período de inscripción`, `Autorización de tratamiento de datos`; puede existir marca temporal inicial de Forms.

También se admiten `Primer Nombre` y `Segundo Nombre`, y `Primer Apellido` y `Segundo Apellido`: sus partes se unen con un espacio, omitiendo las vacías. Si están presentes las columnas combinadas `Nombres` o `Apellidos`, prevalecen sobre sus partes. No se modifican las respuestas de Google.
