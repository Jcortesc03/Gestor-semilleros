# ADR 0005 · Novedades, notificaciones y copias por correo y WhatsApp

- **Estado:** Aceptada. El canal de WhatsApp (punto 5) lo reemplaza el [ADR 0006](0006-whatsapp-con-builderbot.md): BuilderBot con Baileys.
- **Fecha:** 2026-11-06

## Contexto

Se pidió un módulo para enviar notificaciones tal como las describe la documentación, y otro que envíe copias por correo y WhatsApp. Cada usuario debe poder elegir qué tipos de notificación recibe. Según P-16, la notificación es un **tipo de novedad** (`AnnouncementKind`) y la audiencia se calcula al consultar (DB-06). DB-06 preveía una tabla de entregas para cuando hubiera canales externos.

## Decisión

1. **Módulo `notifications`** (`/api/announcements`): publica, lista, consulta y elimina (lógicamente) novedades de los cuatro tipos con una o varias audiencias (`ALL`, `ROLE`, `FACULTY`, `AREA`, `PROJECT`; unión, RN-53). Los permisos están en `notifications/models/publish-scope.ts`:
   - **Encargado de área:** publica para todos o para roles (RN-51). También para **sus** áreas (`area_managers`), según el supuesto 🟡 de RN-51.
   - **Decano:** publica para **sus** facultades vigentes y para los proyectos de esas facultades (RN-52; la parte de proyectos es 🟡).
   - **Tipo `NOTIFICATION`:** solo el decano, según la matriz de permisos.
   - **Administrador:** cualquier audiencia y cualquier tipo. Es un **supuesto** coherente con su acceso total a los proyectos (ADR 0004); en la matriz figura como ❓.
   - **Eliminar y ver el estado de los envíos:** solo el autor o el administrador.
2. **Pertenencia a una audiencia**, calculada igual para el feed que para los destinatarios:
   - `FACULTY`: los decanos vigentes y los participantes activos de los proyectos de esa facultad.
   - `AREA`: los encargados del área y los participantes activos de sus proyectos.
   - `PROJECT`: los participantes activos.
   - El autor siempre ve lo que publicó y el administrador ve todo.
3. **Módulo `integrations`**: copias externas y preferencias (`/api/me/notification-preferences`). Cambios en la base de datos (migración `add_notification_delivery`):
   - `users.phone`: opcional, E.164, con CHECK `users_phone_e164`.
   - `notification_preferences` (usuario × tipo × canal → `enabled`). Sin fila se aplica el valor por defecto: **correo activado** y **WhatsApp desactivado**, porque WhatsApp exige teléfono y consentimiento expreso.
   - `notification_dispatches`: la bandeja de salida, con una copia del asunto y el cuerpo por novedad. Así el despachador no depende de las tablas de novedades.
   - `notification_deliveries`: un envío por destinatario y canal, con `status` (`PENDING`/`SENT`/`FAILED`/`SKIPPED`), `attempts`, `last_error` y `next_attempt_at`.
4. **Envío desacoplado.**
   - Al publicar, la novedad y sus envíos pendientes se crean en **la misma transacción**.
   - Un despachador en proceso los envía justo después y cada `NOTIFICATIONS_DISPATCH_INTERVAL` segundos.
   - Cada envío se reserva con una actualización condicional sobre `attempts`, para que dos instancias no envíen el mismo.
   - Los errores transitorios se reintentan con espera exponencial (de 1 minuto a 1 hora) hasta `NOTIFICATIONS_MAX_ATTEMPTS`. Los definitivos, como un destinatario o unas credenciales rechazados, quedan en `FAILED`.
   - Al eliminar una novedad se cancelan sus envíos pendientes.
5. **Canales.**
   - **Correo:** SMTP con **nodemailer 10.3.1**, nueva dependencia aprobada por el usuario.
   - **WhatsApp:** la API oficial de Meta (WhatsApp Cloud API) con `fetch`, sin dependencias. Usa una plantilla aprobada con dos parámetros, `{{1}}` el asunto y `{{2}}` el texto, porque Meta exige plantillas para los mensajes que inicia la empresa.
   - **`log`:** un driver que registra el envío con la dirección enmascarada. Es el valor por defecto de ambos canales, así ningún entorno envía mensajes reales sin configurarlo.
   - **`disabled`:** apaga el canal.
6. Parte del trabajo la hicieron agentes de opencode coordinados con Orca: los validadores, los canales SMTP, WhatsApp y log, la lectura de variables de entorno y la documentación de la API. Se revisó con la suite completa.

## Consecuencias

- El despachador vive en el mismo proceso, sin cola externa ni `@nestjs/schedule`. Con varias instancias, la reserva evita los duplicados, pero cada instancia sondea la base.
- El correo es solo texto plano. No hay plantillas HTML ni enlace a la aplicación web, que aún no existe.
- Pendiente:
  - Notificaciones automáticas por eventos de proyectos y tableros (asignaciones, aprobaciones).
  - Editar novedades (la matriz solo confirma crear).
  - Publicación programada (`published_at` futuro).
  - Recordatorios (P-19).
  - Verificar el teléfono.
  - Que el usuario confirme su consentimiento de WhatsApp desde la aplicación.
  - Los permisos del encargado de área siguen dependiendo de P-08.
