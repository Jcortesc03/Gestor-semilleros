# API de vinculación de la cuenta de Microsoft

> **Estado:** implementado en `apps/backend/src/modules/integrations/` (`controllers/microsoft.controller.ts`, `services/microsoft/`) y cubierto por `apps/backend/test/meetings.e2e-spec.ts`. Las utilidades tienen pruebas unitarias (`services/microsoft/*.spec.ts`, `models/token-cipher.spec.ts`, `config/microsoft.config.spec.ts`). Decisiones: [ADR 0007](../decisions/0007-reuniones-con-microsoft-teams.md) y [ADR 0014](../decisions/0014-cuentas-personales-de-microsoft.md) (tipo de cuenta, implementado). El tipo se detecta con el `tid` del `id_token` de la respuesta de token (se decodifica sin verificar la firma porque llega directo del endpoint de token por TLS y solo clasifica la cuenta); sin `id_token` se asume `WORK_OR_SCHOOL`.
> Reuniones que usan esta vinculación: [`meetings.md`](meetings.md). Autenticación: [`auth.md`](auth.md). Variables de entorno: [`apps/backend/.env.example`](../../apps/backend/.env.example).

Todas las rutas requieren una sesión válida (cookie de Auth.js; `401` con `{ "message": "Sesión no válida o expirada." }` si falta). El prefijo global es `/api`.

Cada usuario que organiza reuniones vincula **su propia** cuenta de Microsoft. Con ella, el backend agenda las reuniones en el calendario de Microsoft 365 del organizador, con un enlace de Teams.

> **No es un inicio de sesión.** Esta vinculación solo concede permisos de calendario al backend. Auth.js sigue siendo el único mecanismo de autenticación: para vincular la cuenta hay que haber iniciado sesión antes.

## Endpoints

| Método y ruta | Permiso | Código de éxito |
| --- | --- | --- |
| `GET /api/integrations/microsoft/status` | Cualquier sesión válida (solo la propia) | `200` |
| `GET /api/integrations/microsoft/connect` | Cualquier sesión válida | `302`, o `200` con `?format=json` |
| `GET /api/integrations/microsoft/callback` | Cualquier sesión válida (la misma que inició la vinculación) | `200`, o `302` si hay redirección configurada |
| `DELETE /api/integrations/microsoft/link` | Cualquier sesión válida | `204` |

Todas operan sobre el usuario de la sesión. `connect` y `callback` están pensadas para abrirse **en el navegador** (redirecciones, con la cookie de sesión), no para llamarse desde `fetch`.

## `GET /api/integrations/microsoft/status`

Siempre responde `200`, también cuando la integración no está configurada.

```json
{
  "configured": true,
  "linked": true,
  "email": "tutor@example.test",
  "linkedAt": "2026-11-06T15:00:00.000Z"
}
```

| Campo | Contenido |
| --- | --- |
| `configured` | `true` si el backend tiene las credenciales de Microsoft. |
| `linked` | `true` si el usuario tiene una cuenta vinculada. |
| `email` | Correo (`mail`, o `userPrincipalName` si no tiene buzón) de la cuenta vinculada; `null` si no hay. |
| `linkedAt` | Momento de la última vinculación (ISO 8601); `null` si no hay. |

Sin cuenta vinculada: `{ "configured": true, "linked": false, "email": null, "linkedAt": null }`. Los tokens nunca se devuelven.

## `GET /api/integrations/microsoft/connect`

Inicia la vinculación: genera la URL de consentimiento de Microsoft.

| Consulta | Efecto |
| --- | --- |
| (sin parámetros) | Responde `302` redirigiendo a Microsoft. |
| `?format=json` | Responde `200` con `{ "url": "https://login.microsoftonline.com/..." }` en lugar de redirigir. |

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `302` / `200` | Correcto | Redirección, o `{ url }`. |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `503` | La integración no está configurada | `La integración con Microsoft Teams no está configurada.` |

## `GET /api/integrations/microsoft/callback`

Es la URI de redirección que Microsoft invoca tras el consentimiento (`MICROSOFT_REDIRECT_URI`). No se llama a mano.

### Consulta

| Parámetro | Quién lo envía | Contenido |
| --- | --- | --- |
| `code` | Microsoft | Código de autorización. |
| `state` | Microsoft (el mismo que se envió en `connect`) | Sello cifrado de la vinculación. |
| `error` | Microsoft | Presente si el usuario no aceptó; si es texto, se ignora el resto de parámetros. |

### Resultado

Cuando `MICROSOFT_LINK_REDIRECT_URL` **no** está definida, el resultado es JSON. Cuando sí lo está, el navegador es redirigido (`302`) a esa URL añadiendo `?microsoft=linked` si se vinculó, o `?microsoft=error` si el usuario rechazó el consentimiento. Los demás errores (parámetros ausentes, `state` inválido, rechazo de Microsoft, cuenta ya vinculada, `503`) siempre son JSON.

Éxito (`200`, con el mismo cuerpo que `status`):

