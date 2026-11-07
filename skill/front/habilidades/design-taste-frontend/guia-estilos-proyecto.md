# Guía de estilos del proyecto — Gestor de Semilleros Universitarios

Directrices de diseño, paleta de colores, tipografía y estructura visual para las aplicaciones frontend (web y móvil) del Gestor de Semilleros Universitarios.

Archivo de referencia para las skills de diseño (`design-taste-frontend`, `frontlipe`). Consúltalo antes de entregar cualquier componente, vista o prototipo.

> Estado: aprobado para la primera aplicación web con Tailwind CSS y Montserrat ([ADR 0007](../../../../docs/decisions/0007-aplicacion-web-y-sistema-visual.md)). La implementación móvil sigue pendiente.

## 1. Paleta de colores

Utiliza estos valores hexadecimales exactos para mantener la coherencia visual:

| Nombre | Hex | Uso |
|--------|-----|-----|
| **Primario (Azul Oscuro)** | `#151B40` | Encabezados (headers), pie de página (footers), títulos principales, fondos primarios oscuros. |
| **Secundario (Gris Azulado Oscuro)** | `#2A2C41` | Fondo de tarjetas (cards) informativas o secciones de herramientas sobre fondos oscuros. |
| **Acento (Amarillo Dorado)** | `#F3B92F` | Botones de llamada a la acción (CTAs), íconos, insignias (badges), palabras clave resaltadas. |
| **Alerta/Énfasis (Rojo)** | `#C1272D` | Mensajes de advertencia, errores o textos de extrema importancia exclusivamente. |
| **Fondo Claro (Beige Claro)** | `#F5F2EB` | Fondo de secciones secundarias, contraste suave sin blanco puro. |
| **Base (Blanco)** | `#FFFFFF` | Fondos principales, tarjetas sobre fondos claros, texto general sobre fondos oscuros. |

## 2. Tipografía

### Familia de fuentes

La aplicación web utiliza exclusivamente **Montserrat**, una fuente sans-serif moderna, geométrica y limpia, con archivos locales. **No mezcles familias tipográficas.** La implementación móvil deberá confirmar su integración antes de introducir dependencias.

### Jerarquía y pesos

| Elemento | Peso | Color | Notas |
|----------|------|-------|-------|
| Títulos (H1, H2, H3) | Bold / Extra Bold | `#151B40` (fondos claros) | Ocasionalmente MAYÚSCULAS para bloques de gran importancia. |
| Cuerpo de texto (Body) | Regular (400) | Oscuro (fondos claros) / Blanco (fondos oscuros) | Buena legibilidad. |
| Botones e insignias | Semi-bold (600) | Según contexto | — |

### Textos resaltados

Cuando apliques el color de acento (`#F3B92F`) o alerta (`#C1272D`) a palabras dentro de un párrafo, mantén la misma fuente y aplícale **negrita (bold)** para maximizar el contraste.

## 3. Estructura y componentes UI

### Diseño basado en tarjetas (Card-Based UI)

Agrupa la información y los enlaces dentro de contenedores o tarjetas independientes. El contenido nunca debe estar flotando suelto en el fondo.

### Bordes redondeados

Aplica bordes redondeados consistentes a todos los contenedores (botones, tarjetas, modales, mapas). Evita esquinas completamente rectas; usa valores entre `8px` y `12px` (ej. `rounded-lg` en Tailwind, si se aprueba su uso).

### Iconografía

Usa iconos minimalistas de estilo línea (line-art). Combínalos con el color de acento amarillo o colócalos dentro de contenedores circulares para guiar la vista hacia la acción.

### Espaciado y "White Space"

Usa espaciado generoso. Aplica márgenes amplios entre secciones y *padding* interno holgado dentro de las tarjetas para evitar saturación visual.

### Profundidad sin sombras pesadas

Genera separación visual mediante contraste de colores de fondo (ej. tarjeta gris azulada sobre fondo azul marino). Si usas sombras (`box-shadow`), deben ser extremadamente sutiles y difuminadas.

### Fondos dinámicos

Para secciones grandes, evita colores sólidos planos. Implementa texturas muy sutiles, como patrones de puntos tenues en las esquinas o marcas de agua translúcidas de gran tamaño (logos o iconos desenfocados con opacidad muy baja).

## 4. Relación con la skill design-taste-frontend

Esta guía de estilos es compatible con la skill `design-taste-frontend` (`skill/front/habilidades/design-taste-frontend/SKILL.md`) y el agente `frontlipe` (`skill/front/agentes/frontlipe/frontlipe.md`). En caso de conflicto entre ambas, prevalece la definición más específica para cada componente, acordada con el equipo de diseño.

## 5. Aplicación por entregable

- **Web (React):** esta guía rige los componentes de `apps/web/src/`.
- **Móvil (React Native):** los mismos valores de color, tipografía y estructura se traducen al sistema de diseño móvil, respetando las capacidades de React Native.

---

*Antes de implementar componentes basados en Tailwind u otro framework CSS, confirma que la decisión está aprobada y documentada en `docs/decisions/` (ver AGENTS.md §5).*
