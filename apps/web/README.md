# Aplicación web

**Trabajo en curso.** Incluye inicio de sesión, un espacio de trabajo compartido por roles y vistas de proyectos, tableros, actividades, usuarios, novedades y preferencias. No son cinco paneles terminados: existen errores de carga y de orden de respuestas pendientes. Consultar el [relevo de la sesión](../../docs/handoffs/2026-11-07-frontend.md) antes de continuar.

## Desarrollo local

Desde la raíz, con Node 24 y pnpm 12.18.0:

```bash
pnpm install
pnpm dev
```

Abrir `http://127.0.0.1:5173`. El backend necesita su entorno local configurado y PostgreSQL, según la [guía existente](../../docs/database/local-setup.md). Las migraciones y las operaciones sobre la base de datos son pasos separados; arrancar la web no las ejecuta.

Para arrancar únicamente la web: `pnpm --filter @gestor-semilleros/web dev`. Sin backend, se muestra el estado de conexión no disponible; no se simula una sesión.

## Autenticación

- Solo ingresan cuentas existentes y activas; no hay registro público ni una cuenta incluida con la web.
- El navegador solicita CSRF antes de los POST de Auth.js y comprueba la identidad con `/api/me`.
- Las cookies de sesión siguen gestionadas por el backend. No se guardan contraseñas ni tokens en localStorage.
- El proxy de Vite mantiene las peticiones bajo el mismo origen: `/api` se dirige al backend local en el puerto 3000.
- La sesión se comprueba al cargar la aplicación. Los permisos reales siempre corresponden al backend, no a ocultar controles.
- Google continúa disponible en el backend cuando está configurado, pero su integración visual queda fuera de esta primera entrega.

El despliegue deberá resolver el mismo origen para `/api` y el fallback de las rutas `/login` y `/panel`. La configuración de desarrollo no define ni autoriza infraestructura de producción.

## Diseño

Tailwind CSS 4, Montserrat local y la [guía visual](../../skill/front/habilidades/design-taste-frontend/guia-estilos-proyecto.md). Frontlipe es responsable de las vistas. La [decisión técnica](../../docs/decisions/0007-aplicacion-web-y-sistema-visual.md) documenta versiones y límites.

## Verificación

```bash
pnpm --filter @gestor-semilleros/web test
pnpm --filter @gestor-semilleros/web typecheck
pnpm --filter @gestor-semilleros/web build
```

Las pruebas del cliente HTTP usan respuestas simuladas y no necesitan PostgreSQL. No constituyen una prueba de autenticación con una cuenta real.

Para una revisión de navegador aislada del backend:

```bash
# Servidor exclusivamente de pruebas, en loopback y puerto 5180.
pnpm --filter @gestor-semilleros/web exec node test/serve-fixture.mjs

# Alternativa: iniciar directamente con identidad sintética para revisar el panel.
FIXTURE_SESSION=authenticated pnpm --filter @gestor-semilleros/web exec node test/serve-fixture.mjs
```

La fixture utiliza `investigacion@example.test` y `synthetic-password`. Estos valores son datos de prueba, no cuentas reales ni credenciales del producto. Solo simula autenticación con rol de tutor: las rutas de dominio responden 404. No contiene cinco cuentas ni datos de proyectos/novedades y no demuestra persistencia real. El módulo vive fuera de `src` y no se importa desde la aplicación.
