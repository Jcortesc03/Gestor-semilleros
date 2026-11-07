# API de preferencias de notificación y envío de copias

> **Estado:** implementado en `apps/backend/src/modules/integrations/` y cubierto por `apps/backend/test/notifications.e2e-spec.ts`. Los parsers y los canales tienen pruebas unitarias (`dtos/preferences.dto.spec.ts`, `models/preferences.spec.ts`, `services/channels/*.spec.ts`, `config/notifications.config.spec.ts`). Decisión: [ADR 0005](../decisions/0005-notificaciones-y-copias-externas.md).
> Novedades y audiencias: [`announcements.md`](announcements.md). Autenticación: [`auth.md`](auth.md). Variables de entorno: [`apps/backend/.env.example`](../../apps/backend/.env.example).

Todas las rutas requieren una sesión válida (cookie de Auth.js). El prefijo global es `/api`.

Cada usuario decide, para cada **tipo de novedad** y cada **canal**, si quiere recibir copia. El correo y WhatsApp son copias de las novedades publicadas; no sustituyen al feed de [`announcements.md`](announcements.md).

## Endpoints

| Método y ruta | Permiso | Código de éxito |
| --- | --- | --- |
| `GET /api/me/notification-preferences` | Cualquier sesión válida (solo las propias) | `200` |
| `PUT /api/me/notification-preferences` | Cualquier sesión válida (solo las propias) | `200` |

Ambas rutas operan siempre sobre el usuario de la sesión: no reciben identificador de usuario. No hay un endpoint para consultar ni cambiar las preferencias de otra persona, ni siquiera para un administrador.

## Modelo de preferencias

Hay 4 tipos × 2 canales = **8 combinaciones**. Si el usuario no tiene fila guardada para una combinación, se aplica el valor por defecto:

| Canal | Valor por defecto | Motivo |
| --- | --- | --- |
| `EMAIL` | Activado (`true`) | — |
| `WHATSAPP` | Desactivado (`false`) | Exige teléfono y consentimiento expreso (ADR 0005). |

Tipos: `NEWS`, `COMMUNICATION`, `CHANGE`, `NOTIFICATION`. Canales: `EMAIL`, `WHATSAPP`.

`GET` devuelve siempre la matriz completa de 8 elementos, aunque no haya filas guardadas, en este orden: por tipo (`NEWS`, `COMMUNICATION`, `CHANGE`, `NOTIFICATION`) y, dentro de cada tipo, `EMAIL` y luego `WHATSAPP`.

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
    { "kind": "NOTIFICATION", "channel": "WHATSAPP", "enabled": false }
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
| `preferences` | array | No | Entre 1 y 8 elementos; cada uno con `kind`, `channel` y `enabled`. |

Debe indicarse al menos uno de los dos campos. Cualquier campo desconocido en el cuerpo o dentro de un elemento se rechaza.

Cada elemento de `preferences`:

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `kind` | string | Sí | `NEWS`, `COMMUNICATION`, `CHANGE` o `NOTIFICATION`. |
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
    { "kind": "NOTIFICATION", "channel": "WHATSAPP", "enabled": true }
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
- `preferences debe ser una lista de 1 a 8 elementos.`
- `preferences contiene combinaciones repetidas de kind y channel.`
- `preferences[0] debe ser un objeto.`
- `preferences[0]: campos no permitidos: foo.`
- `preferences[0].kind es obligatorio.`
- `preferences[0].kind no es válido. Valores permitidos: NEWS, COMMUNICATION, CHANGE, NOTIFICATION.`
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

Las copias se deciden **al publicar** la novedad y se envían después, en segundo plano, sin bloquear la petición. Cambiar las preferencias más tarde no altera las copias ya encoladas.

### Bandeja de salida

El mensaje se guarda una vez por novedad en `notification_dispatches`; cada destinatario y canal tiene una fila en `notification_deliveries`.

**`notification_dispatches`**

| Campo | Contenido |
| --- | --- |
| `announcement_id` | Novedad de la que es copia. Único: una novedad tiene como máximo una copia guardada. |
| `kind` | Tipo de la novedad. |
| `subject` | Asunto redactado, p. ej. `[Noticia] Convocatoria`. |
| `body` | Cuerpo redactado, con el contenido, el autor y `Gestor de Semilleros`. |

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
| `next_attempt_at` | Cuándo toca el próximo intento. Al crear es la hora actual. |
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

