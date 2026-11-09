# ADR 0018 — Recomendaciones con la API de Claude

- **Estado:** aceptado.
- **Fecha:** 2026-11-09.

## Contexto

Se pidió tomar los datos del módulo de analítica ("big data", [ADR 0016](0016-modulo-de-analitica.md)), comprimirlos de forma optimizada y enviarlos a un modelo de IA para obtener análisis y recomendaciones personalizadas. Debía estar disponible para administrador, encargado de área y decano, con un apartado nuevo en la barra lateral de la web y todos los filtros posibles. La primera versión (commit `18c0886`) usaba la API de OpenAI con `fetch` nativo; se reemplazó por la API de Claude (Anthropic) a pedido del usuario. Este ADR sustituye al anterior `0018-recomendaciones-con-openai.md`.

## Decisión

1. **Módulo `ai` en el backend** (`src/modules/ai`): `GET /api/ai/status` y `POST /api/ai/recommendations`. Contrato: [`ai.md`](../api/ai.md). Roles `ADMIN`, `AREA_MANAGER` y `DEAN`, con el **mismo alcance** que la analítica.
2. **Reutiliza la analítica:** el módulo `analytics` exporta `AnalyticsService` y el parser de filtros por su `index.ts`. La IA no consulta la base por su cuenta ni duplica cálculos, así que hereda las validaciones de alcance (403/404).
3. **Compresión** (`models/analytics-digest.ts`, función pura):
   - tasas como porcentajes enteros;
   - se omiten nulos, conteos en cero y tablas vacías, pero se conservan los porcentajes en 0;
   - tablas como `{ cols, rows }` en lugar de arreglos de objetos;
   - rankings recortados a los mejores y peores N, con una muestra mínima de actividades (`rankingSize`, `minSample`);
   - solo los bloques que piden los enfoques elegidos (`focuses`);
   - serie mensual de los últimos 12 meses como máximo.

   La respuesta informa el tamaño enviado frente al original y el JSON exacto enviado.
4. **Privacidad:** se envían solo agregados, nunca correos, teléfonos ni datos de estudiantes individuales. Por defecto (`anonymize`), los nombres de tutores y decanos se sustituyen por seudónimos (`TUTOR_n`, `DECANO_n`) y el backend los restaura en la respuesta. Áreas, facultades y proyectos se envían con su nombre porque son datos institucionales.
5. **Cliente:** SDK oficial **`@anthropic-ai/sdk` 1.6.0** (dependencia aprobada por el usuario el 2026-11-09, versión exacta), Messages API:
   - salida estructurada con JSON Schema (`output_config.format`), razonamiento adaptativo (`thinking: { type: "adaptive" }`) y esfuerzo configurable (`output_config.effort`);
   - errores tipados del SDK y reintentos automáticos limitados (`ANTHROPIC_MAX_RETRIES`, 1 por defecto);
   - los bloques `thinking` se ignoran y el informe se lee de los bloques `text`;
   - `stop_reason` `refusal`, `max_tokens` y `model_context_window_exceeded` se traducen a errores claros.
6. **Modelo por defecto:** `claude-sonnet-5-5` (elegido por el usuario por costo y velocidad), cambiable con `ANTHROPIC_MODEL`. Solo `ANTHROPIC_API_KEY` es obligatoria; sin ella las rutas responden `503` y la web lo indica.
7. **Rechazos:** con modelos que lo admiten (`claude-sonnet-5-5`, `claude-opus-5-5`, `claude-opus-5` y `claude-fable-5-1`) y sin `ANTHROPIC_BASE_URL`, se pide el reintento en el servidor ante un rechazo: `fallbacks: "default"` con la beta `server-side-fallback-2026-07-01`. `ANTHROPIC_REFUSAL_FALLBACK=false` lo desactiva.
8. **Costo y abuso:**
   - caché en memoria por usuario y parámetros, de 10 min por defecto (`refresh` la ignora);
   - límite de análisis nuevos por usuario y hora (20 por defecto, `429`); un fallo antes de generar (red, 5xx, 429) no consume ese límite;
   - si no hay datos con los filtros, `422` sin llamar a Claude.
9. **Personalización:** el prompt cambia según:
   - la perspectiva, es decir, el rol del usuario (si tiene varios, puede elegir);
   - los enfoques, la profundidad, el estilo y el número de recomendaciones;
   - una pregunta opcional de hasta 500 caracteres, que se trata como pregunta y no como instrucciones.
10. **Web:** sección «Asistente IA» en la barra lateral (`apps/web/src/features/ai`). nginx amplía el tiempo de lectura de `/api/ai/` a 320 s.

## Consecuencias

- La clave de Claude solo vive en el backend (`.env`); el cliente nunca la ve.
- La caché y el límite por hora son por instancia y se pierden al reiniciar. Con varias réplicas habría que moverlos a un almacén compartido.
- El costo depende del modelo y del esfuerzo configurados. La compresión reduce los tokens de entrada y la respuesta informa el uso (`usage`).
- `ANTHROPIC_TIMEOUT_MS × (ANTHROPIC_MAX_RETRIES + 1)` debe quedar por debajo de los 320 s de nginx; con los valores por defecto son 240 s.
- Las recomendaciones son orientativas: el modelo puede equivocarse.
- Pendientes: historial persistente de informes, exportación y uso por tutores.
