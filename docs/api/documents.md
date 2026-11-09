# API de documentos

> **Estado:** implementado en el backend ([ADR 0013](../decisions/0013-documentos-en-s3.md)); el cliente web está en curso. Código en `apps/backend/src/modules/documents/`.

Los binarios se guardan en S3 (RustFS en desarrollo) y los metadatos en `documents`. La subida y la descarga pasan siempre por el backend (RN-62). Todos los endpoints requieren una sesión válida.

`DocumentDto`:

```json
{
  "id": "uuid", "projectId": "uuid", "fileName": "informe-avance.pdf", "format": "PDF",
  "mimeType": "application/pdf", "sizeBytes": 183042,
  "uploadedBy": { "id": "uuid", "fullName": "Tatiana Tutora Demo" }, "createdAt": "2026-11-07T20:00:00.000Z"
}
```

Nunca incluye `storageKey`.

## Permisos

| Acción | Quién |
| --- | --- |
| Subir, listar y descargar | Participantes activos del proyecto (tutor, líder o estudiante), administrador, decano vigente de una facultad del proyecto y encargado del área del proyecto |
| Eliminar | Autor, tutores activos del proyecto, administrador, decano y encargado de área (igual que arriba) |

## `POST /api/projects/:projectId/documents`

`multipart/form-data` con un único campo `file`.

| Regla | Error |
| --- | --- |
| Falta `file` o hay más de un archivo | `400` |
| Más de 25 MB | `413 { message: "El archivo supera el tamaño máximo de 25 MB." }` |
| Extensión no admitida: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.png`, `.jpg`, `.jpeg` o `.webp` | `400 { message: "Datos inválidos.", errors: ["Formato no admitido. …"] }` |
| La firma del contenido no coincide con la extensión | `400 { …, errors: ["El contenido del archivo no corresponde a su tipo."] }` |
| Sin permiso / proyecto no visible | `403` / `404` |
| Proyecto eliminado o `CANCELLED`/`FINISHED` | Se permite (los documentos sirven de archivo histórico) |
| S3 no configurado o caído | `503 { message: "El almacenamiento de documentos no está disponible." }` |

`format` se deduce de la extensión (`PDF`, `WORD`, `EXCEL` o `IMAGE`). El nombre se guarda sin rutas y recortado a 255 caracteres. Éxito: `201` con `DocumentDto`.

## `GET /api/projects/:projectId/documents`

Lista paginada (ADR 0017) de los documentos no eliminados del proyecto, del más reciente al más antiguo (con `id` descendente como desempate).

| Parámetro | Tipo | Obligatorio | Reglas |
| --- | --- | --- | --- |
| `page` | entero (query) | No | Mayor o igual que 1; por defecto 1. |
| `pageSize` | entero (query) | No | Entre 1 y 100; por defecto 20. |

`200`:

```json
{ "items": [{ "id": "uuid", "fileName": "informe-avance.pdf", "format": "PDF" }], "total": 42, "page": 1, "pageSize": 20 }
```

Cada elemento de `items` es un `DocumentDto`. `total` cuenta todos los documentos no eliminados del proyecto. Una página más allá del final devuelve `items: []` con el `total` real. Cualquier otro parámetro responde `400 { message: "Datos inválidos.", errors: string[] }` con `page debe ser un entero mayor o igual que 1.`, `pageSize debe ser un entero entre 1 y 100.` o `Campos no permitidos: campo1, campo2.` `403` o `404` como arriba.

## `GET /api/documents/:documentId/download`

Transmite el archivo con `Content-Type` (el `mimeType` guardado), `Content-Length` y `Content-Disposition: attachment; filename*=UTF-8''<nombre>`, y `Cache-Control: private, no-store`. Con `?inline=true` usa `inline`, para previsualizar PDF e imágenes. Responde `404` si el documento no existe, está eliminado o el usuario no puede ver el proyecto, y `503` si falla el almacenamiento.

## `DELETE /api/documents/:documentId`

Eliminación lógica (`deleted_at`); el objeto en S3 se conserva. Respuestas: `204`, `403` si no tiene permiso para eliminar y `404`. Responde `409 { message: "El documento está adjunto a actividades; quítalo de ellas primero." }` si un adjunto de una actividad no eliminada lo referencia.

## Adjuntar un documento a una actividad

`POST /api/activities/:activityId/attachments` (ver [`boards.md`](boards.md)) acepta, además de `{ kind: "LINK", url }`, el cuerpo `{ kind: "DOCUMENT", documentId }`. Los permisos son los mismos que para los enlaces. El documento debe pertenecer al proyecto de la actividad y no estar eliminado (`400` si no). En la respuesta, el adjunto lleva `kind: "DOCUMENT"` y `document: { id, fileName, format, sizeBytes }`, y `url` vale `null`.

## Detalles de implementación

- **Configuración:** variables `S3_*` documentadas en `apps/backend/.env.example` y `docker/env.prod.example`. Sin `S3_BUCKET`, `S3_ACCESS_KEY_ID` y `S3_SECRET_ACCESS_KEY` el backend arranca igual y solo la **subida** y la **descarga** responden `503` (listar y eliminar solo usan la base de datos). Con `S3_CREATE_BUCKET=true` se crea el bucket al arrancar si no existe (un fallo se registra y no impide el arranque).
- **Subida:** el archivo se lee en memoria (máximo 25 MB). Se comprueba primero el acceso al proyecto, luego la extensión y la firma de los primeros bytes (`%PDF-`, OLE `D0 CF 11 E0` para `.doc`/`.xls`, ZIP `PK\x03\x04` para `.docx`/`.xlsx`, PNG, JPEG `FF D8 FF` y WebP `RIFF....WEBP`). El nombre se toma como UTF-8, sin rutas ni caracteres de control, y se recorta a 255 caracteres conservando la extensión. Un campo distinto de `file`, varios archivos o ningún archivo responden `400 { message: "Datos inválidos.", errors: ["Debe enviar un único archivo en el campo \"file\"."] }`.
- **Consistencia:** si falla el `put` a S3 no se crea la fila (`503`); si falla la fila tras subir, se intenta borrar el objeto (sin garantía).
- **Descarga:** transmite el flujo de S3 con `Content-Length` igual al tamaño guardado y `Content-Disposition` solo con `filename*`.
- **Eliminación:** `409` solo si el adjunto pertenece a una actividad (y tablero) no eliminados.
- **Proyecto eliminado:** se trata como inexistente (`404`), igual que en el resto de la API de proyectos; el contrato no distingue ese caso y no se implementó un acceso especial a proyectos eliminados.

## Pruebas

- Unitarias: firma y saneado de nombres (`models/document-file.spec.ts`), servicio con almacenamiento falso (`services/documents.service.spec.ts`), variables de entorno (`config/storage.config.spec.ts`) y validación del adjunto (`boards/dtos/activity.dto.spec.ts`).
- E2E (`apps/backend/test/documents.e2e-spec.ts`): sustituye `DocumentStorage` por una implementación en memoria (`test/memory-storage.ts`). Cubre cada formato, `413`, firma y extensión inválidas, permisos por rol, descarga con cabeceras y bytes exactos, listado, borrado lógico, `409`, adjuntos `DOCUMENT` y `503`.
- Integración manual contra RustFS (`apps/backend/test/s3-storage.integration-spec.ts`, fuera de la suite por defecto; las instrucciones están en la cabecera del archivo): levanta `docker compose -f docker/compose.yaml up -d --wait s3` y comprueba crear bucket, `put`, `head`, `get` y `remove` con `S3DocumentStorage`.
