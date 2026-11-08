# ADR 0014 — Cuentas personales de Microsoft

- **Estado:** aceptado (decisión del usuario, 2026-11-07). Modifica el [ADR 0007](0007-reuniones-con-microsoft-teams.md).

## Contexto

Con `MICROSOFT_TENANT_ID=organizations`, Microsoft solo deja iniciar sesión con cuentas laborales o educativas, aunque la app de Entra ID admita cuentas personales. Además, Microsoft Graph no genera enlaces de Teams (`teamsForBusiness`) para cuentas personales.

## Decisión

1. Se admiten **ambos tipos de cuenta**: `MICROSOFT_TENANT_ID` pasa a valer **`common` por defecto**. `organizations`, un GUID o un dominio siguen siendo válidos para restringir el acceso.
2. Al vincular, se guarda el **tipo de cuenta**: `PERSONAL` si el `tid` del token de identidad es el inquilino de consumidores de Microsoft (`9188040d-6c67-4c5b-b112-36a304b66dad`) y `WORK_OR_SCHOOL` en cualquier otro caso. **Migración:** enum `MicrosoftAccountType` y columna `microsoft_accounts.account_type`, con `WORK_OR_SCHOOL` por defecto para las cuentas ya vinculadas.
3. **Organizador con cuenta laboral o educativa:** el flujo no cambia. Se crea el evento con Teams y el enlace lo genera Microsoft; si el cuerpo trae `joinUrl`, se responde `400`.
4. **Organizador con cuenta personal:** el cuerpo de `POST /api/meetings` debe traer **`joinUrl`**, un enlace `https://` de hasta 2048 caracteres a la sala que el organizador elija (Teams gratis, Meet, Zoom…). Sin él, `400`. Se crea el evento en su calendario de Outlook **sin** reunión en línea, con el enlace en la ubicación y en el cuerpo. El enlace se guarda en `meetings.join_url` y se usa en las invitaciones y los avisos como cualquier otro.
5. `GET /api/integrations/microsoft/status` incluye `accountType` (`WORK_OR_SCHOOL`, `PERSONAL` o `null` si no hay cuenta vinculada).
