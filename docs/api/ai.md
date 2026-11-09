# API de IA (recomendaciones con OpenAI)

> **Estado:** implementado ([ADR 0018](../decisions/0018-recomendaciones-con-openai.md)).
>
> **Pruebas:** unitarias en `apps/backend/src/modules/ai/**/*.spec.ts` y `src/config/ai.config.spec.ts` (sin llamadas reales a OpenAI).

Analiza los indicadores de la [analítica](analytics.md) con un modelo de OpenAI y devuelve un informe con hallazgos, riesgos y recomendaciones personalizadas. El backend calcula la analítica, la **comprime** y envía solo agregados.

## Acceso y alcance

**Requiere** sesión válida y uno de los roles `ADMIN`, `AREA_MANAGER` o `DEAN` (si no, `403`). El alcance de los datos es exactamente el de `GET /api/analytics`.

## Configuración (backend)

| Variable | Obligatoria | Por defecto | Uso |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Sí* | — | Clave de la API. Solo en el entorno del backend. |
| `OPENAI_MODEL` | Sí* | — | Modelo a usar (debe admitir salida estructurada en la API Responses). |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | URL base de la API. |
| `OPENAI_TIMEOUT_MS` | No | `90000` | 5 000–300 000. |
| `OPENAI_MAX_OUTPUT_TOKENS` | No | `4000` | 500–32 000. |
| `AI_CACHE_TTL_SECONDS` | No | `600` | 0–86 400; `0` desactiva la caché. |
| `AI_RATE_LIMIT_PER_HOUR` | No | `20` | 1–1 000 análisis nuevos por usuario y hora. |

\* Sin `OPENAI_API_KEY` u `OPENAI_MODEL` la IA queda **no configurada**: `status.configured = false` y `POST /recommendations` responde `503`.

## `GET /api/ai/status`

```json
{
  "configured": true,
  "model": "nombre-del-modelo",
  "cacheTtlSeconds": 600,
  "rateLimitPerHour": 20,
  "limits": { "maxFocuses": 4, "minRecommendations": 1, "maxRecommendations": 10, "minRankingSize": 0, "maxRankingSize": 10, "minSample": 1, "maxSample": 50, "questionMaxLength": 500 }
}
```

## `POST /api/ai/recommendations`

### Cuerpo (JSON, todo opcional)

