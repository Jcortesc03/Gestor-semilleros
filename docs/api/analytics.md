# API de analítica

> **Estado:** implementado ([ADR 0016](../decisions/0016-modulo-de-analitica.md)). Solo lectura.
>
> **Pruebas:** unitarias de la agregación (`src/modules/analytics/models/analytics-aggregation.spec.ts`), del alcance (`models/analytics-scope.spec.ts`) y de la consulta (`dtos/analytics-query.dto.spec.ts`); e2e en `apps/backend/test/analytics.e2e-spec.ts`.

Indicadores agregados de usuarios, actividades (tareas), reuniones y adjuntos, con filtros. Todos los cálculos se hacen en el backend a partir de PostgreSQL (Prisma); el cliente solo dibuja.

## Acceso y alcance

**Requiere** sesión válida y uno de los roles `ADMIN`, `AREA_MANAGER` o `DEAN`; si no, `403`. Los alcances de varios roles se suman (P-02).

| Rol | Proyectos analizados |
| --- | --- |
| `ADMIN` | Todos (alcance **global**) |
| `AREA_MANAGER` | Los de sus áreas asignadas (`area_managers`) |
| `DEAN` | Los vinculados a una facultad de la que es decano vigente (`ends_at` nulo o futuro) |

Siempre se excluyen proyectos, tableros y actividades archivados (`deleted_at`) y reuniones archivadas.

## Filtros (query string, todos opcionales)

| Parámetro | Formato | Efecto |
| --- | --- | --- |
| `from`, `to` | `YYYY-MM-DD`, inclusivos | Periodo. Se interpretan en la zona horaria institucional (`MEETINGS_TIME_ZONE`, por defecto `America/Bogota`). `from` ≤ `to` y como máximo 366 días; si falta uno, el periodo queda abierto por ese lado. |
| `areaId` | UUID | Solo proyectos de esa área. |
| `facultyId` | UUID | Solo proyectos vinculados a esa facultad. |
| `projectId` | UUID | Solo ese proyecto. |
| `tutorId` | UUID | Solo tableros cuyo tutor responsable es ese usuario. |
| `projectStatus` | `ACTIVE`, `FINISHED`, `CANCELLED` | Solo proyectos en ese estado. |

- Un `areaId`, `facultyId` o `projectId` que no figure en las opciones de `GET /api/analytics/filters` (fuera del alcance) devuelve `403`. Un UUID inexistente devuelve `404`. `tutorId` no se restringe por alcance: solo recorta los tableros (y las reuniones) del conjunto.
- El periodo se aplica a la fecha propia de cada hecho: **creación** de la actividad, **finalización** (`completed_at`) para entregas a tiempo y por día, **inicio** de la reunión y **creación** del adjunto.

## `GET /api/analytics/filters`

Opciones para los selectores, ya recortadas al alcance del usuario.

```json
{
  "scope": { "global": false, "areas": [{ "id": "uuid", "name": "Investigación" }], "faculties": [] },
  "areas": [{ "id": "uuid", "name": "Investigación" }],
  "faculties": [{ "id": "uuid", "name": "Ingeniería" }],
  "projects": [{ "id": "uuid", "name": "Proyecto demo de semillero" }],
  "tutors": [{ "id": "uuid", "name": "Tutor Demo" }]
}
```

`projects` incluye el título en `name`; `areas` y `faculties` incluyen las asignadas al usuario y las de sus proyectos visibles; `tutors` son los tutores responsables de tableros dentro del alcance. Todas las listas van ordenadas por `name`.

## `GET /api/analytics`

### `200`

