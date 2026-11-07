# ADR 0003 · Alta de usuarios por el administrador

- **Estado:** Aceptada
- **Fecha:** 2026-11-06

## Contexto

Se pidió un endpoint para que el Administrador cree usuarios. Está confirmado en el dominio: "Administrador: crear usuarios con roles preestablecidos" (RN-10). Hasta ahora no había autorización por rol ni forma de crear el primer administrador.

## Decisión

1. **Endpoint** `POST /api/users` en el módulo `users`. Contrato en [`docs/api/users.md`](../api/users.md).
2. **Autorización:** `RolesGuard` y el decorador `@Roles(...)`, en `src/common/`, se ejecutan después de `SessionGuard`. Basta con tener **uno** de los roles exigidos, porque los permisos de varios roles se suman (P-02). Solo se usa donde el permiso está confirmado.
3. **Validación manual** en el DTO (`parseCreateUser`), igual que en el login. Así no se añaden `class-validator` ni `class-transformer` sin aprobación. Se rechazan los campos desconocidos para impedir que se fijen `status` o `passwordHash`.
4. **Contraseña inicial opcional:** si el administrador no la define, el usuario solo puede entrar con Google.
5. **Política provisional de contraseñas:** entre 8 y 256 caracteres. El dominio no la define; el máximo evita hashes costosos.
6. **Unicidad del correo:** se comprueba sin distinguir mayúsculas y se guarda en minúsculas. Si dos altas simultáneas chocan, la restricción única de la base de datos (`P2002`) también se traduce en `409`.
7. **Primer administrador:** el script `admin:create` (`src/cli/create-admin.ts`) reutiliza `UsersService` y lee los datos de variables de entorno, para que la contraseña no quede en el historial de la terminal.
8. El administrador puede asignar cualquier rol, incluido `ADMIN`. No hay ninguna restricción definida al respecto.

## Consecuencias

- Pendiente de confirmar: la política de contraseñas, si el administrador puede crear otros administradores, y si se necesita auditoría o un cambio de contraseña obligatorio en el primer acceso.
- Los demás módulos pueden reutilizar `RolesGuard` para proteger rutas por rol global. Los permisos que dependen del proyecto (tutor, líder) necesitarán otra comprobación.
