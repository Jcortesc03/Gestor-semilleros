# Decisiones de diseño de datos

> **Estado:** las decisiones DB-01 a DB-14 están **aprobadas** e implementadas en `apps/backend/prisma/schema.prisma` y su migración inicial. Quedan registradas en el ADR [`0001-modelo-de-datos-y-entorno-local.md`](../decisions/0001-modelo-de-datos-y-entorno-local.md) (junto con las versiones PostgreSQL 18.6 y Prisma 7.10.1).
> Las nuevas decisiones se registran como ADR en [`docs/decisions/`](../decisions/) y se reflejan aquí y en [`data-model.md`](data-model.md).
> Las preguntas `P-xx` están en [`business-rules.md`](../domain/business-rules.md#preguntas-pendientes).

## Resumen

| ID | Decisión | Estado | Bloqueada por |
| --- | --- | --- | --- |
| DB-01 | Roles globales en la tabla `user_roles` | Aprobada | P-02 ✅ |
| DB-02 | Participación en proyectos mediante `project_members` con rol de proyecto | Aprobada | P-03 ✅, P-25 ✅ |
| DB-03 | Decanos con vigencia en `faculty_deans` | Aprobada | P-06 ✅ |
| DB-04 | El decano no es participante: se deriva de `project_faculties` → `faculty_deans` | Aprobada | P-04 ✅, P-07 ✅ |
| DB-05 | Pertenencia de responsables y encargados validada en servicios | Aprobada | P-24 (parcial) |
| DB-06 | Audiencias de novedad con discriminador y FK opcionales | Aprobada | P-16 ✅ (canales ❓) |
| DB-07 | Adjuntos de actividad en la tabla `activity_attachments` | Aprobada | P-14 ✅ |
| DB-08 | Documento referenciado por clave de almacenamiento | Aprobada | P-15 ✅ |
| DB-09 | Progreso, resultado y aprobación en columnas separadas | Aprobada | P-11 ✅, P-12 ✅ |
| DB-10 | Eliminación lógica en entidades de negocio | Aprobada | P-20 ✅ |
| DB-11 | Métricas derivadas, no persistidas | Aprobada | — |
| DB-12 | Reunión con duración, sin hora de fin | Aprobada | — |
| DB-13 | Nombres en inglés y tablas en snake_case | Aprobada | — |
| DB-14 | Identificadores UUID | Aprobada | — |

---

### DB-01 · Roles globales

- **Contexto:** no se sabe si un usuario puede tener varios roles globales (por ejemplo, un docente que es tutor y decano).
- **Alternativas:** (a) columna `users.role`; (b) tabla `user_roles` (N:M); (c) tabla catálogo `roles` con permisos configurables.
- **Decisión:** (b), aprobada (P-02: un usuario puede tener varios roles). Sirve para uno o varios roles y no adelanta un sistema de permisos configurable, que nadie ha pedido.
- **Justificación:** pasar de (a) a (b) más adelante exige migrar datos; (b) con un único rol por usuario es trivial. Se descarta (c) por complejidad no justificada.

### DB-02 · Participación en proyectos

- **Contexto:** un proyecto tiene varios participantes y un usuario participa en varios proyectos. El estudiante líder parece un rol dentro del proyecto.
- **Alternativas:** (a) FK de usuarios en `projects` (`tutor_id`); (b) tablas separadas `project_tutors` y `project_students`; (c) una sola tabla `project_members` con `project_role`.
- **Decisión:** (c), con `status`, `joined_at`/`left_at` e `is_primary` (tutor principal, P-05). El líder es un rol de proyecto (`STUDENT_LEADER`, P-03).
- **Justificación:** (a) no admite varios tutores ni estudiantes. (b) duplica estructura y complica el cambio de rol (estudiante ↔ líder), que con (c) es una actualización de columna.
- **Restricciones en la base de datos:** un registro activo por (proyecto, usuario), un único proyecto activo por estudiante (P-25), un líder activo por proyecto (P-03) y un tutor principal activo por proyecto, solo tutores (P-05). Ver [`data-model.md`](data-model.md) §6.

### DB-03 · Decanos con vigencia

- **Contexto:** un decano tiene una o varias facultades (confirmado); los decanos cambian con el tiempo.
- **Alternativas:** (a) `faculties.dean_id`; (b) `faculty_deans` con `starts_at` y `ends_at`.
- **Decisión:** (b), con un índice único parcial para garantizar un único decano vigente (P-06).
- **Justificación:** conserva el historial para métricas y auditoría.

### DB-04 · El decano no es participante explícito

- **Contexto:** la definición dice que el proyecto tiene como participantes activos a "decano, tutor y estudiantes".
- **Alternativas:** (a) incluir al decano en `project_members`; (b) derivarlo de `project_faculties` → `faculty_deans`.
- **Decisión:** (b). Como un proyecto pertenece a una o varias facultades (P-04, tabla `project_faculties`), el decano se obtiene a través de ellas y un proyecto interfacultad puede tener **varios decanos**.
- **Justificación:** con (a) el dato sería redundante y podría quedar desactualizado al cambiar el decano (viola 3FN). Como todo proyecto tiene al menos una facultad, siempre tiene decano. Esta decisión resuelve de hecho P-07.

### DB-05 · Validación de pertenencia

- **Contexto:** el tutor responsable y el estudiante encargado de un tablero, y los encargados de una actividad, deberían ser participantes del proyecto.
- **Alternativas:** (a) FK simple a `users` y validación en el servicio; (b) FK compuesta (`project_id`, `user_id`) hacia `project_members`; (c) triggers.
- **Decisión:** (a). La parte aún pendiente de P-24 (si deben ser participantes) se valida en el servicio.
- **Justificación:** la regla incluye el rol y el estado activo, que una FK no puede comprobar. Además, la lógica de negocio debe vivir en los servicios (`AGENTS.md`). (b) garantiza solo una parte y obliga a repetir `project_id` en las actividades. (c) oculta lógica en la base de datos.

### DB-06 · Audiencias de novedades

- **Contexto:** se necesita un sistema de destinatarios flexible: todos, roles, facultad, área o proyecto, posiblemente combinados.
- **Alternativas:**
  1. Columnas en `announcements` (una por tipo de destino), lo que impide combinar destinos del mismo tipo.
  2. Asociación polimórfica (`target_type` + `target_id` genérico), que no permite integridad referencial y que Prisma no soporta.
  3. Una tabla por tipo de audiencia, lo que multiplica las tablas y las consultas.
  4. **`announcement_audiences` con `audience_type` y FK opcionales**, más una restricción CHECK.
  5. Materializar un registro por usuario destinatario.
- **Decisión:** (4), con la audiencia **calculada al consultar**. La notificación es un tipo de novedad (`AnnouncementKind`) y no hay registro de lectura (P-16); esto resuelve la tensión entre RN-05 y RN-50 (ver [`business-rules.md`](../domain/business-rules.md)).
- **Justificación:** mantiene FK reales, admite varias audiencias por novedad y se amplía agregando un valor al enum y una columna. Se descarta (5) por ahora porque genera volumen y quedaría desactualizado cuando cambien las membresías. Se reevaluaría si se añaden el registro de lectura o el envío por canales externos (WhatsApp, correo; aún pendientes), probablemente como una tabla adicional de entregas o lecturas.

### DB-07 · Adjuntos de actividad

- **Contexto:** una actividad admite varios adjuntos (P-14) y cada uno puede ser un enlace o un documento.
- **Alternativas:** (a) dos columnas exclusivas en `activities` (`attachment_url`, `attachment_document_id`); (b) tabla `activity_attachments`; (c) registrar los enlaces como `documents`.
- **Decisión:** (b). Cada fila tiene `kind` (`LINK` | `DOCUMENT`), `url` o `document_id`, y un CHECK (`activity_attachments_kind_target`) que impide que ambos tengan valor o que falten.
- **Justificación:** (a) solo admite un adjunto. (c) mezclaría archivos con enlaces externos. Sustituye la propuesta inicial de dos columnas, que solo valía para cardinalidad 0..1.

### DB-08 · Referencia del documento

- **Contexto:** se debe registrar "especialmente el enlace de descarga". El almacenamiento es AWS S3.
- **Alternativas:** (a) guardar la URL de descarga; (b) guardar la clave del objeto y generar la URL bajo demanda.
- **Decisión:** (b), es decir, `storage_key` (P-15).
- **Justificación:** las URLs firmadas caducan y una URL pública expone el archivo. Con la clave, el backend controla el acceso y puede cambiar de proveedor sin migrar datos.

### DB-09 · Estados de la actividad

- **Contexto:** RN-02 y RN-04 separan progreso y resultado; además existe el estado de aprobación del tutor.
- **Alternativas:** (a) un único `status` con todos los valores; (b) tres columnas: `progress_status`, `result` y `approval_status`.
- **Decisión:** (b), también para tableros (`progress_status` y `result` en `boards`, P-11). La aprobación guarda solo el estado actual, con `approved_by_id` y `approved_at` (P-12).
- **Justificación:** (a) contradice RN-04 ("un resultado no reemplaza al estado de progreso"). No hay historial ni observaciones de aprobación; si se piden, daría lugar a una tabla `activity_reviews`.

### DB-10 · Eliminación lógica

- **Contexto:** el decano puede eliminar proyectos, y estos tienen dependientes (tableros, actividades, documentos).
- **Alternativas:** (a) borrado físico en cascada; (b) `deleted_at` en las entidades de negocio y `RESTRICT` en las FK.
- **Decisión:** (b) (P-20).
- **Justificación:** evita perder historial académico y métricas, y evita dejar huérfanos los binarios en S3. Requiere un filtro central de consultas (ver data-model §7.9).

### DB-11 · Métricas derivadas

- **Decisión:** los dashboards se calculan con consultas y no se guardan.
- **Justificación:** guardarlas duplicaría información (3FN). Si hay problemas de rendimiento, se evaluarán vistas materializadas o caché mediante un ADR.

### DB-12 · Duración de la reunión

- **Decisión:** guardar `starts_at` y `duration_minutes`, que es lo confirmado, sin `ends_at`.
- **Justificación:** la hora de fin se deriva. Guardar ambas puede producir inconsistencias.

### DB-13 · Convención de nombres

- **Decisión:** identificadores en inglés (`AGENTS.md` §7), modelos de Prisma en PascalCase y tablas en snake_case mediante `@@map`.
- **Justificación:** sigue la convención del proyecto y los usos habituales de PostgreSQL.

### DB-14 · Tipo de identificador

- **Decisión:** UUID (`@db.Uuid`, `@default(uuid())`).
- **Alternativas descartadas:** CUID (ordenable) y autoincremental (compacto, pero expone el volumen de datos).
- **Justificación:** no se puede adivinar y es seguro en URLs.

---

### DB-15 · Bandeja de salida de copias externas

- **Contexto:** las novedades se copian por correo y WhatsApp (RN-89). DB-06 preveía una tabla de entregas si se añadían canales.
- **Alternativas:** (a) enviar durante la petición, sin registro; (b) una cola externa; (c) **bandeja de salida en PostgreSQL** (`notification_dispatches` + `notification_deliveries`) procesada por el backend.
- **Decisión:** (c). Las preferencias viven en `notification_preferences` con valores por defecto implícitos (sin fila).
- **Justificación:** la novedad y sus envíos se crean en la misma transacción, los reintentos y el estado quedan auditables y no se añade infraestructura. Materializar envíos por usuario es aceptable aquí porque son un registro histórico de lo enviado, no la audiencia (que sigue calculándose al consultar, DB-06).

### DB-16 · Reuniones, cuentas de Microsoft y avisos programados

- **Contexto:** las reuniones se agendan en Teams desde la cuenta del organizador y generan avisos programados (ADR 0007).
- **Decisión:** `meetings.status` (enum) más `cancelled_at`; `microsoft_accounts` con los tokens **cifrados** (nunca en claro); la bandeja de salida (DB-15) admite como origen una reunión (`meeting_id`, `purpose`) y la programación (`scheduled_for`, `expires_at`); las preferencias pasan de `AnnouncementKind` a `NotificationKind` (añade `MEETING`) con una conversión que conserva los datos.
- **Justificación:** se reutiliza el mismo mecanismo de envío, reintentos y preferencias; el estado se guarda (no solo se calcula) para poder filtrar y registrar cancelaciones, y se actualiza por horario antes de cada lectura.

### DB-17 · Momento de terminación de tableros y actividades

- **Contexto:** la analítica necesita saber cuándo se terminó cada tablero o actividad para medir las entregas a tiempo frente a `due_date`. Solo se guardaba el estado actual del progreso (DB-09), y `updated_at` cambia con cualquier edición.
- **Alternativas:** (a) usar `updated_at` como aproximación; (b) una tabla de historial de cambios de progreso; (c) **columna `completed_at`** en `boards` y `activities`.
- **Decisión:** (c), nula y con índice (ADR 0016). El servicio la fija en la misma escritura que cambia el progreso: al pasar a `DONE` desde otro estado toma el momento actual, reenviar `DONE` no la cambia y salir de `DONE` la vuelve nula. No se expone en las respuestas de tableros y actividades. La migración `completed_at` rellena los registros ya en `DONE` (incluidos los eliminados lógicamente) con su `updated_at`, como aproximación.
- **Justificación:** es un hecho registrado, no una métrica derivada (DB-11): no puede recalcularse después. (a) es inexacta y (b) añade una tabla que hoy no se necesita; si se pide el historial completo, daría lugar a ella.

## Pendientes

1. P-08: alcance del encargado de área; `area_managers` es un modelo provisional.
2. P-19: atributos y destinatarios del recordatorio; `reminders` es un modelo mínimo provisional.
3. P-16 (parcial): vigencia de las novedades y registro de lectura. Los canales y las entregas se resolvieron en DB-15.
4. P-24 (parcial): si el tutor responsable y el estudiante encargado deben ser participantes (hoy, validación en el servicio) y si el encargado es el líder.
5. P-23: correspondencia entre los módulos existentes del backend (`semilleros`, `tasks`, `notifications`, `reminders`…) y las entidades nuevas. **No** renombres módulos sin aprobación.
6. Mecanismo del filtro de eliminación lógica (`PrismaService` o extensión del cliente).
7. Integración con el adaptador de Prisma de Auth.js (depende del flujo de autenticación).
8. Permisos por rol (P-09, P-13, P-17, P-21, P-22) y reglas de negocio aún no cubiertas por restricciones de base de datos.
