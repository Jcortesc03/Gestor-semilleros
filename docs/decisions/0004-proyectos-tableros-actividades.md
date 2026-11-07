# ADR 0004 · Proyectos, tableros y actividades

- **Estado:** Aceptada
- **Fecha:** 2026-11-06

## Contexto

Se pidió el sistema de proyectos y tableros de tareas con sus actividades. Para implementarlo, el usuario resolvió P-09, P-13 y P-22 y definió quién gestiona los participantes (RN-83 a RN-88 en `docs/domain/business-rules.md`).

## Decisión

1. **Módulos** `projects` (proyectos y participantes) y `boards` (tableros, actividades, encargados y adjuntos). Los módulos ya existentes `semilleros` y `tasks` quedan vacíos; su destino sigue abierto (P-23).
2. **Permisos centralizados** en `projects/models/project-access.ts` (`can.*`). `ProjectAccessService.resolve()` calcula en cada petición si el usuario es administrador, decano vigente de alguna facultad del proyecto, o qué rol de proyecto tiene. `boards` lo reutiliza mediante la API pública del módulo.
3. **Visibilidad:** quien no tiene relación con el proyecto recibe `404`, no `403`. Lo eliminado lógicamente (proyecto, tablero o actividad) también responde `404`.
4. **Integridad:** se comprueban antes, con mensajes claros, el líder único, el tutor principal único, un proyecto activo por estudiante, que no haya participantes duplicados y que se tenga el rol global requerido. Los índices parciales de la base de datos actúan como respaldo ante peticiones simultáneas (`P2002` se traduce en `409`).
5. **Adjuntos:** por ahora solo de tipo `LINK`, con URL `http(s)`. Los de tipo `DOCUMENT` esperan al módulo de documentos (S3).
6. **Validación** con parsers sin dependencias que comparten `src/common/utils/validation.ts`; los errores se devuelven en `400 { message, errors }`.
7. Parte del trabajo (los validadores con sus pruebas, las pruebas de la matriz de permisos y la documentación de la API) la hicieron agentes de opencode coordinados con Orca, y se revisó con la suite completa.

## Consecuencias

- Pendiente: el adjunto de documentos, las notificaciones de cambios, la paginación y los filtros, el historial de aprobaciones y la autorización para el encargado de área (P-08).
- Al retirar a un participante, los tableros donde es responsable lo conservan como responsable; reasignarlo es manual.
