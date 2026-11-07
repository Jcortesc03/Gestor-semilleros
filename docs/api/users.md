# API de usuarios

> **Estado:** implementado en `apps/backend/src/modules/users/` y cubierto por `apps/backend/test/users.e2e-spec.ts`.
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
| `password` | string | No | Entre 8 y 256 caracteres (política provisional). Si se omite, el usuario solo podrá entrar con Google. |

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

## Primer administrador

El endpoint exige un administrador, así que el primero se crea desde la terminal (para desarrollo, `pnpm db:seed` crea además un usuario por tipo; ver [`local-setup.md`](../database/local-setup.md#datos-de-desarrollo-seed)). Los datos se leen de variables de entorno para que la contraseña no quede en el historial:

```bash
ADMIN_EMAIL=admin@example.test ADMIN_FULL_NAME="Administrador" ADMIN_PASSWORD='…' \
  pnpm --filter @gestor-semilleros/backend admin:create
```

> En fish: `env ADMIN_EMAIL=… ADMIN_FULL_NAME=… ADMIN_PASSWORD=… pnpm --filter @gestor-semilleros/backend admin:create`.

## Pendiente

- Listar, consultar, editar y desactivar usuarios, y cambiar contraseñas.
- Cambio de contraseña obligatorio en el primer inicio de sesión, o invitación por correo en lugar de contraseña inicial.
- Política definitiva de contraseñas.
- Registro de auditoría (quién creó a quién).