| Campo | Tipo | Por defecto | Efecto |
| --- | --- | --- | --- |
| `from`, `to`, `areaId`, `facultyId`, `projectId`, `tutorId`, `projectStatus` | Igual que [`GET /api/analytics`](analytics.md#filtros-query-string-todos-opcionales) | — | Datos analizados. `""` y `null` se ignoran. |
| `focuses` | 1–4 de `GENERAL`, `ACTIVITIES`, `DEADLINES`, `PARTICIPATION`, `MEETINGS`, `TUTORS`, `UNITS`, `PATTERNS`, `ATTACHMENTS`, `TRENDS` | `["GENERAL"]` | Bloques que se envían y en qué se centra el informe. |
| `depth` | `BRIEF`, `STANDARD`, `DETAILED` | `STANDARD` | Extensión del informe. |
| `style` | `EXECUTIVE`, `OPERATIONAL`, `ACADEMIC` | `EXECUTIVE` | Tono. |
| `perspective` | `ADMIN`, `AREA_MANAGER`, `DEAN` o `null` | el rol de mayor alcance | Rol para el que se redacta; debe ser uno del usuario (si no, `403`). |
| `maxRecommendations` | entero 1–10 | `5` | Máximo de recomendaciones. |
| `rankingSize` | entero 0–10 | `5` | Mejores y peores N de cada ranking (`0` = sin rankings). |
| `minSample` | entero 1–50 | `5` | Actividades mínimas para entrar a un ranking. |
| `includeComparison` | booleano | `true` | Comparación con el periodo anterior (requiere `from` y `to`). |
| `includeMonthly` | booleano | `true` | Serie mensual (últimos 12 meses). |
| `includeWeekdays` | booleano | `false` | Distribución por día de la semana. |
| `anonymize` | booleano | `true` | Seudónimos para tutores y decanos antes de enviar; se restauran en la respuesta. |
| `question` | texto ≤ 500 | `null` | Pregunta concreta; la respuesta va en `report.answer`. |
| `refresh` | booleano | `false` | Ignora la caché. |

Campos desconocidos → `400`.

### `200`

```json
{
  "generatedAt": "2026-11-08T15:00:00.000Z",
  "model": "nombre-del-modelo",
  "cached": false,
  "perspective": "DEAN",
  "period": { "from": "2026-08-01", "to": "2026-11-08" },
  "scope": { "global": false, "areas": [], "faculties": [{ "id": "uuid", "name": "Ingeniería" }] },
  "request": { "focuses": ["GENERAL"], "depth": "STANDARD", "style": "EXECUTIVE", "maxRecommendations": 5, "rankingSize": 5, "minSample": 5, "includeComparison": true, "includeMonthly": true, "includeWeekdays": false, "anonymize": true, "question": null },
  "digest": { "data": { "context": {}, "kpis": {} }, "chars": 2100, "sourceChars": 9800, "approxTokens": 560, "compressionRatio": 0.21, "pseudonyms": 6 },
  "usage": { "inputTokens": 1400, "outputTokens": 900 },
  "report": {
    "summary": "…",
    "overallStatus": "ATTENTION",
    "highlights": [{ "title": "…", "detail": "…" }],
    "risks": [{ "title": "…", "detail": "…", "severity": "HIGH" }],
    "recommendations": [{
      "title": "…", "rationale": "…", "actions": ["…"], "priority": "HIGH", "focus": "DEADLINES",
      "evidence": ["onTimePct 54 frente a 71 el periodo anterior"], "expectedImpact": "…", "horizon": "SHORT_TERM"
    }],
    "answer": null,
    "dataGaps": ["…"]
  }
}
```

- `cached`: `true` si se sirvió desde la caché (no consume tokens ni cuota).
- `digest.data`: el resumen **exacto** enviado a OpenAI (con seudónimos si `anonymize`). `chars` frente a `sourceChars` (tamaño del JSON de la analítica) mide la compresión; `approxTokens` estima los tokens de entrada (caracteres / 4).
- `usage`: tokens reportados por OpenAI, o `null`.
- `report`: generado con salida estructurada (JSON Schema estricto). Los textos ya tienen los nombres reales restaurados.

### Resumen comprimido

- Tasas en porcentaje entero (`…Pct`), sin nulos ni ceros (ausente = 0 o sin dato).
- Tablas como `{ cols, rows }`; los rankings llevan `omitted` (filas no enviadas) y `belowSample` (bajo la muestra mínima).
- Bloques por enfoque: `GENERAL` envía todos; los demás envían `context`, `kpis` y su bloque (`ACTIVITIES` y `DEADLINES` añaden `patterns`).
- Nunca se envían correos, teléfonos ni datos de estudiantes individuales.

### Errores

| Código | Cuándo |
| --- | --- |
| `400` | Cuerpo o filtros inválidos (`{ message, errors }`). |
| `401` | Sin sesión. |
| `403` | Sin rol permitido, filtro fuera del alcance o `perspective` que el usuario no tiene. |
| `404` | Área, facultad, proyecto o tutor inexistente. |
| `422` | No hay actividades, tableros ni reuniones con esos filtros (no se llama a OpenAI). |
| `429` | Límite de análisis nuevos por hora alcanzado. |
| `502` | Respuesta de OpenAI inválida, incompleta o rechazada. |
| `503` | IA no configurada, o OpenAI sin cuota / limitando peticiones. |
| `504` | OpenAI no respondió a tiempo. |
