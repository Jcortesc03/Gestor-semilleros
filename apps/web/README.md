# Aplicación web

**En implementación.** Inicio de sesión con correo y contraseña o con Google, «Mi panel» con un bloque por cada rol del usuario (`GET /api/dashboard`), y proyectos, tableros, actividades, reuniones (Microsoft Teams), alta de usuarios, novedades, preferencias y estado de WhatsApp, contra la API real. Personas, áreas y facultades se eligen con buscadores y catálogos (`features/directory`), nunca escribiendo UUID. Los errores muestran el `message` y los `errors[]` del backend (4xx); los 5xx y los mensajes por defecto de NestJS usan textos genéricos. Historial: [relevo](../../docs/handoffs/2026-11-07-frontend.md).

Hay tres formas de ejecutarla:

| Modo | Para qué | Cómo se sirve |
| --- | --- | --- |
| [1. Desarrollo](#1-desarrollo) | Programar, con recarga en caliente | Vite en `127.0.0.1:5173`, con proxy de `/api` al backend local |
| [2. Producción sin Docker](#2-producción-sin-docker) | Servidor web propio | Build estático detrás de un proxy con `/api` en el mismo origen |
| [3. Producción con Docker](#3-producción-con-docker) | Despliegue completo | Imagen nginx dentro de `docker/compose.prod.yaml` |

Todos los comandos se ejecutan desde la **raíz del repositorio**, con Node 24 y pnpm 12.18.0 (`corepack enable`, o antepón `corepack` a `pnpm`).

## 1. Desarrollo

La web necesita el backend en marcha en el puerto 3000: sigue primero el modo 1 de [`apps/backend/README.md`](../backend/README.md#1-desarrollo) (base de datos, `.env`, migraciones y, opcionalmente, la seed).

```bash
pnpm install
pnpm --filter @gestor-semilleros/web dev   # solo la web: http://127.0.0.1:5173
# o bien
pnpm dev                                   # backend y web a la vez (Turborepo)
```

- Vite redirige `/api` a `http://127.0.0.1:3000`, así que el navegador ve un único origen y las cookies de sesión funcionan.
- Sin backend, la web muestra el estado «No podemos conectar con la aplicación»; no se simula ninguna sesión.
- Para Google en desarrollo, registra en Google Cloud la URI con el origen que abras, por ejemplo `http://127.0.0.1:5173/api/auth/callback/google` (ver «Autenticación»).

## 2. Producción sin Docker

```bash
pnpm install --frozen-lockfile
pnpm --filter @gestor-semilleros/web build   # comprueba tipos y genera apps/web/dist
```

`apps/web/dist` es un sitio estático. Sírvelo con cualquier servidor web que cumpla tres condiciones:

1. **Mismo origen:** `/api/*` se reenvía al backend sin cambiar la ruta y conservando `Host` (con puerto) y `X-Forwarded-Proto`. El backend debe tener `AUTH_TRUST_HOST=true`.
2. **Rutas de la SPA:** cualquier ruta desconocida (`/login`, `/panel`…) devuelve `index.html`.
3. **Caché:** `/assets/*` puede cachearse para siempre porque los nombres llevan hash; `index.html` no debe cachearse.

La configuración de nginx de la imagen Docker cumple todo esto y sirve de referencia: [`nginx.conf.template`](nginx.conf.template) (sustituye `${BACKEND_URL}` por la dirección del backend, por ejemplo `http://127.0.0.1:3000`).

Para revisar el build en local: `pnpm --filter @gestor-semilleros/web preview` (Vite preview; no hace proxy de `/api`, así que úsalo solo para ver la interfaz).

## 3. Producción con Docker

La imagen (`apps/web/Dockerfile`) compila con `node:24-alpine` y sirve con `nginx:1.29-alpine`. Se despliega junto con el backend y PostgreSQL ([ADR 0012](../../docs/decisions/0012-despliegue-con-contenedores.md)):

```bash
cp docker/env.prod.example docker/.env.prod   # completa POSTGRES_PASSWORD y AUTH_SECRET
docker compose -f docker/compose.prod.yaml --env-file docker/.env.prod up -d --build
```

Abre `http://localhost:${WEB_PORT}` (8080 por defecto). El primer administrador y el resto de tareas (registros, actualizar, detener) están en el modo 3 de [`apps/backend/README.md`](../backend/README.md#3-producción-con-docker).

Detalles de la imagen:

- **Construcción por separado:** `docker build -f apps/web/Dockerfile -t gestor-semilleros/web .` (contexto en la raíz del monorepo).
- **`BACKEND_URL`** (variable de entorno, por defecto `http://backend:3000`): adónde reenvía nginx `/api`. La plantilla se procesa al arrancar el contenedor.
- **Cabeceras:** nginx reenvía `Host` con el puerto (`$http_host`) y `X-Forwarded-*`, para que Auth.js genere las redirecciones y los callbacks de Google con la URL pública.
- **Seguridad:** cabeceras `X-Content-Type-Options`, `Referrer-Policy` y `X-Frame-Options`. El HTTPS se resuelve con un proxy o balanceador delante del puerto publicado.

## Autenticación

- Solo ingresan cuentas existentes y activas; no hay registro público ni una cuenta incluida con la web.
- El navegador solicita CSRF antes de los POST de Auth.js y comprueba la identidad con `/api/me`.
- Las cookies de sesión siguen gestionadas por el backend. No se guardan contraseñas ni tokens en localStorage.
- El proxy de Vite mantiene las peticiones bajo el mismo origen: `/api` se dirige al backend local en el puerto 3000.
- La sesión se comprueba al cargar la aplicación. Los permisos reales siempre corresponden al backend, no a ocultar controles.
- **Google:** el botón «Continuar con Google» aparece solo si `GET /api/auth/providers` incluye `google` (backend con `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`). Envía un formulario real a `/api/auth/signin/google` con el CSRF y `callbackUrl=/panel`.
- **URI de redirección en Google Cloud:** Auth.js construye la URI con el origen de la web, no con el del backend. Registra la URI exacta con la que se abra la app: en desarrollo `http://localhost:5173/api/auth/callback/google` y/o `http://127.0.0.1:5173/api/auth/callback/google`; con Docker `http://localhost:8080/api/auth/callback/google`; en producción `https://DOMINIO/api/auth/callback/google`.
- Si el correo de Google no corresponde a un usuario activo, Auth.js responde `AccessDenied` y, por `pages.error` del backend, redirige a `/login?error=AccessDenied`, donde la web muestra un mensaje seguro y limpia la URL.


## Áreas y facultades

Sección «Áreas y facultades» (`features/institution`), visible para administradores y encargados de área. El administrador crea, renombra (y describe, en las áreas) y elimina áreas y facultades, con confirmación antes de borrar; gestiona los encargados de cada área con el buscador de personas y consulta el historial de decanos de cada facultad, asigna un decano nuevo y cierra el vigente con confirmación. El encargado de área ve todas las áreas (el sistema no ofrece «mis áreas») y solo puede editar nombre y descripción; en las áreas ajenas el backend responde 403 y la web muestra ese mensaje. Los contratos están en [`docs/api/catalogs.md`](../../docs/api/catalogs.md) (sección «Administración»).

## Usuarios y contraseñas

El administrador lista, busca y filtra usuarios (activos, inactivos o todos), edita su nombre y roles, los desactiva o reactiva y les fija una contraseña temporal. Quien entra con una temporal ve primero «Cambia tu contraseña» y no puede usar nada más hasta cambiarla. Cualquier usuario puede cambiar la suya desde la tarjeta de su cuenta. Política: 10–256 caracteres, con al menos una letra y un número, distinta del correo ([ADR 0011](../../docs/decisions/0011-gestion-de-usuarios.md)).

## Recuperar contraseña

En el login, «Olvidé mi contraseña» pide el correo de la cuenta. El usuario recibe un código de 6 dígitos, lo verifica y después elige y confirma una nueva contraseña. El código vence en 10 minutos, permite 5 intentos y sirve una sola vez. Requiere SMTP y la migración `password_recovery` en el backend; no depende de las preferencias de notificaciones. Consulta [el contrato](../../docs/api/auth.md#recuperación-por-código-de-correo) y [ADR 0016](../../docs/decisions/0016-recuperacion-de-contrasena.md).

## Teléfono en preferencias

Selecciona el país y escribe el número nacional en el segundo campo: el prefijo internacional se agrega automáticamente. El selector incluye los países latinoamericanos, Puerto Rico, Belice, Guyana y Surinam, además de Alemania, Australia, Canadá, China, España, Estados Unidos, Francia, India, Italia, Japón, Portugal, Reino Unido y Suiza. Para los países que comparten `+1`, el número nacional incluye el código de área.

La web admite solo dígitos y las longitudes nacionales de líneas fijas y móviles del país seleccionado, tomadas de [libphonenumber](https://github.com/google/libphonenumber/blob/master/resources/PhoneNumberMetadata.xml) el 8 de noviembre de 2026. No comprueba que la línea exista ni que tenga WhatsApp. No agregues el prefijo internacional ni un código de salida; los ceros que forman parte del número nacional, como en Italia, se conservan.

La API sigue recibiendo un único teléfono E.164. Borrar el número lo elimina; los teléfonos guardados, incluso de países fuera del selector, se conservan al cambiar únicamente las preferencias de notificación. En códigos compartidos como `+1`, el país no se puede recuperar con certeza solo a partir del prefijo.

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

Playwright compila y levanta su propio backend en el puerto 3100 y Vite en el 5174, así que puede correr con `pnpm dev` abierto. Requiere `pnpm db:up` (PostgreSQL y RustFS) y usa el bucket `semilleros-web-e2e`. Usa la base aislada `semilleros_web_e2e_test`, le aplica migraciones y la seed de desarrollo con la contraseña sintética de `e2e/backend-env.ts`; no toca la base de desarrollo. Cubre: login correcto, recarga con sesión, cierre de sesión, contraseña incorrecta, cuenta inexistente, secciones del administrador, redirección de Google (interceptada, sin contactar a Google) y el mensaje de `AccessDenied` (también pasando por la página de error real de Auth.js), el panel de cada rol con los datos sembrados, crear un proyecto con área y facultad del catálogo, añadir participantes con el buscador (incluido el mensaje del backend cuando una regla lo impide), carga sin bloqueos de cada sección, ausencia de scroll horizontal a 390, 768 y 1440 px y las reglas del ADR 0010 (el administrador crea y elimina áreas; el encargado de área ve los proyectos de su área y publica solo para ella; el tutor publica para su proyecto). El inicio de sesión completo con una cuenta real de Google solo puede probarse a mano.

Para una revisión de navegador aislada del backend:

```bash
# Servidor exclusivamente de pruebas, en loopback y puerto 5180.
pnpm --filter @gestor-semilleros/web exec node test/serve-fixture.mjs

# Alternativa: iniciar directamente con identidad sintética para revisar el panel.
FIXTURE_SESSION=authenticated pnpm --filter @gestor-semilleros/web exec node test/serve-fixture.mjs
```

La fixture utiliza `investigacion@example.test` y `synthetic-password`. Estos valores son datos de prueba, no cuentas reales ni credenciales del producto. Solo simula autenticación con rol de tutor: las rutas de dominio responden 404. No contiene cinco cuentas ni datos de proyectos/novedades y no demuestra persistencia real. El módulo vive fuera de `src` y no se importa desde la aplicación.
