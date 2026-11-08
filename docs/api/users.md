# API de usuarios

> **Estado:** implementado en `apps/backend/src/modules/users/` (alta, directorio, gestión de usuarios del [ADR 0011](../decisions/0011-gestion-de-usuarios.md) y contraseña propia). Cubierto por `apps/backend/test/users.e2e-spec.ts` (alta, directorio, gestión y contraseña temporal), `auth.e2e-spec.ts` (contraseña propia y cambio obligatorio) y pruebas unitarias de DTOs, servicio y política de contraseñas. Limitación: la eñe se compara como n (ver `common/utils/text.ts`).
> Decisión: [ADR 0003](../decisions/0003-alta-de-usuarios.md). Autenticación: [`auth.md`](auth.md).

## `POST /api/users`

Crea un usuario con roles preestablecidos. **Solo Administrador** (RN-10, `docs/domain/roles-permissions.md`).

**Requiere** una sesión válida (cookie de Auth.js) y el rol global `ADMIN`.

### Cuerpo (`application/json`)

| Campo | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `email` | string | Sí | Correo válido, máximo 254 caracteres. Se guarda sin espacios y en minúsculas. Único sin distinguir mayúsculas. |
| `fullName` | string | Sí | Máximo 150 caracteres. Se recortan los espacios. |
| `roles` | string[] | Sí | Al menos uno de `ADMIN`, `AREA_MANAGER`, `DEAN`, `TUTOR`, `STUDENT`. Los duplicados se ignoran. |
| `password` | string | No | Política de contraseñas del ADR 0011 (10–256, letra y número, distinta del correo). Si se omite, el usuario solo podrá entrar con Google. |

Cualquier otro campo, por ejemplo `status` o `passwordHash`, se rechaza con `400`.

```json
{ "email": "tutor@example.test", "fullName": "Tutor de Ejemplo", "roles": ["TUTOR"], "password": "Clave-Segura-1" }
```

### Respuestas

| Código | Cuándo | Cuerpo |
| --- | --- | --- |
| `201` | Usuario creado | `{ id, email, fullName, status, roles, hasPassword, createdAt }`. **Nunca** incluye la contraseña ni su hash. |
| `400` | Datos inválidos | `{ message: "Datos inválidos.", errors: string[] }`, con todos los errores a la vez. |
| `401` | Sin sesión, sesión expirada o administrador desactivado | `{ message: "Sesión no válida o expirada." }` |
| `403` | El usuario no es Administrador | `{ message: "No tienes permisos para realizar esta acción." }` |
| `409` | El correo ya está registrado | `{ message: "Ya existe un usuario con ese correo." }` |

## `GET /api/users`

Directorio para **seleccionar personas** (tutores, estudiantes, participantes) sin escribir identificadores. Decisión: [ADR 0009](../decisions/0009-directorio-catalogos-y-paneles.md).

> **Estado:** implementado. Cubierto por `apps/backend/test/users.e2e-spec.ts` (bloque `GET /api/users`) y las pruebas unitarias de su DTO de consulta y de `listDirectory`. El acceso del encargado de área (`AREA_MANAGER`, ADR 0010 §10) está implementado.

**Requiere** sesión válida y al menos uno de los roles globales `ADMIN`, `AREA_MANAGER`, `DEAN` o `TUTOR` (`RolesGuard`; el encargado de área se añadió en el ADR 0010 §10). Otro rol → `403`.

### Parámetros de consulta (todos opcionales)

| Parámetro | Reglas |
| --- | --- |
| `search` | Texto de 2 a 100 caracteres; busca sin distinguir mayúsculas ni tildes en nombre o correo (contiene). |
| `role` | Uno de `ADMIN`, `AREA_MANAGER`, `DEAN`, `TUTOR`, `STUDENT`: solo usuarios con ese rol global. |
| `limit` | Entero de 1 a 50. Por defecto 20. |
| `status` | `ACTIVE`, `INACTIVE` o `ALL`. **Solo `ADMIN`** (ver «Gestión de usuarios»). |

Por defecto solo devuelve usuarios `ACTIVE`, ordenados por nombre (los inactivos no aparecen en el directorio). Cualquier otro parámetro o valor inválido → `400 { message: "Datos inválidos.", errors: string[] }`.

### `200`

```json
[{ "id": "uuid", "fullName": "Tatiana Tutora Demo", "email": "tutor@example.test", "roles": ["TUTOR"] }]
```

