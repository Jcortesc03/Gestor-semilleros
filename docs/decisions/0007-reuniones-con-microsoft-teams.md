# ADR 0007 · Reuniones con Microsoft Teams

- **Estado:** Aceptada
- **Fecha:** 2026-11-06

## Contexto

Se pidió la integración con Microsoft Teams junto con el módulo de reuniones. Cada reunión que se crea debe:
- agendarse, con fecha y hora, en la cuenta vinculada de quien la crea;
- enviar el enlace y recordatorios a los participantes mediante notificaciones;
- guardar su estado (programada, en proceso, finalizada o cancelada);
- guardar, opcionalmente, un enlace de evidencia de la grabación.

El usuario decidió:
- **Vinculación:** OAuth propio con `fetch`, sin dependencias nuevas.
- **Sin cuenta vinculada o si Teams falla:** se rechaza la creación.
- **Estado:** automático según el horario y también manual.
- **Avisos:** al crear la reunión, y recordatorios 24 h y 1 h antes.

## Decisión

1. **Vincular la cuenta de Microsoft** (`/api/integrations/microsoft/*`, en el módulo `integrations`):
   - Usa OAuth 2.0 delegado con Microsoft Graph, con código de autorización y **PKCE (S256)**. Los permisos son `offline_access openid profile email User.Read Calendars.ReadWrite`.
   - **No es un inicio de sesión:** Auth.js sigue siendo el único mecanismo de autenticación.
   - **El `state`** lleva el usuario de la sesión y el `code_verifier`, cifrados con caducidad de 10 minutos, así que no hace falta una tabla de estados. Así el código no puede canjearse para otro usuario.
   - **Tokens:** se guardan **cifrados con AES-256-GCM** en `microsoft_accounts`, con la clave `MICROSOFT_TOKEN_ENCRYPTION_KEY`. Se renuevan solos cuando les quedan menos de 2 minutos.
   - **Si Microsoft responde `invalid_grant`,** se desvincula la cuenta y se pide volver a vincularla (409).
   - **Una cuenta de Microsoft solo puede estar vinculada a un usuario.**
   - **Sin `MICROSOFT_CLIENT_ID` y `MICROSOFT_CLIENT_SECRET`,** la integración queda desactivada y crear reuniones responde 503.
2. **Calendario:**
   - Se crea un evento en `/me/events` con `isOnlineMeeting` y `onlineMeetingProvider: teamsForBusiness`. Los participantes van como invitados, así que Outlook también les envía la invitación.
   - Se guardan `external_id` (el id del evento) y `join_url`.
   - Si Microsoft no genera el enlace de Teams, por ejemplo con una cuenta personal, el evento se borra y se responde 422.
   - Al cancelar la reunión, se cancela en Teams (`/cancel`).
3. **Orden de creación:**
   - Primero se crea en Teams. Si falla, no se guarda nada (409, 422, 502 o 503).
   - Después, en una transacción, se guardan la reunión, sus participantes y sus avisos.
   - Si esa transacción falla, se cancela el evento en Teams.
4. **Quién crea y quién participa:**
   - Crean reuniones el **tutor** (RN-73) y el administrador.
   - Con proyecto, solo un tutor de ese proyecto, y los participantes deben ser miembros activos del proyecto.
   - Sin proyecto (P-18), los participantes pueden ser cualquier usuario activo.
   - Ven la reunión el organizador, los participantes y el administrador.
   - Cambian el estado o la grabación el organizador y el administrador.
5. **Estado** (`MeetingStatus`):
   - **Automático:** `SCHEDULED` pasa a `IN_PROGRESS` al empezar y a `FINISHED` al acabar la duración. Se aplica con dos `UPDATE` antes de cada lectura.
   - **Manual:** de programada a en proceso o cancelada, y de en proceso a finalizada o cancelada. Finalizada y cancelada son estados finales.
   - Un CHECK garantiza que `cancelled_at` solo exista en las canceladas.
6. **Avisos de reunión** por la bandeja de salida del ADR 0005, generalizada:
   - `notification_dispatches` admite como origen una novedad **o** una reunión (CHECK `notification_dispatches_one_source`), con `purpose`, `scheduled_for` (envío programado) y `expires_at` (vigencia).
   - Las preferencias usan el nuevo enum `NotificationKind`, que son los cuatro tipos de novedad más `MEETING`. Así cada usuario elige si recibe por correo o WhatsApp los avisos de reuniones. La migración convierte las columnas conservando los datos.
   - **Invitación:** se envía al crear la reunión, a los participantes, con el enlace de Teams.
   - **Recordatorios:** 24 h y 1 h antes, a los participantes y al organizador. Solo se programan si aún están en el futuro y vencen al empezar la reunión.
   - **Cancelación:** anula los avisos pendientes y envía un aviso sin enlace.
   - El límite de `NOTIFICATIONS_MAX_DEFER_HOURS` se cuenta desde `scheduled_for`, para que un recordatorio programado con días de antelación no se considere vencido.
7. **Grabación:** `recording_url` es un enlace de evidencia **opcional** que el organizador registra a mano, porque la grabación puede fallar. No se obtiene de Graph.
8. **Fechas en los avisos:** se muestran en `MEETINGS_TIME_ZONE` (por defecto `America/Bogota`). En la base de datos y en la API se guardan en UTC.
9. **Reparto del trabajo:**
   - Agentes de opencode: la lectura de variables de entorno y el cifrado de tokens. Su cuota gratuita diaria se agotó a mitad de la tarea.
   - Subagentes de Claude (Sonnet): las pruebas de los clientes de Microsoft y del validador, y la documentación de la API.
   - Todo se verificó con la suite completa.

## Consecuencias

- **Requisitos de Microsoft:** hay que registrar una app en Entra ID, y las cuentas deben ser laborales o educativas con Teams.
- **Las pruebas no llaman a Microsoft:** usan implementaciones falsas de OAuth y Graph. Antes de producción falta una prueba manual con un inquilino real.
- **Pendiente:**
  - Reprogramar la reunión y editar sus participantes (también en Teams).
  - Sincronizar los cambios hechos directamente en Teams (P-18).
  - Obtener la grabación de forma automática.
  - Registrar la asistencia.
  - Enviar avisos dentro de la aplicación (hoy son por correo y WhatsApp, y el participante ve la reunión en `GET /api/meetings`).
