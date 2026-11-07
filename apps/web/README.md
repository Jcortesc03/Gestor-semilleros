# Aplicación web

**En implementación.** Inicio de sesión con correo y contraseña o con Google, «Mi panel» con un bloque por cada rol del usuario (`GET /api/dashboard`), y proyectos, tableros, actividades, reuniones (Microsoft Teams), alta de usuarios, novedades, preferencias y estado de WhatsApp, contra la API real. Personas, áreas y facultades se eligen con buscadores y catálogos (`features/directory`), nunca escribiendo UUID. Los errores muestran el `message` y los `errors[]` del backend (4xx); los 5xx y los mensajes por defecto de NestJS usan textos genéricos. Historial: [relevo](../../docs/handoffs/2026-11-07-frontend.md).

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
- **Google:** el botón «Continuar con Google» aparece solo si `GET /api/auth/providers` incluye `google` (backend con `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`). Envía un formulario real a `/api/auth/signin/google` con el CSRF y `callbackUrl=/panel`.
- **URI de redirección en Google Cloud:** a través del proxy de Vite, Auth.js construye la URI con el origen de la web, no con el del backend. Registra en la consola de Google la URI exacta con la que abras la app, p. ej. `http://localhost:5173/api/auth/callback/google` y/o `http://127.0.0.1:5173/api/auth/callback/google`, además de la del backend.
- Si el correo de Google no corresponde a un usuario activo, Auth.js responde `AccessDenied` y, por `pages.error` del backend, redirige a `/login?error=AccessDenied`, donde la web muestra un mensaje seguro y limpia la URL.

El despliegue deberá resolver el mismo origen para `/api` y el fallback de las rutas `/login` y `/panel`. La configuración de desarrollo no define ni autoriza infraestructura de producción.

## Áreas y facultades

Sección «Áreas y facultades» (`features/institution`), visible para administradores y encargados de área. El administrador crea, renombra (y describe, en las áreas) y elimina áreas y facultades, con confirmación antes de borrar; gestiona los encargados de cada área con el buscador de personas y consulta el historial de decanos de cada facultad, asigna un decano nuevo y cierra el vigente con confirmación. El encargado de área ve todas las áreas (el sistema no ofrece «mis áreas») y solo puede editar nombre y descripción; en las áreas ajenas el backend responde 403 y la web muestra ese mensaje. Los contratos están en [`docs/api/catalogs.md`](../../docs/api/catalogs.md) (sección «Administración»).

## Diseño

Tailwind CSS 4, Montserrat local y la [guía visual](../../skill/front/habilidades/design-taste-frontend/guia-estilos-proyecto.md). Frontlipe es responsable de las vistas. La [decisión técnica](../../docs/decisions/0008-aplicacion-web-y-sistema-visual.md) documenta versiones y límites.

## Verificación

```bash
pnpm --filter @gestor-semilleros/web test
pnpm --filter @gestor-semilleros/web typecheck
pnpm --filter @gestor-semilleros/web build
```

- `test` ejecuta los adaptadores (runner de Node, `test/*.test.ts`) y los componentes (Vitest + Testing Library, `test/ui/`). No necesitan PostgreSQL.
- `test:ui` ejecuta solo Vitest.

### E2E con el backend real

```bash
pnpm db:up                                              # PostgreSQL local
pnpm --filter @gestor-semilleros/web exec playwright install chromium   # una vez
pnpm --filter @gestor-semilleros/web test:e2e
```

Playwright compila y levanta el backend en el puerto 3000 y Vite en el 5173 (ambos deben estar libres). Usa la base aislada `semilleros_web_e2e_test`, le aplica migraciones y la seed de desarrollo con la contraseña sintética de `e2e/backend-env.ts`; no toca la base de desarrollo. Cubre: login correcto, recarga con sesión, cierre de sesión, contraseña incorrecta, cuenta inexistente, secciones del administrador, redirección de Google (interceptada, sin contactar a Google) y el mensaje de `AccessDenied` (también pasando por la página de error real de Auth.js), el panel de cada rol con los datos sembrados, crear un proyecto con área y facultad del catálogo, añadir participantes con el buscador (incluido el mensaje del backend cuando una regla lo impide), carga sin bloqueos de cada sección, ausencia de scroll horizontal a 390, 768 y 1440 px y las reglas del ADR 0010 (el administrador crea y elimina áreas; el encargado de área ve los proyectos de su área y publica solo para ella; el tutor publica para su proyecto). El inicio de sesión completo con una cuenta real de Google solo puede probarse a mano.

Para una revisión de navegador aislada del backend:

```bash
# Servidor exclusivamente de pruebas, en loopback y puerto 5180.
pnpm --filter @gestor-semilleros/web exec node test/serve-fixture.mjs

# Alternativa: iniciar directamente con identidad sintética para revisar el panel.
FIXTURE_SESSION=authenticated pnpm --filter @gestor-semilleros/web exec node test/serve-fixture.mjs
```

La fixture utiliza `investigacion@example.test` y `synthetic-password`. Estos valores son datos de prueba, no cuentas reales ni credenciales del producto. Solo simula autenticación con rol de tutor: las rutas de dominio responden 404. No contiene cinco cuentas ni datos de proyectos/novedades y no demuestra persistencia real. El módulo vive fuera de `src` y no se importa desde la aplicación.
