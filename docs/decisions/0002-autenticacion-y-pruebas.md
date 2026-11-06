# ADR 0002 · Autenticación con Auth.js en NestJS y pruebas

- **Estado:** Aceptada
- **Fecha:** 2026-11-06

## Contexto

Se pidió el servicio de inicio de sesión del backend y pruebas de la API. El usuario eligió **correo + contraseña o Google**. El stack exige Auth.js como único mecanismo de autenticación y NestJS como backend. Para el resto de opciones se aplicaron los valores recomendados, que el usuario no objetó.

## Decisión

1. **Backend:** NestJS 12.3.3 (`@nestjs/common`, `core`, `platform-express`, `testing`) y `@nestjs/cli` 12.0.11, con TypeScript 6.0.3, que es el que admite la CLI. Se descartó 12.4.0 porque se publicó el mismo día y no superaba la política `minimumReleaseAge` de pnpm.
2. **Formato de módulos:** el paquete es CommonJS (`module: nodenext`), como en la plantilla oficial de NestJS 12. NestJS y Auth.js, que solo se distribuyen como ESM, se cargan con `require(esm)` de Node 24. El cliente de Prisma se genera con `moduleFormat = "cjs"`.
3. **Auth.js:** `@auth/express` 0.12.3 y `@auth/core` 0.41.3, montados en `/api/auth` mediante `configureApp()`, que comparten `main.ts` y las pruebas.
   - Proveedores: Credentials y Google. Google solo se activa si está configurado.
   - Sesión **JWT** en cookie. El token solo guarda el id interno; no se usa el adaptador de Prisma ni tablas de cuentas o sesiones.
   - Solo entran usuarios **existentes y activos**. Las cuentas de Google se vinculan por **correo verificado**.
4. **Contraseñas:** Argon2id con `@node-rs/argon2` 2.2.2, que trae binarios precompilados y no necesita scripts de instalación. Se añade la columna `users.password_hash`, nula para usuarios que solo usan Google (migración `add_user_password_hash`).
5. **Protección de rutas:** `SessionGuard`, en `src/common/guards/`, valida la sesión y recarga el usuario en cada petición.
6. **Pruebas:** Jest 30.5.2, ts-jest 29.4.15 y Supertest 7.3.1, con `--experimental-vm-modules` como en la plantilla oficial.
   - Unitarias: `src/**/*.spec.ts`, sin base de datos.
   - De la API (e2e): `test/**/*.e2e-spec.ts`, contra **PostgreSQL real** en `TEST_DATABASE_URL`, cuyo nombre debe terminar en `_test`. Se migra con `prisma migrate deploy` y se vacía antes de cada prueba.
7. **pnpm:** se deniega el script de instalación de `@parcel/watcher`, que trae binarios precompilados.

## Consecuencias

- La app móvil no puede usar el flujo con cookie tal cual; su autenticación sigue pendiente.
- `@auth/express` está en versión 0.x (experimental). Una actualización puede romper la integración; las pruebas e2e cubren el flujo.
- La consulta a la base de datos en cada petición protegida tiene un coste pequeño a cambio de revocar el acceso al instante.
- Faltan: límite de intentos de inicio de sesión, alta de usuarios por el administrador, restricción de dominio para Google y autorización por rol.
