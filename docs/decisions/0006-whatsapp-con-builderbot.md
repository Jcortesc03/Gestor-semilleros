# ADR 0006 · WhatsApp con BuilderBot y provider intercambiable (Baileys)

- **Estado:** Aceptada. Reemplaza el punto 5 del [ADR 0005](0005-notificaciones-y-copias-externas.md) en lo que respecta a WhatsApp.
- **Fecha:** 2026-11-06

## Contexto

El ADR 0005 enviaba las copias por WhatsApp con la Cloud API de Meta (`fetch` y plantillas aprobadas). El usuario pidió manejar WhatsApp con **BuilderBot**, de modo que se pueda cambiar el provider, y empezar con **Baileys**.

## Decisión

1. **Dependencias:** `@builderbot/bot` 1.4.4 y `@builderbot/provider-baileys` 1.4.4, publicadas el 2026-10-15. Arrastran `baileys` 7.0.0-rc14, `sharp`, `protobufjs` y `@ffmpeg-installer`. Sus scripts de instalación se **deniegan** en `allowBuilds` (`pnpm-workspace.yaml`) porque no hacen falta para enviar texto:
   - `baileys` solo comprueba la versión de Node.
   - `sharp` usa binarios precompilados.
   - `protobufjs` solo verifica versiones.
   - `ffmpeg` solo cambia los permisos de un archivo.
2. **Transporte `builderbot`:** `NOTIFICATIONS_WHATSAPP_TRANSPORT=builderbot`, con `WHATSAPP_PROVIDER` (por ahora solo `baileys`), `WHATSAPP_SESSION_NAME` y `WHATSAPP_PAIRING_PHONE` (opcional, para usar un código de emparejamiento en vez del QR). Se elimina el transporte `cloud-api` y sus variables.
3. **Provider intercambiable:** el backend solo usa la forma común de los providers de BuilderBot (`sendMessage` y los eventos `ready`, `require_action`, `auth_failure` y `host`), declarada como `BuilderBotProviderLike`. Cada provider se registra en `WHATSAPP_PROVIDER_FACTORIES` (`integrations/services/whatsapp/provider-factories.ts`) con una fábrica que se carga de forma diferida. Para añadir otro provider, por ejemplo `@builderbot/provider-meta`, hay que:
   - instalar el paquete;
   - añadir su nombre a `WHATSAPP_PROVIDERS`;
   - escribir su fábrica.
4. **Sin el servidor HTTP de BuilderBot:** `createBot().httpServer()` escucha en todas las interfaces y publica el QR de vinculación en `/`. Cualquiera que llegara al puerto podría vincular su propia cuenta y leer las copias. Por eso solo se inicia la conexión del provider (`initVendor`).
   - El estado y el QR se exponen en `GET /api/integrations/whatsapp/status` y `GET /api/integrations/whatsapp/qr`, solo para `ADMIN` y con la sesión de Auth.js.
   - Los providers que necesiten un webhook, como Meta, tendrán que definir en su fábrica cómo exponerlo.
5. **`WhatsAppGateway`:**
   - Arranca el provider al iniciar el módulo, sin bloquear el arranque de la API.
   - Sigue su estado: `starting`, `awaiting_qr`, `awaiting_pairing_code`, `connected` o `auth_failure`.
   - Lo detiene al apagar la aplicación.
   - Si no hay conexión, el envío falla con un **error que se puede reintentar** y el despachador del ADR 0005 lo vuelve a intentar.
6. **Mensaje:** como Baileys no necesita plantillas, se envía texto libre: el asunto en negrita (`*…*`), una línea en blanco y el cuerpo, truncado a 4000 caracteres.
7. **Sesión:** Baileys guarda las credenciales en `apps/backend/<WHATSAPP_SESSION_NAME>_sessions/` y el QR en `<nombre>.qr.png`. Ambos se ignoran en git (`.gitignore`) y se tratan como secretos: borrar la carpeta desvincula la cuenta.
8. Las pruebas unitarias del gateway, el canal, el registro y el controlador, la adaptación de las variables de entorno y la documentación las hicieron agentes de opencode coordinados con Orca. Se verificó además con una prueba de humo real: el provider de Baileys arrancó, emitió el QR y se apagó limpiamente.

## Consecuencias

- **Baileys no es la API oficial.** Usa WhatsApp Web y Meta puede bloquear el número si detecta envíos masivos. Conviene usar un número dedicado; para producción a gran escala, valorar un provider oficial como Meta o Twilio mediante BuilderBot.
- **Una sesión por instancia.** La sesión es local al proceso, así que con varias instancias del backend solo una debe usar `builderbot`; las demás, `disabled`. La reserva de envíos del ADR 0005 evita los duplicados, pero dos sesiones con el mismo número se desconectarían entre sí.
- **Esperas sin conexión.** Mientras WhatsApp está desconectado, las copias esperan sin gastar intentos (`DeliveryError` con `deferred`) y se prueban cada minuto. Las que superan `NOTIFICATIONS_MAX_DEFER_HOURS` (24 h por defecto, a petición del usuario) desde que se encolaron se descartan (`SKIPPED`) para no enviar avisos vencidos. El mismo límite se aplica a cualquier copia, incluso si el backend estuvo apagado.
- **Tipos locales.** Los tipos publicados por `@builderbot/provider-baileys` no resuelven con `moduleResolution: nodenext`, por eso se declara una interfaz mínima local y el paquete se carga con `require`.
