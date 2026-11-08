# API de preferencias de notificación y envío de copias

> **Estado:** implementado en `apps/backend/src/modules/integrations/` y cubierto por `apps/backend/test/notifications.e2e-spec.ts`. Los parsers y los canales tienen pruebas unitarias (`dtos/preferences.dto.spec.ts`, `models/preferences.spec.ts`, `services/channels/*.spec.ts`, `config/notifications.config.spec.ts`). Decisiones: [ADR 0005](../decisions/0005-notificaciones-y-copias-externas.md) y, para WhatsApp, [ADR 0006](../decisions/0006-whatsapp-con-builderbot.md).
> Novedades y audiencias: [`announcements.md`](announcements.md). Autenticación: [`auth.md`](auth.md). Variables de entorno: [`apps/backend/.env.example`](../../apps/backend/.env.example).

Todas las rutas requieren una sesión válida (cookie de Auth.js). El prefijo global es `/api`.

Cada usuario decide, para cada **tipo de aviso** (`NotificationKind`) y cada **canal**, si quiere recibir copia. El correo y WhatsApp son copias de las novedades publicadas y de los avisos de reuniones ([`meetings.md`](meetings.md#avisos)); no sustituyen al feed de [`announcements.md`](announcements.md).

## Endpoints

| Método y ruta | Permiso | Código de éxito |
| --- | --- | --- |
| `GET /api/me/notification-preferences` | Cualquier sesión válida (solo las propias) | `200` |
| `PUT /api/me/notification-preferences` | Cualquier sesión válida (solo las propias) | `200` |

Ambas rutas operan siempre sobre el usuario de la sesión: no reciben identificador de usuario. No hay un endpoint para consultar ni cambiar las preferencias de otra persona, ni siquiera para un administrador.

## Modelo de preferencias

Hay 5 tipos × 2 canales = **10 combinaciones**. Si el usuario no tiene fila guardada para una combinación, se aplica el valor por defecto:

| Canal | Valor por defecto | Motivo |
| --- | --- | --- |
| `EMAIL` | Activado (`true`) | — |
| `WHATSAPP` | Desactivado (`false`) | Exige teléfono y consentimiento expreso (ADR 0005). |

Tipos: `NEWS`, `COMMUNICATION`, `CHANGE`, `NOTIFICATION` (los cuatro tipos de novedad) y `MEETING` (avisos de reuniones: invitación, recordatorios y cancelación). Canales: `EMAIL`, `WHATSAPP`.

`GET` devuelve siempre la matriz completa de 10 elementos, aunque no haya filas guardadas, en este orden: por tipo (`NEWS`, `COMMUNICATION`, `CHANGE`, `NOTIFICATION`, `MEETING`) y, dentro de cada tipo, `EMAIL` y luego `WHATSAPP`.

## `GET /api/me/notification-preferences`

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Correcto | `{ phone, preferences }` (ver abajo). |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |

```json
{
  "phone": null,
  "preferences": [
    { "kind": "NEWS", "channel": "EMAIL", "enabled": true },
    { "kind": "NEWS", "channel": "WHATSAPP", "enabled": false },
    { "kind": "COMMUNICATION", "channel": "EMAIL", "enabled": true },
    { "kind": "COMMUNICATION", "channel": "WHATSAPP", "enabled": false },
    { "kind": "CHANGE", "channel": "EMAIL", "enabled": true },
    { "kind": "CHANGE", "channel": "WHATSAPP", "enabled": false },
    { "kind": "NOTIFICATION", "channel": "EMAIL", "enabled": true },
    { "kind": "NOTIFICATION", "channel": "WHATSAPP", "enabled": false },
    { "kind": "MEETING", "channel": "EMAIL", "enabled": true },
    { "kind": "MEETING", "channel": "WHATSAPP", "enabled": false }
  ]
}
```

`phone` es el teléfono guardado en formato E.164, o `null` si no hay.

## `PUT /api/me/notification-preferences`

Actualización **parcial**: lo que no se envía se conserva. No hay que enviar la matriz completa.

### Cuerpo (`application/json`)

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `phone` | string \| null | No | Teléfono internacional E.164. `null` lo borra. Se normaliza (ver abajo). |
| `preferences` | array | No | Entre 1 y 10 elementos; cada uno con `kind`, `channel` y `enabled`. |

Debe indicarse al menos uno de los dos campos. Cualquier campo desconocido en el cuerpo o dentro de un elemento se rechaza.

Cada elemento de `preferences`:

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `kind` | string | Sí | `NEWS`, `COMMUNICATION`, `CHANGE`, `NOTIFICATION` o `MEETING`. |
| `channel` | string | Sí | `EMAIL` o `WHATSAPP`. |
| `enabled` | boolean | Sí | `true` para recibir, `false` para no recibir. |

No se permiten dos elementos con la misma combinación `kind` + `channel`.

### Normalización del teléfono

Antes de validar se quitan los espacios, guiones, puntos y paréntesis. Después debe cumplir E.164: `+`, un primer dígito entre 1 y 9 y entre 7 y 14 dígitos más (en total, de 8 a 15 dígitos tras el `+`).

| Entrada | Se guarda como |
| --- | --- |
| `+57 300 000 0001` | `+573000000001` |
| `+57-300-000-0001` | `+573000000001` |
| `+57 (300) 000.0001` | `+573000000001` |
| `3000000001` | `400` (falta el `+`) |

### Regla de WhatsApp

Si la petición **activa** WhatsApp (`channel: "WHATSAPP"`, `enabled: true`) y, tras aplicar el cambio, el usuario no tiene teléfono, la respuesta es `400` y no se guarda nada. El teléfono puede venir en la misma petición o estar ya registrado.

Borrar el teléfono (`phone: null`) **no** desactiva las preferencias de WhatsApp que ya estuvieran activas. En ese estado no se encolan copias por WhatsApp, porque el encolado exige teléfono.

### Ejemplo

```json
{
  "phone": "+57 300 000 0001",
  "preferences": [
    { "kind": "NOTIFICATION", "channel": "WHATSAPP", "enabled": true },
    { "kind": "NOTIFICATION", "channel": "EMAIL", "enabled": false }
  ]
}
```

Respuesta `200` (el resto de combinaciones conserva su valor):

```json
{
  "phone": "+573000000001",
  "preferences": [
    { "kind": "NEWS", "channel": "EMAIL", "enabled": true },
    { "kind": "NEWS", "channel": "WHATSAPP", "enabled": false },
    { "kind": "COMMUNICATION", "channel": "EMAIL", "enabled": true },
    { "kind": "COMMUNICATION", "channel": "WHATSAPP", "enabled": false },
    { "kind": "CHANGE", "channel": "EMAIL", "enabled": true },
    { "kind": "CHANGE", "channel": "WHATSAPP", "enabled": false },
    { "kind": "NOTIFICATION", "channel": "EMAIL", "enabled": false },
    { "kind": "NOTIFICATION", "channel": "WHATSAPP", "enabled": true },
    { "kind": "MEETING", "channel": "EMAIL", "enabled": true },
    { "kind": "MEETING", "channel": "WHATSAPP", "enabled": false }
  ]
}
```

La escritura es atómica: el teléfono y las preferencias se guardan en una sola transacción. Si algo falla, no se aplica ningún cambio.

### Respuestas

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Actualizado | `{ phone, preferences }` con la matriz combinada. |
| `400` | Cuerpo inválido o WhatsApp activado sin teléfono | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |

Mensajes de validación exactos:

- `El cuerpo debe ser un objeto JSON.`
- `Campos no permitidos: campo1, campo2.`
- `Debe indicar al menos un campo para actualizar.`
- `phone debe estar en formato internacional E.164, p. ej. +573001234567.`
- `preferences debe ser una lista de 1 a 10 elementos.`
- `preferences contiene combinaciones repetidas de kind y channel.`
- `preferences[0] debe ser un objeto.`
- `preferences[0]: campos no permitidos: foo.`
- `preferences[0].kind es obligatorio.`
- `preferences[0].kind no es válido. Valores permitidos: NEWS, COMMUNICATION, CHANGE, NOTIFICATION, MEETING.`
- `preferences[0].channel es obligatorio.`
- `preferences[0].channel no es válido. Valores permitidos: EMAIL, WHATSAPP.`
- `preferences[0].enabled es obligatorio.`
- `preferences[0].enabled debe ser un booleano.`
- `Para recibir copias por WhatsApp debes registrar un teléfono.`

Los errores de validación se acumulan en `errors`; el índice `[0]` es el del elemento que falla. El error de WhatsApp sin teléfono se devuelve solo, después de que la validación haya pasado:

```json
{
  "message": "Datos inválidos.",
  "errors": ["Para recibir copias por WhatsApp debes registrar un teléfono."]
}
```

## Envío de copias

Las copias se deciden **al encolarlas** (al publicar la novedad, o al crear o cancelar una reunión) y se envían después, en segundo plano, sin bloquear la petición. Cambiar las preferencias más tarde no altera las copias ya encoladas. Los avisos de reuniones se filtran por el tipo `MEETING`.

### Bandeja de salida

El mensaje se guarda una vez por origen y aviso en `notification_dispatches`; cada destinatario y canal tiene una fila en `notification_deliveries`.

**`notification_dispatches`**

| Campo | Contenido |
| --- | --- |
| `announcement_id` | Novedad de la que es copia; `null` si el origen es una reunión. Una novedad tiene como máximo una copia guardada. |
| `meeting_id` | Reunión de la que es aviso; `null` si el origen es una novedad. |
| `purpose` | `ANNOUNCEMENT` (novedad, valor por defecto), `MEETING_INVITATION`, `MEETING_REMINDER` o `MEETING_CANCELLATION`. |
| `kind` | Tipo de la copia: el de la novedad, o `MEETING` para las reuniones. |
| `subject` | Asunto redactado, p. ej. `[Noticia] Convocatoria`. |
| `body` | Cuerpo redactado, con el contenido, el autor y `Gestor de Semilleros`. |
| `scheduled_for` | Desde cuándo se envía (por defecto, al encolar). Los recordatorios de reunión se programan a futuro. |
| `expires_at` | Si se define, después de ese momento la copia se descarta sin enviarse; `null` si no vence (novedades). |

Cada copia tiene un único origen: una novedad **o** una reunión. Los envíos de una reunión se crean en `POST /api/meetings` y `PATCH /api/meetings/:id/status` ([`meetings.md`](meetings.md#avisos)). Al encolar, `next_attempt_at` de cada envío es `scheduled_for`.

Si no hay ningún envío que encolar, **no se crea** la fila de `notification_dispatches`. La novedad y su bandeja de salida se crean en la misma transacción.

**`notification_deliveries`**

| Campo | Contenido |
| --- | --- |
| `dispatch_id` | Copia a la que pertenece. |
| `user_id` | Destinatario. |
| `channel` | `EMAIL` o `WHATSAPP`. |
| `status` | `PENDING`, `SENT`, `FAILED` o `SKIPPED`. Por defecto `PENDING`. |
| `attempts` | Intentos realizados (incluye la reserva del intento en curso). |
| `last_error` | Último error o motivo de omisión; `null` si no aplica. |
| `next_attempt_at` | Cuándo toca el próximo intento. Al crear es `scheduled_for` (la hora actual salvo en los recordatorios). |
| `sent_at` | Cuándo se envió; `null` si no se ha enviado. |

La combinación `dispatch_id` + `user_id` + `channel` es única. Al encolar se descartan los destinatarios inactivos y se excluye al autor; WhatsApp solo se encola si el usuario tiene teléfono.

### Estados

| Estado | Significado |
| --- | --- |
| `PENDING` | Encolado, esperando su turno o programado para un reintento. |
| `SENT` | El canal aceptó el envío. Se guarda `sent_at` y se limpia `last_error`. |
| `FAILED` | Fallo definitivo: el canal lo marcó como no reintentable o se agotaron los intentos. |
| `SKIPPED` | No se intentó o no se volverá a intentar por una condición del destinatario, del canal o de la novedad. |

Motivos de `SKIPPED` (se guardan en `last_error`):

- `Usuario inactivo.`: el usuario fue desactivado después de encolar.
- `El usuario no tiene dirección para este canal.`: no hay correo o teléfono.
- `Canal desactivado.`: el canal dejó de estar registrado después de encolar.
- `Novedad eliminada.`: la novedad se eliminó antes de enviar la copia.
- `Reunión cancelada.`: la reunión se canceló y se anularon sus envíos pendientes (invitación y recordatorios).
- `El aviso dejó de ser vigente antes de poder enviarse.`: la copia superó su `expires_at` sin enviarse (p. ej. un recordatorio o una invitación cuando la reunión ya empezó).
- `La copia no pudo enviarse en 24 h (canal no disponible); se descartó para no enviar un aviso vencido.`: la copia superó `NOTIFICATIONS_MAX_DEFER_HOURS` (24 por defecto) desde su `scheduled_for` sin enviarse (es decir, desde que debía salir, no desde que se encoló). Así no se envían de golpe avisos viejos cuando el canal vuelve o el backend se reinicia tras mucho tiempo apagado.

Al eliminar una novedad, todos sus envíos `PENDING` pasan a `SKIPPED` con `Novedad eliminada.`; al cancelar una reunión, los de la reunión pasan a `SKIPPED` con `Reunión cancelada.`.

### Reintentos

El despachador (`DeliveryDispatcher`) procesa como máximo **100 envíos por ciclo**, ordenados por `next_attempt_at` ascendente, y solo los `PENDING` cuya hora ya llegó (los recordatorios programados esperan a su `scheduled_for`).

1. **Reserva de 5 minutos.** Antes de enviar, cada fila se reclama con una actualización condicional: incrementa `attempts` y fija `next_attempt_at = ahora + 5 minutos`. Si otra instancia ya la reclamó, la actualización no afecta filas y se omite. Así dos instancias no envían la misma copia. Si el proceso muere con la reserva tomada, la fila vuelve a estar disponible al vencer esos 5 minutos.
2. **Envío.** Si la copia ya superó su `expires_at`, se marca `SKIPPED` con `El aviso dejó de ser vigente antes de poder enviarse.`. Si lleva más de `NOTIFICATIONS_MAX_DEFER_HOURS` horas desde su `scheduled_for`, se marca `SKIPPED` por vencida. Si no, se resuelve la dirección (`email` o `phone`) y el canal; si el usuario está inactivo, falta la dirección o el canal no existe, también se marca `SKIPPED`.
3. **Resultado.**
   - Éxito: `SENT`.
   - **Canal no disponible** (p. ej. WhatsApp desconectado): la copia queda **en espera**. Vuelve a `PENDING`, se **devuelve el intento** reservado (no cuenta para `NOTIFICATIONS_MAX_ATTEMPTS`) y se prueba de nuevo cada minuto hasta que el canal vuelva o la copia venza a las `NOTIFICATIONS_MAX_DEFER_HOURS` horas de su `scheduled_for` (o supere su `expires_at`).
   - Error reintentable y `attempts < NOTIFICATIONS_MAX_ATTEMPTS`: vuelve a `PENDING` con espera exponencial.
   - Error no reintentable o intentos agotados: `FAILED`. `last_error` se recorta a 500 caracteres.

La espera es `backoffMs(attempts) = min(60 s × 2^(attempts − 1), 60 min)`:

| Intento que falla | Espera hasta el siguiente |
| --- | --- |
| 1 | 1 minuto |
| 2 | 2 minutos |
| 3 | 4 minutos |
| 4 | 8 minutos |
| 5 | 16 minutos |
| 6 | 32 minutos |
| 7 o más | 60 minutos (tope) |

`NOTIFICATIONS_MAX_ATTEMPTS` es el número máximo de intentos por envío. Por defecto **5**; rango 1–20. Al llegar al máximo, el siguiente fallo deja el envío en `FAILED`. Un envío ya `SENT`, `FAILED` o `SKIPPED` no se vuelve a procesar.

El ciclo se lanza justo después de encolar (`kick`) y cada `NOTIFICATIONS_DISPATCH_INTERVAL` segundos (por defecto 60; rango 5–3600). Si `NOTIFICATIONS_AUTO_DISPATCH` es `false`, no hay temporizador ni `kick`: los pendientes solo se procesan si algo llama al despachador en el proceso. No hay endpoint HTTP para forzarlo.

### Canales

#### `EMAIL`: SMTP con nodemailer

- Envía correo de **texto plano**: `from` (configurado en `EMAIL_FROM`), `to`, `subject` y `text`.
- El transporte usa `SMTP_HOST`, `SMTP_PORT` y `SMTP_SECURE`; si hay credenciales, se autentica con `SMTP_USER` y `SMTP_PASSWORD`.
- Errores **no reintentables**: respuesta SMTP `5xx`, destinatario rechazado (`EENVELOPE`) y credenciales rechazadas (`EAUTH`).
- El resto de fallos (red, timeouts, `4xx`) se reintentan.

#### `WHATSAPP`: BuilderBot con provider intercambiable (Baileys)

- Envía el texto a través de la conexión de WhatsApp que mantiene el backend con BuilderBot ([ADR 0006](../decisions/0006-whatsapp-con-builderbot.md)). El provider se elige con `WHATSAPP_PROVIDER`; hoy solo existe Baileys, que usa WhatsApp Web.
- No hay plantillas: el mensaje es texto libre con el asunto en negrita (`*…*`), una línea en blanco y el cuerpo. Se trunca a 4000 caracteres (con `…` al final si sobra texto).
- El teléfono debe estar registrado en E.164. El destinatario se envía sin el `+` inicial.
- Si WhatsApp no está conectado (estado distinto de `connected`), la copia queda **en espera sin gastar intentos** y se vuelve a probar cada minuto; sale en cuanto la sesión se reconecta. Si pasan más de `NOTIFICATIONS_MAX_DEFER_HOURS` horas (24 por defecto) desde su `scheduled_for`, se descarta (`SKIPPED`). Los errores del provider estando conectado sí gastan intentos.
- Los errores del provider también se consideran reintentables; el motivo se guarda recortado a 300 caracteres.

#### `log`: registro sin envío real

- No envía nada: escribe en el log `[CANAL] → dirección enmascarada · asunto` y el envío se marca `SENT`.
- Enmascara correos como `a***@example.test` (primera letra del usuario y dominio) y teléfonos como `+***0001` (últimos cuatro dígitos).
- Es el valor por defecto de ambos canales: ningún entorno envía mensajes reales sin configurarlo.

#### `disabled`

- El canal no se registra. Al publicar no se crean envíos para él: no suma en `queuedDeliveries` y su conteo en el resumen queda en `0`.

### Variables relacionadas

| Variable | Efecto |
| --- | --- |
| `NOTIFICATIONS_EMAIL_TRANSPORT` | `smtp`, `log` o `disabled`. Por defecto `log`. |
| `NOTIFICATIONS_WHATSAPP_TRANSPORT` | `builderbot`, `log` o `disabled`. Por defecto `log`. |
| `NOTIFICATIONS_AUTO_DISPATCH` | `true` o `false`. Por defecto `true`. |
| `NOTIFICATIONS_DISPATCH_INTERVAL` | Segundos entre ciclos. Por defecto 60; rango 5–3600. |
| `NOTIFICATIONS_MAX_ATTEMPTS` | Intentos máximos por envío. Por defecto 5; rango 1–20. |
| `NOTIFICATIONS_MAX_DEFER_HOURS` | Horas máximas que una copia puede esperar a enviarse, contadas desde su `scheduled_for` (las esperas por canal no disponible no gastan intentos). Por defecto 24; rango 1–168. |

El resto de variables de SMTP y WhatsApp (`WHATSAPP_PROVIDER`, `WHATSAPP_SESSION_NAME`, `WHATSAPP_PAIRING_PHONE`) se describen en [`apps/backend/.env.example`](../../apps/backend/.env.example).

## Conexión de WhatsApp (administrador)

Solo aplica con `NOTIFICATIONS_WHATSAPP_TRANSPORT=builderbot`. El backend arranca el provider al iniciar el módulo, sin bloquear el arranque de la API, y sigue su estado para poder vincular la cuenta.

| Método y ruta | Permiso | Código de éxito |
| --- | --- | --- |
| `GET /api/integrations/whatsapp/status` | Rol `ADMIN` | `200` |
| `GET /api/integrations/whatsapp/qr` | Rol `ADMIN` | `200` (PNG) |

Ambas rutas exigen una sesión válida (`401` sin ella) y el rol `ADMIN` (`403` con `{ "message": "No tienes permisos para realizar esta acción." }`).

### `GET /api/integrations/whatsapp/status`

Con el transporte `builderbot` devuelve:

```json
{
  "transport": "builderbot",
  "provider": "baileys",
  "state": "awaiting_qr",
  "connectedPhone": null,
  "qr": "2@…",
  "pairingCode": null,
  "detail": null,
  "updatedAt": "2026-11-06T12:00:00.000Z"
}
```

| Campo | Contenido |
| --- | --- |
| `transport` | Siempre `builderbot` en esta forma. |
| `provider` | Provider configurado (`WHATSAPP_PROVIDER`). |
| `state` | Estado de la conexión (ver abajo). |
| `connectedPhone` | Número vinculado, enmascarado (`+***0001`); `null` si aún no se conoce. |
| `qr` | Texto del QR a escanear; solo en `awaiting_qr`. |
| `pairingCode` | Código de emparejamiento; solo en `awaiting_pairing_code`, cuando se definió `WHATSAPP_PAIRING_PHONE`. |
| `detail` | Último aviso del provider, p. ej. el motivo de `auth_failure`. |
| `updatedAt` | Momento del último cambio de estado (ISO 8601). |

Estados:

| Estado | Significado |
| --- | --- |
| `stopped` | La conexión no está iniciada o se detuvo al apagar la aplicación. |
| `starting` | El provider se está construyendo e iniciando. |
| `awaiting_qr` | Espera que se escanee el QR (`qr`). |
| `awaiting_pairing_code` | Espera que se introduzca el código de emparejamiento (`pairingCode`). |
| `connected` | Cuenta vinculada: los envíos pueden salir. |
| `auth_failure` | Fallo de autenticación; `detail` explica el motivo. |

Con transporte `log` o `disabled` no hay conexión y la respuesta es solo `{ "transport": "log" }` o `{ "transport": "disabled" }`.

### `GET /api/integrations/whatsapp/qr`

Devuelve el QR como imagen PNG (`Content-Type: image/png`, `Content-Disposition: inline`) mientras el estado es `awaiting_qr`. Se escanea desde **WhatsApp → Dispositivos vinculados**.

- `404` si no hay un QR pendiente (conectado, con código de emparejamiento, con transporte `log`/`disabled` o sin imagen generada): `{ "message": "No hay un QR pendiente de escanear." }`.

### Cómo vincular la cuenta

1. Define `NOTIFICATIONS_WHATSAPP_TRANSPORT=builderbot` y arranca el backend.
2. Inicia sesión como administrador y consulta `GET /api/integrations/whatsapp/status`.
3. Si el estado es `awaiting_qr`, abre `GET /api/integrations/whatsapp/qr` y escanea el QR. Si definiste `WHATSAPP_PAIRING_PHONE`, usa el `pairingCode` del estado.
4. Cuando el estado pase a `connected`, el canal `WHATSAPP` enviará por esa sesión.

La sesión de Baileys se guarda en `apps/backend/<WHATSAPP_SESSION_NAME>_sessions/` y el QR en `<WHATSAPP_SESSION_NAME>.qr.png`. Están ignorados por git y deben tratarse como secretos: borrar la carpeta de sesión desvincula la cuenta.

> ⚠️ Baileys usa WhatsApp Web, que **no es la API oficial** de Meta. Conviene un número dedicado y existe riesgo de bloqueo si se hacen envíos masivos.

### Añadir otro provider

El backend solo usa la forma común de los providers de BuilderBot (`sendMessage` y los eventos `ready`, `require_action`, `auth_failure` y `host`). Para añadir uno nuevo, por ejemplo `@builderbot/provider-meta`:

1. Instala el paquete `@builderbot/provider-*`.
2. Añade su nombre a `WHATSAPP_PROVIDERS` en `apps/backend/src/config/notifications.config.types.ts`.
3. Escribe su fábrica en `WHATSAPP_PROVIDER_FACTORIES` (`apps/backend/src/modules/integrations/services/whatsapp/provider-factories.ts`), cargándolo de forma diferida.
4. Selecciónalo con `WHATSAPP_PROVIDER`.

No se arranca el servidor HTTP de BuilderBot (`createBot().httpServer()`) porque escucha en todas las interfaces y publicaría el QR de vinculación en un puerto abierto: cualquiera que lo alcanzara podría vincular su cuenta. Solo se inicia la conexión del provider (`initVendor`), y el estado y el QR se consultan por las rutas de administrador de arriba. Un provider que necesite un webhook tendrá que definir en su fábrica cómo exponerlo.

## Errores comunes

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `400` | Cuerpo inválido o WhatsApp activado sin teléfono | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión, sesión expirada o usuario desactivado | `{ message: "Sesión no válida o expirada." }` |

En las rutas de preferencias no hay `403` ni `404`: solo operan sobre el usuario de la sesión. Las rutas de conexión de WhatsApp sí pueden responder `403` (sin rol `ADMIN`) y `404` (sin QR pendiente), como se describe arriba.

## Pendiente

- **Envíos por eventos**: no se avisa al encargado asignado, al tutor que debe aprobar ni al autor de cambios de estado.
- **Preferencias por proyecto o por novedad concreta**: solo existen por tipo y canal.
- **Consentimiento y verificación del teléfono**: no hay flujo en la aplicación para confirmar el consentimiento de WhatsApp ni para verificar el número (ADR 0005).
- **Detalle de envíos**: no hay endpoint para listar destinatarios, errores ni reintentos; solo el resumen de [`announcements.md`](announcements.md#get-apiannouncementsiddeliveries).
- **Cola externa**: el despachador vive en el proceso; con varias instancias todas sondean la base, aunque la reserva evita duplicados.
- **Correo HTML, enlaces a la aplicación y adjuntos**: no implementados; el correo es solo texto plano.
