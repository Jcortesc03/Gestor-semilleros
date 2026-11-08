# ADR 0016 — Módulo de analítica

- **Estado:** aceptado.
- **Fecha:** 2026-11-08.

## Contexto

Se pidió un módulo de "big data" con filtros que analice: número de usuarios, cuántos completan sus tareas, qué patrón de tareas tiene más éxito, qué facultades, tutores y decanos tienen mayor tasa de tareas completadas, qué tareas se completan a tiempo, quiénes tienen más reuniones y cuántas hubo, cuántos adjuntos hay, qué días de la semana hay más entregas, y comparaciones adicionales.

El modelo no permitía medir "a tiempo": las actividades no guardaban cuándo se terminaron (`updated_at` cambia con cualquier edición). Tampoco existe la entidad **carrera**.

## Decisión (aprobada por el usuario)

1. **Módulo `analytics` en el backend** (`src/modules/analytics`), solo lectura: `GET /api/analytics` y `GET /api/analytics/filters`. Contrato: [`analytics.md`](../api/analytics.md).
2. **Acceso:** `ADMIN` con alcance global; `AREA_MANAGER` en sus áreas asignadas; `DEAN` en las facultades donde es decano vigente; los alcances se suman (P-02). Tutores y estudiantes no tienen acceso.
3. **`completed_at`** en `activities` y `boards`: se fija al pasar el progreso a `DONE`, se conserva si se reenvía `DONE` y se borra al salir de `DONE`. Los registros ya terminados se rellenan con `updated_at` como aproximación. No se expone en los contratos de tableros (DB, ver `docs/database/database-decisions.md`). "A tiempo" = fecha local de `completed_at` ≤ `due_date` del tablero (las actividades no tienen fecha límite propia).
4. **Zona horaria:** periodos y días de la semana se calculan en `MEETINGS_TIME_ZONE` (por defecto `America/Bogota`), la zona institucional ya configurada.
5. **Cálculo:** Prisma carga filas planas ya recortadas por alcance y filtros estructurales, y una función pura (`models/analytics-aggregation.ts`) calcula todas las métricas. Sin dependencias nuevas, sin vistas materializadas ni almacén de datos aparte.
6. **Carreras:** se omite el desglose de adjuntos por carrera (no existe la entidad); se reporta el total, por tipo y por formato.
7. **Web:** vista "Analítica" con gráficas en SVG propio, sin biblioteca de gráficos.

## Consecuencias

- Migración `completed_at` con índice en ambas tablas.
- El volumen se procesa en memoria por consulta: adecuado para el tamaño de una universidad; si crece, el siguiente paso es agregar en SQL (`GROUP BY`) o con vistas materializadas, sin cambiar el contrato.
- Pendientes: entidad carrera, fecha límite por actividad, exportación de reportes (CSV/PDF) y analítica para tutores.
