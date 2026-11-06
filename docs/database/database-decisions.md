# Decisiones de diseño de datos

> **Estado:** todas las decisiones están en estado **Propuesta**; ninguna está aprobada.
> Al aprobarse una decisión, regístrala como ADR en [`docs/decisions/`](../decisions/) y actualiza este documento y [`data-model.md`](data-model.md).
> Las preguntas `P-xx` están en [`business-rules.md`](../domain/business-rules.md#preguntas-pendientes).

## Resumen

| ID | Decisión | Estado | Bloqueada por |
| --- | --- | --- | --- |
| DB-01 | Roles globales en la tabla `user_roles` | Propuesta | P-02 |
| DB-02 | Participación en proyectos mediante `project_members` con rol de proyecto | Propuesta | P-03, P-25 |
| DB-03 | Decanos con vigencia en `faculty_deans` | Propuesta | P-06 |
| DB-04 | El decano no se registra como participante del proyecto | Propuesta | P-07 |
| DB-05 | Pertenencia de responsables y encargados validada en servicios | Propuesta | P-24 |
| DB-06 | Audiencias de novedad con discriminador y FK opcionales | Propuesta | P-16 |
| DB-07 | Adjunto de actividad como dos columnas exclusivas | Propuesta | P-14 |
| DB-08 | Documento referenciado por clave de almacenamiento | Propuesta | P-15 |
| DB-09 | Progreso, resultado y aprobación en columnas separadas | Propuesta | P-11, P-12 |
| DB-10 | Eliminación lógica en entidades de negocio | Propuesta | P-20 |
| DB-11 | Métricas derivadas, no persistidas | Propuesta | — |
| DB-12 | Reunión con duración, sin hora de fin | Propuesta | — |
| DB-13 | Nombres en inglés y tablas en snake_case | Propuesta | — |
| DB-14 | Tipo de identificador | **Pendiente** | — |

---

### DB-01 · Roles globales

- **Contexto:** no se sabe si un usuario puede tener varios roles globales (por ejemplo, un docente que es tutor y decano).
- **Alternativas:** (a) columna `users.role`; (b) tabla `user_roles` (N:M); (c) tabla catálogo `roles` con permisos configurables.
- **Propuesta:** (b). Sirve para uno o varios roles y no adelanta un sistema de permisos configurable, que nadie ha pedido.
- **Justificación:** pasar de (a) a (b) más adelante exige migrar datos; (b) con un único rol por usuario es trivial. Se descarta (c) por complejidad no justificada.

### DB-02 · Participación en proyectos

- **Contexto:** un proyecto tiene varios participantes y un usuario participa en varios proyectos. El estudiante líder parece un rol dentro del proyecto.
- **Alternativas:** (a) FK de usuarios en `projects` (`tutor_id`); (b) tablas separadas `project_tutors` y `project_students`; (c) una sola tabla `project_members` con `project_role`.
- **Propuesta:** (c), con `status` y fechas de ingreso y salida.
- **Justificación:** (a) no admite varios tutores ni estudiantes. (b) duplica estructura y complica el cambio de rol (estudiante ↔ líder), que con (c) es una actualización de columna.

### DB-03 · Decanos con vigencia

- **Contexto:** un decano tiene una o varias facultades (confirmado); los decanos cambian con el tiempo.
- **Alternativas:** (a) `faculties.dean_id`; (b) `faculty_deans` con `starts_at` y `ends_at`.
- **Propuesta:** (b), con un índice único parcial para garantizar un único decano vigente.
- **Justificación:** conserva el historial para métricas y auditoría. Si no se requiere historial (P-06), (a) es suficiente y más simple.

### DB-04 · El decano no es participante explícito

- **Contexto:** la definición dice que el proyecto tiene como participantes activos a "decano, tutor y estudiantes".
- **Alternativas:** (a) incluir al decano en `project_members`; (b) derivarlo de `projects.faculty_id` → `faculty_deans`.
- **Propuesta:** (b).
- **Justificación:** con (a) el dato sería redundante y podría quedar desactualizado al cambiar el decano (viola 3FN). **Riesgo:** si un proyecto no tiene facultad (P-04), no tendría decano; en ese caso habría que reconsiderar (a).

### DB-05 · Validación de pertenencia

- **Contexto:** el tutor responsable y el estudiante encargado de un tablero, y los encargados de una actividad, deberían ser participantes del proyecto.
- **Alternativas:** (a) FK simple a `users` y validación en el servicio; (b) FK compuesta (`project_id`, `user_id`) hacia `project_members`; (c) triggers.
- **Propuesta:** (a).
- **Justificación:** la regla incluye el rol y el estado activo, que una FK no puede comprobar. Además, la lógica de negocio debe vivir en los servicios (`AGENTS.md`). (b) garantiza solo una parte y obliga a repetir `project_id` en las actividades. (c) oculta lógica en la base de datos.

### DB-06 · Audiencias de novedades

- **Contexto:** se necesita un sistema de destinatarios flexible: todos, roles, facultad, área o proyecto, posiblemente combinados.
- **Alternativas:**
  1. Columnas en `announcements` (una por tipo de destino), lo que impide combinar destinos del mismo tipo.
  2. Asociación polimórfica (`target_type` + `target_id` genérico), que no permite integridad referencial y que Prisma no soporta.
  3. Una tabla por tipo de audiencia, lo que multiplica las tablas y las consultas.
  4. **`announcement_audiences` con `audience_type` y FK opcionales**, más una restricción CHECK.
  5. Materializar un registro por usuario destinatario.
- **Propuesta:** (4), con la audiencia **calculada al consultar**.
- **Justificación:** mantiene FK reales, admite varias audiencias por novedad y se amplía agregando un valor al enum y una columna. Se descarta (5) por ahora porque genera volumen y quedaría desactualizado cuando cambien las membresías. Se reevaluaría si se confirma la confirmación de lectura o el envío por canales externos (P-16), probablemente como una tabla adicional de entregas o lecturas.

### DB-07 · Adjunto de actividad

- **Contexto:** el adjunto es opcional y puede ser un enlace o un documento.
- **Alternativas:** (a) dos columnas exclusivas (`attachment_url`, `attachment_document_id`); (b) tabla `activity_attachments`; (c) registrar los enlaces como `documents`.
- **Propuesta:** (a), con un CHECK que impida que ambas tengan valor.
- **Justificación:** la cardinalidad confirmada es 0..1. (c) mezclaría archivos con enlaces externos. Si se confirman varios adjuntos (P-14), se migra a (b).

### DB-08 · Referencia del documento

- **Contexto:** se debe registrar "especialmente el enlace de descarga". El almacenamiento es AWS S3.
- **Alternativas:** (a) guardar la URL de descarga; (b) guardar la clave del objeto y generar la URL bajo demanda.
- **Propuesta:** (b), es decir, `storage_key`.
- **Justificación:** las URLs firmadas caducan y una URL pública expone el archivo. Con la clave, el backend controla el acceso y puede cambiar de proveedor sin migrar datos. **Requiere confirmación**, porque el requisito habla de "enlace".

### DB-09 · Estados de la actividad

- **Contexto:** RN-02 y RN-04 separan progreso y resultado; además existe el estado de aprobación del tutor.
- **Alternativas:** (a) un único `status` con todos los valores; (b) tres columnas: `progress_status`, `result` y `approval_status`.
- **Propuesta:** (b).
- **Justificación:** (a) contradice RN-04 ("un resultado no reemplaza al estado de progreso"). Falta confirmar los valores (P-11, P-12) y si se necesita historial de aprobaciones, que daría lugar a una tabla `activity_reviews`.

### DB-10 · Eliminación lógica

- **Contexto:** el decano puede eliminar proyectos, y estos tienen dependientes (tableros, actividades, documentos).
- **Alternativas:** (a) borrado físico en cascada; (b) `deleted_at` en las entidades de negocio y `RESTRICT` en las FK.
- **Propuesta:** (b).
- **Justificación:** evita perder historial académico y métricas, y evita dejar huérfanos los binarios en S3. Requiere un filtro central de consultas (ver data-model §7.6).

### DB-11 · Métricas derivadas

- **Propuesta:** los dashboards se calculan con consultas y no se guardan.
- **Justificación:** guardarlas duplicaría información (3FN). Si hay problemas de rendimiento, se evaluarán vistas materializadas o caché mediante un ADR.

### DB-12 · Duración de la reunión

- **Propuesta:** guardar `starts_at` y `duration_minutes`, que es lo confirmado, sin `ends_at`.
- **Justificación:** la hora de fin se deriva. Guardar ambas puede producir inconsistencias.

### DB-13 · Convención de nombres

- **Propuesta:** identificadores en inglés (`AGENTS.md` §7), modelos de Prisma en PascalCase y tablas en snake_case mediante `@@map`.
- **Justificación:** sigue la convención del proyecto y los usos habituales de PostgreSQL.

### DB-14 · Tipo de identificador

- **Estado:** pendiente; no hay propuesta cerrada.
- **Alternativas:** UUID (no se puede adivinar y es seguro en URLs), CUID (ordenable) o autoincremental (compacto, pero expone el volumen de datos).
- **Requiere decisión** antes de redactar `schema.prisma`.

---

## Pendientes de aprobación

1. Todas las decisiones DB-01 a DB-14.
2. Correspondencia entre los módulos existentes del backend (`semilleros`, `tasks`, `notifications`, `reminders`…) y las entidades nuevas (P-23). **No** renombres módulos sin aprobación.
3. Uso de SQL personalizado en migraciones para los CHECK y los índices parciales.
4. Integración con el adaptador de Prisma de Auth.js (depende del flujo de autenticación).
5. Modelo de recordatorios (P-19) y de notificaciones o entregas (P-16).
