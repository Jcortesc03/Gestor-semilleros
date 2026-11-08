# ADR 0010 — Resolución de reglas de dominio pendientes

- **Estado:** aceptado (decisiones del usuario, 2026-11-07).
- **Relacionado:** [ADR 0004](0004-proyectos-tableros-actividades.md), [ADR 0005](0005-notificaciones-y-copias-externas.md), [ADR 0009](0009-directorio-catalogos-y-paneles.md).

## Decisiones

### 1. Administración de áreas y facultades

- **Administrador:** crea, renombra y elimina áreas y facultades; asigna y retira **encargados de área**; asigna el **decano vigente** de una facultad (al asignar uno nuevo, el decanato anterior se cierra con `ends_at = ahora`, conservando el historial, DB-03).
- **Encargado de área:** edita el **nombre y la descripción** solo de sus áreas asignadas. No crea ni elimina áreas ni asigna encargados.
- **Eliminación:** áreas y facultades no tienen borrado lógico en el esquema; se eliminan físicamente **solo si no tienen proyectos ni audiencias de novedades asociadas** (si no, `409`). No se añade migración.

### 2. Encargado de área sobre proyectos (P-08, RN-25)

Actúa **solo sobre sus áreas asignadas** (`area_managers`) y, sobre los proyectos de esas áreas, tiene **los mismos permisos que el decano** sobre los de sus facultades: crear (con `areaId` de un área suya), consultar, modificar, eliminar (lógico), gestionar tutores y gestionar estudiantes.

### 3. Precedencia encargado de área / decano (conflicto 2)

**Ninguno prevalece:** si un proyecto es del área de un encargado y de la facultad de un decano, ambos tienen los mismos permisos; vale el último cambio.

### 4. Usuarios con varios roles (conflicto 9)

Los permisos **se suman** (P-02) y **no hay incompatibilidades** entre roles.

### 5. Aprobación de actividades (RN-49, RN-49a, conflicto 6)

- Aprueba o rechaza **cualquier tutor activo del proyecto** (y el administrador).
- **Solo** se puede aprobar o rechazar una actividad con progreso `DONE` (`409` si no).
- Si una actividad aprobada o rechazada **sale de `DONE`**, su aprobación vuelve a `PENDING` (se limpian `approved_by` y `approved_at`).

### 6. Límites del tutor (P-21, RN-11, RN-12, conflicto 1)

- El tutor, en sus proyectos, **añade y retira estudiantes** y **cambia su rol de proyecto entre `STUDENT` y `STUDENT_LEADER`** (máximo un líder, P-03).
- El tutor **no** gestiona tutores ni roles globales. Los roles globales solo los cambia el administrador.

### 7. Tablero y líder (P-24, RN-42, RN-43, conflicto 4 y 3)

- El **estudiante encargado** del tablero debe ser participante **activo** del proyecto como `STUDENT` o `STUDENT_LEADER`; **no** tiene que ser el líder.
- El **tutor responsable** debe ser tutor **activo** del proyecto.
- El **líder** gestiona encargados en **cualquier actividad** de su proyecto (comportamiento actual).

### 8. Publicación de novedades (P-17, RN-51, RN-52, RN-93)

| Autor | Audiencias permitidas |
| --- | --- |
| Administrador | Cualquiera (confirmado) |
| Encargado de área | `AREA` de sus áreas asignadas y `ROLE` (cualquier rol global). No `ALL`. (Enmienda §9) |
| Decano | `FACULTY` de sus facultades y `PROJECT` de proyectos de sus facultades |
| Tutor | Solo `PROJECT` de los proyectos donde es tutor activo |

El tipo `NOTIFICATION` sigue reservado al decano y al administrador (RN-93); el tutor y el encargado de área publican los demás tipos.

### 9. Enmienda (2026-11-07): filtros de alcance y proyectos del tutor

- El encargado de área **también** publica para roles (`ROLE`), además de sus áreas.
- La web solo ofrece las opciones accesibles: áreas del encargado (`GET /api/areas?scope=managed`), facultades del decano (`GET /api/faculties?scope=dean`) y proyectos del tutor (`GET /api/projects/tutored`). El administrador ve todo y puede publicar por roles desde la web.

## Consecuencias

- Se actualizan `docs/domain/business-rules.md`, `roles-permissions.md` y los contratos de `docs/api/` afectados.
- Siguen pendientes: P-19 (recordatorios), P-23 (correspondencia de módulos), permisos de documentos (conflicto 8), restauración de proyectos eliminados (conflicto 10) y RN-64.
