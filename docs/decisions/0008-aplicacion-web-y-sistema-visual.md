# ADR 0008 — Aplicación web y sistema visual

- **Estado:** aceptado para la primera entrega web.
- **Fecha:** 2026-11-07.
- **Alcance:** inicio de sesión y panel personal; no agrega módulos de dominio ni permisos por rol.

## Decisión

La aplicación vive en `apps/web` y usa React 19.3.1, TypeScript 6.0.3, Vite 8.3.6 y Tailwind CSS 4.3.4, con `@tailwindcss/vite` 4.3.4 y `@vitejs/plugin-react` 6.2.1. Se verificaron las versiones en el registro de npm y su compatibilidad declarada con Node 24 antes de instalarlas. Se eligieron Tailwind 4.3.4 y Lucide 1.68.0 en lugar de las versiones recién publicadas para respetar la política de antigüedad de pnpm sin excepciones.

Se conserva pnpm 12.18.0 y la delegación de scripts mediante Turborepo. No se agrega una biblioteca de componentes, router ni gestor de estado: esta entrega solo necesita dos vistas y estado local de sesión. Los iconos lineales usan `lucide-react` 1.68.0.

El usuario confirmó Tailwind y **Montserrat como única familia**, alojada localmente con `@fontsource/montserrat` 5.3.0. Se conserva la paleta exacta y los radios de 8–12 px de la [guía del proyecto](../../skill/front/habilidades/design-taste-frontend/guia-estilos-proyecto.md). Esta guía específica prevalece sobre restricciones tipográficas genéricas de la skill. El dorado no se utiliza como texto de bajo contraste sobre blanco.

Frontlipe implementa el sistema visual y las vistas. Su definición admite uso principal y delegado (`mode: all`); el enlace local apunta a su fuente real y el orquestador recibe permiso únicamente para ese agente adicional.

## Autenticación

La web consume el [contrato existente](../api/auth.md) de Auth.js. Solicita CSRF antes de cada POST y verifica la sesión mediante `/api/me`. No almacena contraseñas ni tokens en almacenamiento del navegador. No incorpora autorregistro ni recuperación de contraseña ficticia.

En desarrollo, Vite escucha en `127.0.0.1:5173` y reenvía `/api` a `127.0.0.1:3000`, conservando el encabezado Host. El navegador utiliza un solo origen y el backend conserva sus cookies HttpOnly. No se habilita CORS ni se cambia el backend. El backend debe tener el puerto local 3000 y la configuración de confianza del host que documenta su entorno de desarrollo.

La configuración de producción y su proxy de mismo origen siguen pendientes; el servidor de desarrollo no es una configuración de despliegue. La web conecta correo y contraseña y, si el backend lo habilita (`GET /api/auth/providers`), Google: el botón obtiene el CSRF y envía un formulario real a `POST /api/auth/signin/google` para que Auth.js redirija a Google; al volver, la sesión se comprueba con `/api/me`. Si Auth.js devuelve `?error=AccessDenied` a `/login`, se muestra un mensaje seguro.

## Verificación

El cliente HTTP se prueba con el runner incorporado de Node 24 y respuestas simuladas: no requiere base de datos ni nuevas herramientas de pruebas. TypeScript y Vite verifican la aplicación integrada. Chromium se utiliza para revisar el diseño y los flujos con una API simulada; esto no reemplaza una prueba con una cuenta real y PostgreSQL.

## Consecuencias

- El panel presenta únicamente la identidad devuelta por `/api/me` y el estado real de disponibilidad de los módulos.
- Las APIs de proyectos, semilleros, tableros y reuniones siguen pendientes; no se crean datos ni contratos ficticios.
- La comprobación del acceso ocurre al cargar la aplicación. Las APIs protegidas siguen siendo responsables de autorizar cada petición; la interfaz no es una barrera de seguridad.

## Actualización 2026-11-07 — pruebas de interfaz y E2E

Aprobado por el usuario para la entrega «login + módulos existentes»:

- **Componentes:** Vitest 5.1.0 con jsdom 31.0.0, `@testing-library/react` 16.3.3, `@testing-library/user-event` 14.6.8 y `@testing-library/jest-dom` 7.0.1 (`test/ui/**/*.test.tsx`). Las pruebas de adaptadores siguen en el runner de Node (`test/*.test.ts`).
- **E2E:** Playwright 1.65.0 (Chromium) en `e2e/`. Levanta el backend real sobre una base aislada `semilleros_web_e2e_test` (misma instancia que `TEST_DATABASE_URL`), aplica migraciones y la seed de desarrollo con una contraseña sintética, y nunca toca la base de desarrollo. Google se prueba hasta la redirección de Auth.js (sin contactar a Google) con credenciales OAuth ficticias.
- Sigue sin router ni gestor de estado: la navegación interna usa el hash.
- Se añade la sección de reuniones (`features/meetings`) sobre `docs/api/meetings.md` y `docs/api/microsoft.md`.