```json
{
  "generatedAt": "2026-11-08T15:00:00.000Z",
  "timeZone": "America/Bogota",
  "period": { "from": "2026-08-01", "to": "2026-11-08" },
  "scope": { "global": true, "areas": [], "faculties": [] },
  "users": {
    "platform": { "total": 42, "active": 40, "inactive": 2, "byRole": { "ADMIN": 1, "AREA_MANAGER": 2, "DEAN": 3, "TUTOR": 8, "STUDENT": 30 }, "newInPeriod": 5 },
    "participants": 35,
    "withAssignedActivities": 28,
    "completingActivities": 21,
    "completionRate": 0.75
  },
  "activities": {
    "total": 120,
    "byProgress": { "PENDING": 30, "IN_PROGRESS": 20, "DONE": 65, "CANCELLED": 5 },
    "byResult": { "SUCCESS": 50, "FAILURE": 6, "NONE": 64 },
    "byApproval": { "PENDING": 60, "APPROVED": 55, "REJECTED": 5 },
    "completionRate": 0.5652,
    "approvalRate": 0.8462,
    "successRate": 0.8929,
    "onTime": { "evaluated": 65, "onTime": 50, "late": 15, "rate": 0.7692 },
    "overdueOpen": 7,
    "avgDaysToComplete": 6.4
  },
  "boards": { "total": 18, "byProgress": { "PENDING": 3, "IN_PROGRESS": 8, "DONE": 6, "CANCELLED": 1 }, "overdue": 2, "onTime": { "evaluated": 6, "onTime": 5, "late": 1, "rate": 0.8333 } },
  "patterns": [
    {
      "dimension": "ASSIGNEES",
      "buckets": [{ "key": "0", "total": 10, "done": 2, "completionRate": 0.2, "successRate": 0.5, "onTimeRate": 1 }]
    }
  ],
  "faculties": [{ "id": "uuid", "name": "Ingeniería", "projects": 4, "activities": 60, "done": 40, "completionRate": 0.6667, "onTimeRate": 0.8, "meetings": 12, "attachments": 30 }],
  "areas": [{ "id": "uuid", "name": "Investigación", "projects": 4, "activities": 60, "done": 40, "completionRate": 0.6667, "onTimeRate": 0.8, "meetings": 12, "attachments": 30 }],
  "tutors": [{ "id": "uuid", "name": "Tutor Demo", "projects": 2, "boards": 5, "activities": 30, "done": 20, "completionRate": 0.6667, "onTimeRate": 0.9, "approvalRate": 0.85, "meetingsOrganized": 6, "meetingsAttended": 2 }],
  "deans": [{ "id": "uuid", "name": "Decano Demo", "faculties": ["Ingeniería"], "projects": 4, "activities": 60, "done": 40, "completionRate": 0.6667, "onTimeRate": 0.8, "meetingsOrganized": 3, "meetingsAttended": 5 }],
  "meetings": {
    "total": 25,
    "byStatus": { "SCHEDULED": 3, "IN_PROGRESS": 0, "FINISHED": 20, "CANCELLED": 2 },
    "totalMinutes": 1350,
    "avgMinutes": 54,
    "withRecording": 8,
    "withProject": 22,
    "avgParticipants": 4.2
  },
  "attachments": {
    "total": 80,
    "byKind": { "LINK": 30, "DOCUMENT": 50 },
    "byFormat": { "PDF": 30, "WORD": 10, "EXCEL": 5, "IMAGE": 5 },
    "totalBytes": 104857600,
    "activitiesWithAttachments": 45
  },
  "weekdays": [{ "day": 1, "completions": 10, "attachments": 12, "activitiesCreated": 20, "meetings": 5 }],
  "monthly": [{ "month": "2026-10", "activitiesCreated": 40, "completions": 30, "meetings": 8, "attachments": 25 }],
  "comparison": {
    "previousPeriod": { "from": "2026-04-24", "to": "2026-07-31" },
    "current": { "completions": 65, "completionRate": 0.5652, "onTimeRate": 0.7692, "meetings": 25, "attachments": 80, "activitiesCreated": 120 },
    "previous": { "completions": 40, "completionRate": 0.5, "onTimeRate": 0.7, "meetings": 18, "attachments": 50, "activitiesCreated": 80 }
  }
}
```

### Definiciones

