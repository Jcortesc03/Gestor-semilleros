# ADR 0017 — Inscripciones (demo de importación desde Google Sheets)

- Estado: Aceptado (demo, sin sincronización real hasta autorización y prueba de hoja).
- Fecha: 2026-11-08.

## Contexto

Se necesita capturar solicitudes desde Google Forms/Sheets, revisarlas y exportarlas. Importar no crea cuentas ni participantes; aceptar individualmente crea un estudiante y le envía credenciales temporales. No hay credenciales ni hoja real autorizada para producción; el adaptador real queda desactivado sin configuración.

## Decisión

- Esquema aditivo: `enrollment_sources`, `enrollment_applications`, `enrollment_import_tombstones`.
- Facultades demo: `SYSTEMS_ENGINEERING`, `SOFTWARE_ENGINEERING`. Tipos de área: `SEEDLING`, `DEGREE_PROJECT`. Documentos: `CC`, `TI`.
- El backend lee Google Sheets con cuenta de servicio (RS256 JWT vía `node:crypto` + `fetch`), hosts fijos y alcance de solo lectura. Sin dependencias nuevas.
- Vinculación confiable área→hoja mediante `ENROLLMENT_SHEETS_ALLOWLIST` (servidor), además del permiso por área.
- Vista previa firmada (HMAC SHA-256) con relectura y rechazo si cambió la hoja o la fuente.
- Duplicados por documento (tipo+número+período+área) y conflictos de correo, sin fusionar por nombre.
- Tombstone con hash de origen para evitar reimportar respuestas eliminadas.
- Rechazadas se conservan 3 días; limpieza automática con intervalo Nest (deshabilitado en tests).
- Exportación `.xlsx` real con ExcelJS 4.4.0, número de documento como texto.
- Aceptación individual (`PATCH /api/enrollments/:id/status` con `ACCEPTED`): en la misma transacción crea un usuario `STUDENT` activo (`fullName` = nombres + espacio + apellidos recortados, `email` de la solicitud, `mustChangePassword=true`, contraseña temporal aleatoria con Argon2id vía `PasswordService`, nunca CC/TI ni datos de identidad). Si el correo ya existe (sin distinguir mayúsculas) devuelve `409` sin aceptar ni reutilizar la cuenta; el conflicto único de Prisma se mapea igual. No crea participante de proyecto. El claro nunca se registra, audita ni devuelve.
- Tras el commit, correo SMTP vía `SmtpEmailSender` existente (misma config, sin vía alternativa): asunto «Inscripción aprobada - Universidad de Colombia» y cuerpo «Por parte de la Universidad de Colombia, ya tienes acceso a la plataforma de Semilleros. Correo: <correo registrado>. Contraseña temporal: <contraseña generada>. Por tu seguridad, cambia la contraseña apenas ingresar.». Si SMTP falla tras crear la cuenta (política demo), se conserva cuenta y estado aceptado, se audita el fallo sin PII/contraseña (`ENROLLMENT_ACCEPT_EMAIL_FAILED`) y se devuelve el item aceptado.
- Aceptación masiva deshabilitada: `PATCH /api/enrollments/status` con `ACCEPTED` devuelve `400` sin cambios parciales; el masivo queda para `REJECTED`.

## Variables de entorno nuevas

- `ENROLLMENT_GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `ENROLLMENT_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `ENROLLMENT_GOOGLE_SHEETS_TIMEOUT_MS` (opcional, 10000)
- `ENROLLMENT_SHEETS_ALLOWLIST` (JSON)
- `ENROLLMENT_PREVIEW_TOKEN_SECRET` (opcional, fallback `AUTH_SECRET`)
- `ENROLLMENT_CLEANUP_INTERVAL_MS` (opcional, 60000)
- `ENROLLMENT_MAX_SHEET_ROWS` (opcional, 5000)
- `ENROLLMENT_EXPORT_MAX_ROWS` (opcional, 10000)

## Consecuencias

- Sin configuración de cuenta de servicio, la integración devuelve `503`.
- Las pruebas usan una fuente ficticia inyectable y datos ficticios.
