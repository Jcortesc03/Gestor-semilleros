# ADR 0011 — Gestión de usuarios y política de contraseñas

- **Estado:** aceptado (decisiones del usuario, 2026-11-07).
- **Relacionado:** [ADR 0002](0002-autenticacion-y-pruebas.md), [ADR 0003](0003-alta-de-usuarios.md), RN-10, RN-11, RN-13.

## Decisiones

1. **Política de contraseñas** (sustituye la provisional de 8–256): entre **10 y 256** caracteres, con **al menos una letra y un número**, y **distinta del correo** (sin distinguir mayúsculas). Se aplica al alta (`POST /api/users`), al restablecimiento por el administrador, al cambio propio, a `admin:create` y a la seed de desarrollo.
2. **Cambio de contraseña:**
   - Cada usuario cambia la suya indicando la actual (si ya tiene una).
   - El administrador puede fijar una **contraseña temporal** a cualquier usuario; el usuario queda obligado a cambiarla en su próximo inicio de sesión (`must_change_password`). Mientras tanto, solo puede consultar `GET /api/me`, cambiar su contraseña y cerrar sesión: el resto de endpoints protegidos responden `403` con `code: "PASSWORD_CHANGE_REQUIRED"`.
3. **Desactivación:** pierde el acceso al instante (ya implementado en `SessionGuard`) y **conserva su historial y sus participaciones**; al reactivarlo recupera todo. Mientras está desactivado no aparece en el directorio ni recibe copias externas.
4. **Quitar un rol global que se está ejerciendo** (tutor activo de un proyecto, estudiante activo en un proyecto, decano vigente, encargado de un área) se **bloquea con `409`** indicando dónde lo ejerce; primero hay que retirarlo de esos cargos.
5. **Salvaguardas (decisión técnica):** el administrador no puede desactivarse ni quitarse el rol `ADMIN` a sí mismo, y siempre debe quedar al menos un administrador activo.

## Consecuencias

- **Migración:** columna `users.must_change_password BOOLEAN NOT NULL DEFAULT false`.
- Contrato en [`docs/api/users.md`](../api/users.md) y [`docs/api/auth.md`](../api/auth.md) (`GET /api/me` añade `mustChangePassword`).
- Pendiente: invitación por correo, recuperación de contraseña olvidada y registro de auditoría.
