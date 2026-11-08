# ADR 0016 — Recuperación de contraseña por código de correo

- **Estado:** aceptado por el usuario el 8 de noviembre de 2026.
- **Alcance:** cuentas activas con contraseña local; Auth.js sigue siendo el único mecanismo de inicio de sesión. Una cuenta exclusiva de Google conserva su mecanismo de acceso.

## Flujo aprobado

«Olvidé mi contraseña» solicita el correo; el código se envía a ese correo registrado, no a una dirección fija. Es de **6 dígitos**, vence en **10 minutos** desde su emisión y admite **5 intentos**. Una verificación correcta abre el formulario de nueva contraseña y confirmación. Código y autorización sirven una sola vez; verificar no reinicia el vencimiento.

## Seguridad e integración

- Se reutilizan SMTP y la política de contraseñas del ADR 0011. La recuperación no depende de preferencias de novedades ni del despachador automático.
- La solicitud devuelve siempre el mismo mensaje para cuentas elegibles, desconocidas, inactivas o exclusivas de Google. No devuelve códigos y no los registra en logs. El envío SMTP es asíncrono para no exponer su latencia en la respuesta.
- PostgreSQL guarda un HMAC del código (clave de autenticación), intentos, vencimiento y el hash de una autorización aleatoria de 256 bits. No guarda el código ni la autorización en claro.
- La verificación usa actualizaciones condicionales; el consumo y el cambio de contraseña son una transacción. Se impiden verificaciones y consumos simultáneos duplicados.
- Un nuevo código invalida el anterior y su autorización. Hay 60 segundos entre emisiones por cuenta y un límite en memoria de 10 solicitudes por IP en 10 minutos; un despliegue multiinstancia deberá compartir ese límite o aplicarlo en su borde.
- El cambio conserva Auth.js, no inicia sesión automáticamente y revoca las sesiones anteriores con una versión capturada al autenticar, no al finalizar la creación del JWT.

## Operación

Aplicar la migración `20261108180000_password_recovery` y generar Prisma antes de arrancar el backend actualizado. SMTP debe estar configurado; `log` no envía códigos ni los imprime. No se instala ninguna dependencia.

Pruebas de API: `pnpm --filter @gestor-semilleros/backend test:e2e --testPathPatterns=password-recovery` contra una base `_test`, con correo sustituido por un doble; no realiza envíos reales.
