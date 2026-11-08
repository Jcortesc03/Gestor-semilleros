# ADR 0013 — Documentos en S3

- **Estado:** aceptado (decisiones del usuario, 2026-11-07).
- **Relacionado:** RN-06, RN-60 a RN-65, P-14, P-15, DB-07, DB-08, conflicto 8 de `docs/domain/roles-permissions.md`.

## Decisiones

1. **Permisos** (resuelve el conflicto 8): dentro de un proyecto,
   - **suben, ven y descargan** los participantes activos (tutor, líder y estudiante) y quienes gestionan el proyecto (administrador, decano de una facultad del proyecto y encargado del área del proyecto);
   - **eliminan** el autor, los tutores activos del proyecto y quienes lo gestionan.
2. **Límites (RN-64):** 25 MB por archivo. El tipo real se valida por la **firma de los primeros bytes**, sin librerías extra (PDF, DOC/DOCX, XLS/XLSX, PNG, JPEG y WebP), y debe coincidir con la extensión y el formato (`PDF`, `WORD`, `EXCEL`, `IMAGE`, RN-60).
3. **Flujo (RN-62):** la subida (multipart) y la descarga **pasan por el backend**, que comprueba los permisos y transmite el archivo. Nunca se exponen URL de S3 al cliente.
4. **Almacenamiento:** AWS S3 en producción, con el SDK oficial `@aws-sdk/client-s3` 3.1164.0 (y `@types/multer` 2.3.0 para las subidas). En desarrollo y pruebas se usa **RustFS 1.0.4** (`rustfs/rustfs:1.0.4`), compatible con S3, en `docker/compose.yaml`. Se eligió porque MinIO dejó de publicar su imagen oficial.
5. **Claves:** `projects/<projectId>/<uuid>`, sin el nombre original. El nombre se guarda en `documents.file_name`.
6. **Eliminación lógica** (P-20): `deleted_at`. El objeto en S3 se conserva, para una posible restauración que aún no está definida. No se puede eliminar un documento adjunto a una actividad activa (`409`).
7. **Adjuntos de actividades:** se habilita `kind: DOCUMENT`, con un documento del mismo proyecto que no esté eliminado.
8. **Sin configuración de S3**, el backend arranca igual y los endpoints de documentos responden `503`.

## Consecuencias

- Variables nuevas: `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` (solo para servidores compatibles), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` y `S3_CREATE_BUCKET` (crear el bucket al arrancar, solo en desarrollo).
- Pendiente: restaurar documentos eliminados, antivirus, cuotas por proyecto y versiones de un mismo documento.