Al eliminar una novedad, todos sus envíos `PENDING` pasan a `SKIPPED` con `Novedad eliminada.`.

### Reintentos

El despachador (`DeliveryDispatcher`) procesa como máximo **100 envíos por ciclo**, ordenados por `next_attempt_at` ascendente, y solo los `PENDING` cuya hora ya llegó.

1. **Reserva de 5 minutos.** Antes de enviar, cada fila se reclama con una actualización condicional: incrementa `attempts` y fija `next_attempt_at = ahora + 5 minutos`. Si otra instancia ya la reclamó, la actualización no afecta filas y se omite. Así dos instancias no envían la misma copia. Si el proceso muere con la reserva tomada, la fila vuelve a estar disponible al vencer esos 5 minutos.
2. **Envío.** Se resuelve la dirección (`email` o `phone`) y el canal. Si el usuario está inactivo, falta la dirección o el canal no existe, se marca `SKIPPED`.
3. **Resultado.**
   - Éxito: `SENT`.
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

#### `WHATSAPP`: WhatsApp Cloud API de Meta

- Hace `POST https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages` con `Authorization: Bearer {WHATSAPP_ACCESS_TOKEN}` y un tiempo límite de 10 segundos.
- Usa una **plantilla** (`WHATSAPP_TEMPLATE_NAME`, idioma `WHATSAPP_TEMPLATE_LANGUAGE`) con dos parámetros de cuerpo: `{{1}}` recibe el asunto y `{{2}}` el texto. Meta exige plantillas para los mensajes que inicia la empresa.
- La plantilla debe estar **aprobada en Meta** y el usuario debe haber **aceptado recibir mensajes** por WhatsApp. Ese consentimiento es un requisito de Meta: el backend no lo comprueba.
- El teléfono debe estar registrado en E.164. El destinatario se envía sin el `+` inicial.
- Los parámetros se sanean: los saltos de línea y tabulaciones se convierten en espacios y se recortan a 1000 caracteres (con `…` al final si sobra texto).
- Son reintentables los errores de red y las respuestas `429` y `5xx`; el resto de rechazos quedan `FAILED`. Si la respuesta de Meta incluye el token, se sustituye por `[token]` en el mensaje guardado.

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
| `NOTIFICATIONS_WHATSAPP_TRANSPORT` | `cloud-api`, `log` o `disabled`. Por defecto `log`. |
| `NOTIFICATIONS_AUTO_DISPATCH` | `true` o `false`. Por defecto `true`. |
| `NOTIFICATIONS_DISPATCH_INTERVAL` | Segundos entre ciclos. Por defecto 60; rango 5–3600. |
| `NOTIFICATIONS_MAX_ATTEMPTS` | Intentos máximos por envío. Por defecto 5; rango 1–20. |

El resto de variables de SMTP y WhatsApp Cloud API se describen en [`apps/backend/.env.example`](../../apps/backend/.env.example).

## Errores comunes

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `400` | Cuerpo inválido o WhatsApp activado sin teléfono | `{ message: "Datos inválidos.", errors: string[] }` |
| `401` | Sin sesión, sesión expirada o usuario desactivado | `{ message: "Sesión no válida o expirada." }` |

No hay `403` ni `404`: las rutas solo operan sobre el usuario de la sesión.

## Pendiente

- **Envíos por eventos**: no se avisa al encargado asignado, al tutor que debe aprobar ni al autor de cambios de estado.
- **Preferencias por proyecto o por novedad concreta**: solo existen por tipo y canal.
- **Consentimiento y verificación del teléfono**: no hay flujo en la aplicación para confirmar el consentimiento de WhatsApp ni para verificar el número (ADR 0005).
- **Detalle de envíos**: no hay endpoint para listar destinatarios, errores ni reintentos; solo el resumen de [`announcements.md`](announcements.md#get-apiannouncementsiddeliveries).
- **Cola externa**: el despachador vive en el proceso; con varias instancias todas sondean la base, aunque la reserva evita duplicados.
- **Correo HTML, enlaces a la aplicación y adjuntos**: no implementados; el correo es solo texto plano.