```json
{
  "configured": true,
  "linked": true,
  "email": "tutor@example.test",
  "linkedAt": "2026-11-06T15:00:00.000Z"
}
```

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `200` | Vinculada | Estado de la vinculación (o `302` a `MICROSOFT_LINK_REDIRECT_URL?microsoft=linked`). |
| `400` | El usuario no autorizó (`error`) | `{ "linked": false, "error": "Microsoft no autorizó la vinculación." }` (o `302` a `...?microsoft=error`). |
| `400` | Faltan `code` o `state` | `Faltan los parámetros code y state.` |
| `400` | `state` manipulado, caducado, de otro usuario o ilegible | `El enlace de vinculación no es válido o expiró; vuelve a iniciar la vinculación.` |
| `400` | Microsoft rechazó el código o falló la lectura del perfil | `Microsoft rechazó la vinculación; inténtalo de nuevo.` |
| `401` | Sin sesión o sesión expirada | `{ message: "Sesión no válida o expirada." }` |
| `409` | Esa cuenta de Microsoft ya está vinculada a otro usuario | `Esa cuenta de Microsoft ya está vinculada a otro usuario.` |
| `503` | La integración no está configurada | `La integración con Microsoft Teams no está configurada.` |

Volver a vincular reemplaza la vinculación existente del usuario y actualiza `linkedAt`.

## `DELETE /api/integrations/microsoft/link`

