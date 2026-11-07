# ADR 0007 — Aplicación web y sistema visual

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

La configuración de producción y su proxy de mismo origen siguen pendientes; el servidor de desarrollo no es una configuración de despliegue. Esta entrega conecta correo y contraseña; Google permanece disponible en el backend, pero no se muestra una acción web sin completar su integración.

## Verificación

El cliente HTTP se prueba con el runner incorporado de Node 24 y respuestas simuladas: no requiere base de datos ni nuevas herramientas de pruebas. TypeScript y Vite verifican la aplicación integrada. Chromium se utiliza para revisar el diseño y los flujos con una API simulada; esto no reemplaza una prueba con una cuenta real y PostgreSQL.

## Consecuencias

- El panel presenta únicamente la identidad devuelta por `/api/me` y el estado real de disponibilidad de los módulos.
- Las APIs de proyectos, semilleros, tableros y reuniones siguen pendientes; no se crean datos ni contratos ficticios.
- La comprobación del acceso ocurre al cargar la aplicación. Las APIs protegidas siguen siendo responsables de autorizar cada petición; la interfaz no es una barrera de seguridad.
