# Reglas de negocio

> **Estado:** planificación. Reglas acordadas, todavía no implementadas. No inventar reglas adicionales.

- El seguimiento debe poder filtrarse por **semillero, integrante, tutor, facultad y decano**.
- En tareas se distinguen **progreso** (avance) y **resultado** (desenlace).
- Estados de tarea permitidos: `pendiente`, `en progreso`, `finalizado`, `cancelado`, `éxito`, `fracaso`.
- Un resultado (`éxito`/`fracaso`) no reemplaza al estado de progreso.
- Recordatorios y notificaciones pertenecen a un usuario o contexto; no son globales.
- Los documentos e imágenes se almacenan en AWS S3; sus metadatos, en PostgreSQL.
- La lógica de negocio vive en los servicios del backend, no en la UI ni en los controladores de transporte.
- Los permisos por rol están pendientes: consultar [`roles-permissions.md`](roles-permissions.md).

Las reglas nuevas deben aprobarse y documentarse aquí antes de implementarse.