Nunca incluye contraseña, teléfono ni fechas. El campo `status` solo aparece cuando un administrador usa el parámetro `status` (ver «Gestión de usuarios»).

## Gestión de usuarios ([ADR 0011](../decisions/0011-gestion-de-usuarios.md))

> **Estado:** implementado. Cubierto por `apps/backend/test/users.e2e-spec.ts` (bloque «Gestión de usuarios») y por las pruebas unitarias de `password-policy`, `update-user.dto`, `set-password.dto`, `UsersService` y `AuthService`.

Detalles de implementación: un `:id` mal formado responde `404 { message: "Usuario no encontrado." }` (igual que uno inexistente). El campo `status` de los items del directorio solo se incluye cuando se envía el parámetro `status` (administrador). Los `409` de roles usan mensajes como `No se pueden quitar los roles porque el usuario los ejerce: tutor activo en los proyectos «A», «B»; decano vigente de las facultades «F». Retíralo primero de esos cargos.` (máximo 5 nombres, luego «y N más»); un proyecto eliminado no cuenta como ejercicio del rol.

**Política de contraseñas** (todas las rutas que reciben una): entre 10 y 256 caracteres, al menos una letra y un número, distinta del correo. Si no se cumple → `400` con `errors[]` en español.

`UserDetail`: `{ id, email, fullName, status, roles, hasPassword, mustChangePassword, createdAt, updatedAt }` (nunca el hash).

| Método y ruta | Quién | Cuerpo | Éxito | Errores |
| --- | --- | --- | --- | --- |
| `GET /api/users?status=ACTIVE\|INACTIVE\|ALL` | `status` solo lo puede usar `ADMIN` (otro rol con `status` → `403`); por defecto `ACTIVE` | — | `200`, items del directorio con el campo adicional `status` | `400` valor inválido |
| `GET /api/users/:id` | `ADMIN` | — | `200` `UserDetail` | `404` |
| `PATCH /api/users/:id` | `ADMIN` | `{ fullName?, roles? }` (al menos uno; roles ≥ 1, sin duplicados) | `200` `UserDetail` | `400`; `404`; `409` si se quita un rol que ejerce (mensaje con dónde: proyectos, facultades o áreas); `409` si se quita a sí mismo `ADMIN` o dejaría sin administradores activos |
| `POST /api/users/:id/deactivate` | `ADMIN` | — | `200` `UserDetail` | `404`; `409` si ya está inactivo, si es él mismo o si es el último administrador activo |
| `POST /api/users/:id/activate` | `ADMIN` | — | `200` `UserDetail` | `404`; `409` si ya está activo |
| `PUT /api/users/:id/password` | `ADMIN` | `{ password }` | `204`; el usuario queda con `mustChangePassword: true` | `400` política; `404` |

## Contraseña propia

### `PUT /api/me/password`

Cualquier sesión válida (también con `mustChangePassword`). Cuerpo `{ currentPassword?, newPassword }`: `currentPassword` es obligatorio si el usuario ya tiene contraseña. `newPassword` cumple la política y es distinta de la actual. Éxito `204` y `mustChangePassword` pasa a `false`. Errores: `400` (política, campos), `403 { message: "La contraseña actual no es correcta." }`.

## Primer administrador

El endpoint exige un administrador, así que el primero se crea desde la terminal (para desarrollo, `pnpm db:seed` crea además un usuario por tipo; ver [`local-setup.md`](../database/local-setup.md#datos-de-desarrollo-seed)). Los datos se leen de variables de entorno para que la contraseña no quede en el historial:

```bash
ADMIN_EMAIL=admin@example.test ADMIN_FULL_NAME="Administrador" ADMIN_PASSWORD='…' \
  pnpm --filter @gestor-semilleros/backend admin:create
```

> En fish: `env ADMIN_EMAIL=… ADMIN_FULL_NAME=… ADMIN_PASSWORD=… pnpm --filter @gestor-semilleros/backend admin:create`.

> **Estado:** implementado (`apps/backend/test/auth.e2e-spec.ts`, bloque «Cambio de contraseña obligatorio»). Si el usuario no tiene contraseña (solo Google) puede crearla sin `currentPassword`. Reglas de la nueva contraseña repetidas en `errors[]`: política del ADR 0011 y distinta de la actual (`La nueva contraseña debe ser distinta de la actual.`).

## Pendiente

- Invitación por correo en lugar de contraseña inicial y recuperación de contraseña olvidada.
- Registro de auditoría (quién creó a quién).