- **Tasas:** números entre `0` y `1` con 4 decimales, o `null` cuando el denominador es `0` (nunca `NaN`).
- `period`: el aplicado; `from`/`to` son `null` si quedan abiertos.
- `users.platform`: solo con alcance **global** y sin filtros de área, facultad, proyecto, tutor ni estado; en otro caso `null`. `newInPeriod` cuenta usuarios creados en el periodo.
- `activities`: las **creadas** en el periodo (no archivadas) de los tableros filtrados.
- `users.participants`: usuarios distintos con membresía `ACTIVE` en los proyectos filtrados. `withAssignedActivities`: encargados de al menos una actividad del conjunto; `completingActivities`: encargados de al menos una actividad `DONE`; `completionRate = completingActivities / withAssignedActivities`.
- `activities.completionRate = DONE / (total − CANCELLED)`. `approvalRate = APPROVED / DONE`. `successRate = SUCCESS / (SUCCESS + FAILURE)`. `byResult.NONE` son las actividades sin resultado.
- **A tiempo:** una actividad `DONE` está a tiempo si la fecha local de `completed_at` es ≤ `due_date` de su tablero; los tableros igual con su propio `completed_at`. `onTime.evaluated` cuenta las terminadas con `completed_at` en el periodo. `overdueOpen`: actividades no terminadas ni canceladas cuyo tablero ya venció. `avgDaysToComplete`: promedio de días entre creación y `completed_at` (1 decimal, o `null`).
- `boards.total` y `byProgress`: tableros creados en el periodo; `overdue`: tableros abiertos (`PENDING`/`IN_PROGRESS`) ya vencidos, sin periodo.
- `patterns`: una entrada por dimensión, en este orden, con todos sus `buckets` (aunque `total` sea `0`):
  - `ASSIGNEES`: número de encargados — `0`, `1`, `2`, `3+`.
  - `ATTACHMENTS`: adjuntos — `NONE`, `LINK_ONLY`, `DOCUMENT_ONLY`, `BOTH`.
  - `DESCRIPTION`: `WITH`, `WITHOUT` descripción.
  - `LEAD_TIME`: días entre la creación de la actividad y el vencimiento del tablero — `LT_7`, `D7_30`, `GT_30`, `PAST` (creada ya vencida).
  - `BOARD_SIZE`: actividades del tablero — `S_1_5`, `M_6_15`, `L_16_PLUS`.
  - En cada bucket: `completionRate` (como arriba), `successRate` y `onTimeRate` sobre sus actividades.
- `faculties`, `areas`: cada una con los proyectos filtrados a los que pertenece; un proyecto de varias facultades cuenta en todas. Ordenadas por `completionRate` descendente (`null` al final) y luego por nombre.
- `tutors`: tutores responsables de tableros (`responsible_tutor_id`) del conjunto; sus actividades son las de esos tableros. `meetingsOrganized` y `meetingsAttended` cuentan reuniones del conjunto (abajo). Mismo orden.
- `deans`: decanos vigentes de las facultades presentes en `faculties`; sus actividades son las de los proyectos de sus facultades. Mismo orden.
- `meetings`: las del periodo cuyo proyecto está en el conjunto; con alcance global y sin filtros estructurales se suman las reuniones sin proyecto. Con `tutorId`, solo las que ese usuario organiza o a las que asiste. `totalMinutes` y `avgMinutes` excluyen las canceladas; `avgMinutes` y `avgParticipants` con 1 decimal o `null`.
- `attachments`: adjuntos de actividades del conjunto creados en el periodo. `byFormat` y `totalBytes` solo de los documentos. `activitiesWithAttachments`: actividades del conjunto con al menos un adjunto.
- `weekdays`: siempre 7 entradas, `day` ISO (`1` lunes … `7` domingo), en la zona horaria institucional.
- `monthly`: meses `YYYY-MM` del periodo en orden ascendente, sin huecos; si el periodo está abierto, desde el primer hecho hasta el mes actual, como máximo 24 meses (los más recientes).
- `comparison`: solo si hay `from` y `to`; el periodo anterior tiene la misma duración y termina el día antes de `from`. En otro caso `null`.

### Errores

| Código | Cuándo |
| --- | --- |
| `400` | Fecha inválida, `from` > `to`, periodo mayor de 366 días, UUID o `projectStatus` no válidos. |
| `401` | Sin sesión. |
| `403` | Sin rol `ADMIN`, `AREA_MANAGER` ni `DEAN`, o filtro fuera del alcance. |
| `404` | `areaId`, `facultyId`, `projectId` o `tutorId` inexistentes. |
