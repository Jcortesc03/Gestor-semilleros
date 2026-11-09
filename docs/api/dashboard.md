# API del panel por rol

> **Estado:** implementado ([ADR 0009](../decisions/0009-directorio-catalogos-y-paneles.md)). Solo lectura.
>
> **Pruebas:** unitarias de la agregación (`src/modules/dashboard/models/dashboard-aggregation.spec.ts`) y del servicio (`services/dashboard.service.spec.ts`); e2e en `apps/backend/test/dashboard.e2e-spec.ts` (401, alcance por rol, decanato terminado, roles sumados, archivados y vencidos).

## `GET /api/dashboard`

**Requiere** sesión válida. Devuelve **una sección por cada rol global** del usuario, sumadas (P-02), en este orden: `ADMIN`, `AREA_MANAGER`, `DEAN`, `TUTOR`, `STUDENT`. Un usuario sin roles recibe `sections: []`.

### Alcance de cada sección

| Rol | Proyectos incluidos | Actividades contadas |
| --- | --- | --- |
| `ADMIN` | Todos | Todas las de esos proyectos |
| `AREA_MANAGER` | Los del área o áreas asignadas en `area_managers` (P-08, solo lectura de métricas) | Todas las de esos proyectos |
| `DEAN` | Los vinculados a una facultad de la que es **decano vigente** (`ends_at` nulo o futuro) | Todas las de esos proyectos |
| `TUTOR` | Aquellos en los que es miembro `ACTIVE` con rol de proyecto `TUTOR` | Todas las de esos proyectos |
| `STUDENT` | Aquellos en los que es miembro `ACTIVE` como `STUDENT` o `STUDENT_LEADER` | Solo las **asignadas** a él |

Se excluyen proyectos, tableros y actividades con `deleted_at` (archivados).

### `200`

```json
{
  "generatedAt": "2026-11-07T15:00:00.000Z",
  "sections": [
    {
      "role": "TUTOR",
      "scope": { "areas": [{ "id": "uuid", "name": "Investigación" }], "faculties": [] },
      "projects": {
        "total": 1,
        "byStatus": { "ACTIVE": 1, "FINISHED": 0, "CANCELLED": 0 },
        "items": [
          {
            "id": "uuid", "title": "Proyecto demo de semillero", "status": "ACTIVE",
            "projectRole": "TUTOR",
            "boards": 2, "activities": 5, "activitiesDone": 1
          }
        ]
      },
      "boards": { "total": 2, "byProgress": { "PENDING": 1, "IN_PROGRESS": 1, "DONE": 0, "CANCELLED": 0 }, "overdue": 0 },
      "activities": { "total": 5, "byProgress": { "PENDING": 3, "IN_PROGRESS": 1, "DONE": 1, "CANCELLED": 0 }, "pendingApproval": 1 }
    }
  ]
}
```

- `scope.areas` solo se llena en `AREA_MANAGER`; `scope.faculties` solo en `DEAN`. En los demás, listas vacías.
- `projects.items`: hasta 10 proyectos, `ACTIVE` primero y luego por título. `projectRole` es el rol del usuario en el proyecto (`TUTOR`, `STUDENT`, `STUDENT_LEADER`) o `null` si lo ve por su rol global.
- `boards.overdue`: tableros con `due_date` anterior a hoy cuyo progreso no es `DONE` ni `CANCELLED`.
- `activities.pendingApproval`: actividades `DONE` con aprobación `PENDING`. En `STUDENT` es siempre `0`.
- Todos los conteos incluyen las cuatro claves del enum aunque valgan `0`.

Las reuniones y novedades del panel se obtienen con sus endpoints existentes (`GET /api/meetings`, `GET /api/announcements`).

| Código | Cuándo |
| --- | --- |
| `401` | Sin sesión: `{ message: "Sesión no válida o expirada." }` |
