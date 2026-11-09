# ADR 0018 — Recomendaciones con la API de OpenAI

- **Estado:** aceptado.
- **Fecha:** 2026-11-08.

## Contexto

Se pidió una implementación con la API de OpenAI que tome los datos del módulo de analítica ("big data", [ADR 0016](0016-modulo-de-analitica.md)), los comprima de forma optimizada y los envíe a la IA para obtener análisis y recomendaciones personalizadas. Disponible para administrador, encargado de área y decano, con un apartado nuevo en la barra lateral de la web y todos los filtros posibles.

## Decisión

1. **Módulo `ai` en el backend** (`src/modules/ai`): `GET /api/ai/status` y `POST /api/ai/recommendations`. Contrato: [`ai.md`](../api/ai.md). Roles `ADMIN`, `AREA_MANAGER` y `DEAN`, con el **mismo alcance** que la analítica.
2. **Reutiliza la analítica:** el módulo `analytics` exporta `AnalyticsService` y el parser de filtros por su `index.ts`; la IA no consulta la base por su cuenta ni duplica cálculos. Así hereda las validaciones de alcance (403/404).
3. **Compresión** (`models/analytics-digest.ts`, función pura):
   - tasas como porcentajes enteros; se omiten nulos, ceros y objetos vacíos;
   - tablas como `{ cols, rows }` en lugar de arreglos de objetos;
   - rankings recortados a los mejores y peores N con muestra mínima de actividades (`rankingSize`, `minSample`);
   - solo los bloques que piden los enfoques elegidos (`focuses`); serie mensual de los últimos 12 meses como máximo.
   - La respuesta informa el tamaño enviado frente al original (`digest.chars`, `sourceChars`, `compressionRatio`) y el JSON exacto enviado.
4. **Privacidad:** se envían solo agregados; nunca correos, teléfonos ni datos de estudiantes individuales. Los nombres de tutores y decanos se sustituyen por seudónimos (`TUTOR_n`, `DECANO_n`) por defecto (`anonymize`) y el backend los restaura en la respuesta. Áreas, facultades y proyectos se envían con su nombre (datos institucionales). Se pide `store: false` a la API.
5. **Sin dependencias nuevas:** se llama a la API Responses (`POST /v1/responses`) con `fetch` nativo de Node 24, con salida estructurada (JSON Schema estricto) y tiempo máximo de espera.
6. **Modelo por entorno:** `OPENAI_MODEL` es obligatorio junto a `OPENAI_API_KEY`; el código no fija un modelo. Sin ambas, las rutas responden `503` y la web lo indica. Opcionales: `OPENAI_BASE_URL`, `OPENAI_TIMEOUT_MS`, `OPENAI_MAX_OUTPUT_TOKENS`, `AI_CACHE_TTL_SECONDS`, `AI_RATE_LIMIT_PER_HOUR`.
7. **Costo y abuso:** caché en memoria por usuario y parámetros (10 min por defecto, `refresh` la ignora) y límite de análisis nuevos por usuario y hora (20 por defecto, `429`). Si no hay datos con los filtros, `422` sin llamar a OpenAI.
8. **Personalización:** el prompt cambia según la perspectiva (rol del usuario; si tiene varios, puede elegir), los enfoques, la profundidad, el estilo, el número de recomendaciones y una pregunta opcional (≤ 500 caracteres, tratada como pregunta y no como instrucciones).
9. **Web:** sección «Asistente IA» en la barra lateral (`apps/web/src/features/ai`).

## Consecuencias

- La clave de OpenAI solo vive en el backend (`.env`); el cliente nunca la ve.
- La caché y el límite por hora son por instancia y se pierden al reiniciar; con varias réplicas habría que moverlos a un almacén compartido.
- El costo depende del modelo configurado; la compresión reduce los tokens de entrada y la respuesta informa el uso (`usage`).
- Las recomendaciones son orientativas: el modelo puede equivocarse y la web lo advierte.
- Pendientes: historial persistente de informes, exportación y uso por tutores.
