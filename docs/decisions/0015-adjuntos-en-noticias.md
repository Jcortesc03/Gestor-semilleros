# ADR 0015 — Archivos adjuntos en noticias

- **Estado:** aceptado (decisiones del usuario, 2026-11-08).
- **Relacionado:** [ADR 0005](0005-notificaciones-y-copias-externas.md) (novedades y copias), [ADR 0013](0013-documentos-en-s3.md) (documentos en S3), RN-63.

## Decisiones

1. Solo las novedades de tipo **`NEWS`** (noticias) admiten adjuntos: **hasta 5 archivos**, con las mismas reglas que los documentos. Son PDF, Word, Excel o imagen, de 25 MB cada uno, con validación de la firma del contenido, y se guardan en S3.
2. **Tabla propia** `announcement_attachments` (migración), con los mismos metadatos que `documents`: nombre, formato, tipo MIME, tamaño y clave de S3. Así no cambia RN-63, porque los documentos siguen perteneciendo siempre a un proyecto, y los adjuntos viven con su noticia. Clave de S3: `announcements/<announcementId>/<uuid>`.
3. **Publicación en una sola petición:** `POST /api/announcements` acepta, además de JSON, `multipart/form-data` con el cuerpo habitual en el campo `data` y los archivos en `files`. Se valida todo antes de guardar nada; si falla la subida, no se crea la novedad. Las copias se encolan después, ya sabiendo cuántos adjuntos tiene.
4. **Acceso:** descarga quien puede ver la noticia, siempre a través del backend (RN-62). Una noticia eliminada (borrado lógico) deja de servir sus adjuntos; los objetos se conservan en S3.
5. **Copias externas:** el correo y WhatsApp añaden «Incluye N archivo(s) adjunto(s): consúltalos en la plataforma.», sin enviar los archivos ni enlaces públicos.
