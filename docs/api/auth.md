# API de autenticación

> **Estado:** implementado en `apps/backend/src/modules/auth/` y cubierto por `apps/backend/test/auth.e2e-spec.ts`.
> Decisión: [ADR 0002](../decisions/0002-autenticacion-y-pruebas.md).

La autenticación usa **Auth.js** (`@auth/express`) montado en NestJS con **sesión JWT en cookie** (`authjs.session-token`, `HttpOnly`). Solo pueden iniciar sesión usuarios que ya existen y están activos (RN-10). No hay autorregistro.

## Recuperación por código de correo

Desde «Olvidé mi contraseña» se solicita un código de 6 dígitos al correo de la cuenta activa con contraseña local. Vence a los 10 minutos desde la emisión, permite 5 intentos y sirve una sola vez ([ADR 0016](../decisions/0016-recuperacion-de-contrasena.md)).

| Ruta pública | Cuerpo JSON | Resultado |
| --- | --- | --- |
| `POST /api/password-recovery/request` | `{ "email": "usuario@example.test" }` | `202 { "message": "Si el correo corresponde a una cuenta activa con contraseña, recibirás un código de recuperación." }` |
| `POST /api/password-recovery/verify` | `{ "email": "usuario@example.test", "code": "123456" }` | `200 { "resetToken": "…" }`, autorización aleatoria; `400` si el código no es válido, venció, se verificó antes o agotó los intentos |
| `POST /api/password-recovery/reset` | `{ "resetToken": "…", "newPassword": "…", "confirmation": "…" }` | `204`; `400` si la autorización o contraseña no es válida |

El formulario de contraseña aparece solo después de verificar el código. El correo se normaliza sin espacios y sin distinguir mayúsculas. La nueva contraseña cumple el ADR 0011, debe ser distinta de la anterior y coincidir con la confirmación. La autorización vence junto con el código, no inicia sesión y revoca las sesiones anteriores al completar el cambio.

Las solicitudes para cuentas desconocidas, inactivas o exclusivas de Google devuelven el mismo `202` sin enviar correo. Los reenvíos esperan 60 segundos; por IP se aceptan hasta 10 solicitudes en 10 minutos (límite en memoria del proceso). Los límites no cambian el mensaje público. SMTP entrega el código directamente, independientemente de `NOTIFICATIONS_AUTO_DISPATCH` y las preferencias de novedades. Sin SMTP no se envían ni se imprimen códigos.

## Proveedores

| Proveedor | Requisitos para entrar |
| --- | --- |
| `credentials` (correo + contraseña) | El usuario existe, está `ACTIVE` y tiene `password_hash`. El correo no distingue mayúsculas. |
| `google` | Solo si están configuradas `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET`. El correo de Google debe estar **verificado** y corresponder a un usuario `ACTIVE`. |

## Endpoints de Auth.js (`/api/auth`)

| Método y ruta | Descripción |
| --- | --- |
| `GET /api/auth/csrf` | Devuelve `{ csrfToken }` y fija la cookie CSRF. Es obligatorio antes de cualquier `POST`. |
| `GET /api/auth/providers` | Lista los proveedores habilitados. |
| `POST /api/auth/callback/credentials` | Inicia sesión. Cuerpo `application/x-www-form-urlencoded`: `csrfToken`, `email`, `password`. |
| `POST /api/auth/signin/google` | Redirige a Google. Cuerpo: `csrfToken`. Retorno: `/api/auth/callback/google`. |
| `GET /api/auth/session` | Sesión actual: `{ user: { id, name, email }, expires }`, o `null`. |
| `POST /api/auth/signout` | Cierra la sesión. Cuerpo: `csrfToken`. |

**Respuestas del inicio de sesión:** siempre responde `302`.
- Si tiene éxito, fija la cookie de sesión y redirige a la aplicación.
- Si falla, redirige a `…/api/auth/signin?error=CredentialsSignin&code=credentials`.
- **Errores de OAuth** (p. ej. `AccessDenied` cuando el correo de Google no corresponde a un usuario activo): Auth.js redirige a la página de error configurada, `pages.error = '/login'` (`AUTH_ERROR_PAGE`), es decir `/login?error=AccessDenied`. La web traduce ese código a un mensaje seguro. La respuesta es **idéntica** si el correo no existe, si la contraseña es incorrecta o si el usuario está inactivo, para que no se pueda averiguar qué cuentas existen.

## Endpoints protegidos

Todas las rutas protegidas usan `SessionGuard`, que:
1. valida la cookie de sesión de Auth.js;
2. recarga el usuario desde la base de datos en cada petición, de modo que un usuario desactivado pierde el acceso al instante y los cambios de roles se aplican sin volver a iniciar sesión;
3. responde `401 { message: "Sesión no válida o expirada." }` si algo falla.

### `GET /api/me`

`200`:

```json
{ "id": "uuid", "email": "usuario@example.test", "fullName": "Nombre", "roles": ["TUTOR"], "mustChangePassword": false }
```

### Cambio de contraseña obligatorio ([ADR 0011](../decisions/0011-gestion-de-usuarios.md))

> **Estado:** implementado en `SessionGuard`; las dos rutas exentas se marcan con el decorador `@AllowPendingPasswordChange()` (`common/decorators/allow-password-change.decorator.ts`). Cubierto por `auth.e2e-spec.ts` y `session.guard.spec.ts`.

Si `mustChangePassword` es `true`, todos los endpoints protegidos salvo `GET /api/me` y `PUT /api/me/password` responden `403 { message: "Debes cambiar tu contraseña antes de continuar.", code: "PASSWORD_CHANGE_REQUIRED" }`. Cerrar sesión (`POST /api/auth/signout`) siempre está permitido.

## Pendiente

- **Móvil:** el flujo con cookie sirve para la web. La autenticación de React Native sigue pendiente (`AGENTS.md` §4).
- **Límite de intentos** (fuerza bruta) en `/api/auth/callback/credentials`.
- Alta de usuarios: implementada en [`users.md`](users.md).
- **Restricción de dominio** de los correos de Google (p. ej. solo institucionales): no está definida.
- **Permisos por rol:** `SessionGuard` solo autentica. Los roles globales se comprueban con `RolesGuard` (ver ADR 0003); hoy lo usan `POST /api/users` y `POST /api/projects`. La autorización **por proyecto** está implementada y documentada en [`projects.md`](projects.md) y [`boards.md`](boards.md); la autorización por área sigue pendiente.
