# API de autenticación

> **Estado:** implementado en `apps/backend/src/modules/auth/` y cubierto por `apps/backend/test/auth.e2e-spec.ts`.
> Decisión: [ADR 0002](../decisions/0002-autenticacion-y-pruebas.md).

La autenticación usa **Auth.js** (`@auth/express`) montado en NestJS con **sesión JWT en cookie** (`authjs.session-token`, `HttpOnly`). Solo pueden iniciar sesión usuarios que ya existen y están activos (RN-10). No hay autorregistro.

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
{ "id": "uuid", "email": "usuario@example.test", "fullName": "Nombre", "roles": ["TUTOR"] }
```

## Pendiente

- **Móvil:** el flujo con cookie sirve para la web. La autenticación de React Native sigue pendiente (`AGENTS.md` §4).
- **Límite de intentos** (fuerza bruta) en `/api/auth/callback/credentials`.
- Alta de usuarios: implementada en [`users.md`](users.md).
- **Restricción de dominio** de los correos de Google (p. ej. solo institucionales): no está definida.
- **Permisos por rol:** `SessionGuard` solo autentica. Los roles globales se comprueban con `RolesGuard` (ver ADR 0003); hoy lo usan `POST /api/users` y `POST /api/projects`. La autorización **por proyecto** está implementada y documentada en [`projects.md`](projects.md) y [`boards.md`](boards.md); la autorización por área sigue pendiente.