Desvincula la cuenta: borra la fila de `microsoft_accounts` del usuario y, con ella, sus tokens. Responde `204` sin cuerpo, también si no había nada vinculado. No revoca el consentimiento en Microsoft (se puede hacer desde la cuenta de Microsoft del usuario). Las reuniones ya creadas no se alteran; sin vinculación, no se pueden crear nuevas y la cancelación en Teams devuelve `teamsSynced: false` ([`meetings.md`](meetings.md#cancelación)).

| Código | Cuándo |
| --- | --- |
| `204` | Desvinculada (o no había vinculación) |
| `401` | Sin sesión o sesión expirada |

## Cómo funciona

### OAuth 2.0 con PKCE

Flujo de código de autorización con PKCE (`code_challenge_method=S256`), `response_mode=query` y `prompt=select_account` (Microsoft pide elegir la cuenta):

1. `connect` genera un verificador aleatorio de 32 bytes (base64url) y su reto (SHA-256 del verificador, en base64url), y construye la URL de `https://login.microsoftonline.com/<MICROSOFT_TENANT_ID>/oauth2/v2.0/authorize`.
2. Microsoft pide el consentimiento y vuelve a `callback` con `code` y `state`.
3. `callback` valida el `state`, canjea el `code` en el endpoint de tokens enviando el `code_verifier` y el secreto de cliente, y lee el perfil (identificador y correo) con Microsoft Graph (`GET /me`).
4. Se guardan los tokens cifrados y se responde con el estado.

### `state` cifrado

El `state` es un sello `AES-256-GCM` que contiene el **identificador del usuario de la sesión**, el verificador PKCE y una caducidad de **10 minutos**. No se guarda nada en el servidor entre `connect` y `callback`. En `callback` se rechaza (`400`) si no descifra, si caducó o si el usuario del `state` no es el de la sesión actual, de modo que un enlace de vinculación no sirve a otra persona.

### Permisos delegados

Se piden (`MICROSOFT_SCOPES`) estos permisos de Microsoft Graph, **delegados**, es decir, actúan en nombre del usuario:

`offline_access openid profile email User.Read Calendars.ReadWrite`

`offline_access` permite el token de renovación; `User.Read` identifica la cuenta; `Calendars.ReadWrite` crea y cancela los eventos con Teams. No requieren consentimiento de administrador obligatorio, aunque algunos inquilinos lo exigen.

### Tokens cifrados

En la tabla `microsoft_accounts` (una fila por usuario) se guardan:

| Campo | Contenido |
| --- | --- |
| `user_id` | Usuario del Gestor (clave primaria). |
| `microsoft_user_id` | Identificador del usuario en Entra ID. Único. |
| `email` | Correo de la cuenta. |
| `access_token_encrypted`, `refresh_token_encrypted` | Tokens cifrados con **AES-256-GCM** (formato `v1.<iv>.<tag>.<datos>` en base64url, con IV aleatorio). La clave es `MICROSOFT_TOKEN_ENCRYPTION_KEY`. |
| `access_token_expires_at` | Vencimiento del token de acceso. |
| `scopes` | Permisos concedidos. |
| `linked_at`, `updated_at` | Fechas. |

La fila se elimina si se borra el usuario.

### Renovación automática

Cada vez que el backend necesita llamar a Microsoft Graph, usa el token de acceso guardado si le quedan **más de 2 minutos**; si no, lo renueva con el token de renovación y guarda los nuevos tokens. Si Microsoft responde `invalid_grant` (vinculación revocada o vencida), el backend **desvincula la cuenta** y responde `409` con `Tu vinculación con Microsoft expiró o fue revocada; vuelve a vincular tu cuenta.` Cualquier otro fallo de renovación responde `503` con `No se pudo renovar el acceso a Microsoft; inténtalo más tarde.`

### Una cuenta por usuario

Un usuario tiene como máximo una cuenta vinculada, y una cuenta de Microsoft solo puede estar vinculada a un usuario (`409` si ya pertenece a otro).

### Tipo de cuenta ([ADR 0014](../decisions/0014-cuentas-personales-de-microsoft.md))

Se admiten cuentas **laborales o educativas** y **personales** (`MICROSOFT_TENANT_ID=common`, valor por defecto). Al vincular se guarda `accountType`:

- `WORK_OR_SCHOOL`: las reuniones se crean con Teams y Microsoft genera el enlace.
- `PERSONAL` (el `tid` del token es `9188040d-6c67-4c5b-b112-36a304b66dad`): Microsoft no genera enlaces de Teams. El organizador debe indicar el enlace de la reunión al crearla (ver `joinUrl` en [`meetings.md`](meetings.md)).

`status` (y la respuesta del `callback`) incluye `accountType`: `WORK_OR_SCHOOL`, `PERSONAL` o `null` si no hay cuenta vinculada.

## Configuración

Si `MICROSOFT_CLIENT_ID` y `MICROSOFT_CLIENT_SECRET` están vacías, la integración se desactiva: `status` responde `configured: false`, `connect` y `callback` responden `503` y no se pueden crear reuniones. Deben definirse **juntas**; si solo hay una, el backend no arranca.

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `MICROSOFT_CLIENT_ID` | Sí, si está activa | ID de aplicación (cliente) de Entra ID. |
| `MICROSOFT_CLIENT_SECRET` | Sí, si está activa | Secreto de cliente. Es un secreto: nunca se versiona. |
| `MICROSOFT_REDIRECT_URI` | Sí, si está activa | URL `http(s)` de `callback`. Debe coincidir con el URI de redirección registrado en Entra ID. |
| `MICROSOFT_TOKEN_ENCRYPTION_KEY` | Sí, si está activa | Clave AES-256 de 32 bytes en base64 (`openssl rand -base64 32`). Cifra los tokens y el `state`. |
| `MICROSOFT_TENANT_ID` | No | `common` (por defecto: cuentas laborales, educativas y personales), `organizations` (solo laborales o educativas), un GUID o un dominio. Cualquier otro valor impide arrancar. |
| `MICROSOFT_LINK_REDIRECT_URL` | No | URL `http(s)` a la que se redirige al terminar la vinculación. Sin ella, `callback` responde JSON. |
| `MEETINGS_TIME_ZONE` | No | Zona horaria IANA de las fechas de los avisos (por defecto `America/Bogota`). Ver [`meetings.md`](meetings.md#formato-de-los-mensajes). |

## Registrar la aplicación en Entra ID y probar en local

1. En el portal de Azure (`portal.azure.com`): **Entra ID → Registros de aplicaciones → Nuevo registro**.
2. Elige el tipo de cuenta que corresponda al inquilino (solo el directorio de la organización, o cualquier directorio organizacional). Debe ser coherente con `MICROSOFT_TENANT_ID`.
3. En **URI de redirección** elige la plataforma **Web** y escribe el valor de `MICROSOFT_REDIRECT_URI`, p. ej. `http://localhost:3000/api/integrations/microsoft/callback`.
4. En **Certificados y secretos → Nuevo secreto de cliente**, copia el valor (solo se muestra una vez) en `MICROSOFT_CLIENT_SECRET`.
5. En **Permisos de API → Microsoft Graph → Permisos delegados**, añade `offline_access`, `openid`, `profile`, `email`, `User.Read` y `Calendars.ReadWrite`. Concede el consentimiento de administrador si el inquilino lo exige.
6. En `apps/backend/.env` define `MICROSOFT_CLIENT_ID` (ID de aplicación), `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`, `MICROSOFT_TOKEN_ENCRYPTION_KEY` y, si quieres, `MICROSOFT_TENANT_ID`. Arranca el backend (`pnpm dev`).
7. En el navegador, abre `http://localhost:3000/api/auth/signin` e inicia sesión con un usuario con rol `TUTOR` (o `ADMIN`).
8. En la misma sesión del navegador, abre `http://localhost:3000/api/integrations/microsoft/connect`. Inicia sesión con una cuenta laboral o educativa con Teams y acepta los permisos.
9. Microsoft vuelve a `callback` y el navegador muestra el JSON con `linked: true` (o te redirige a `MICROSOFT_LINK_REDIRECT_URL`). Confirma con `GET /api/integrations/microsoft/status`.
10. Crea una reunión con `POST /api/meetings` ([`meetings.md`](meetings.md)).

Los puertos y URL de los pasos son un ejemplo: usa los de tu entorno.

## Pendiente

- **Interfaz para vincular**: no hay pantalla de la aplicación; hoy se usa el navegador directamente.
- **Revocar el consentimiento en Microsoft** al desvincular: solo se borran los tokens locales.
