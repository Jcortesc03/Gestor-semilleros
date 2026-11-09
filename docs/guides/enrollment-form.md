# Guía de configuración del formulario de inscripciones

**Qué es:** cómo crear el formulario público de Google Forms y la hoja privada de Google Sheets de la que el backend leerá las respuestas. **Qué no es:** este documento no crea ningún formulario ni ninguna hoja, y no sustituye el aviso institucional de tratamiento de datos.

> **Aviso sobre menores de edad.** El campo «Tipo de documento» admite TI (tarjeta de identidad), que puede corresponder a menores. Antes de recoger datos reales de menores, la universidad debe revisar el texto de autorización que le corresponde; esta guía no define esa política ni autoriza la captura. No uses datos reales hasta contar con ese texto.

## Paso 1. Crear el formulario público

1. En Google Forms, crea un formulario nuevo y déjalo público para responder (cualquiera puede enviar respuestas; no requiere iniciar sesión).
2. Agrega estas preguntas, con este texto exacto:

| # | Pregunta | Tipo de respuesta |
| --- | --- | --- |
| 1 | Nombres | Respuesta corta (texto) |
| 2 | Apellidos | Respuesta corta (texto) |
| 3 | Correo electrónico | Respuesta corta (texto) |
| 4 | Tipo de documento | Opción múltiple: `CC`, `TI` |
| 5 | Número de documento | Respuesta corta (texto), con validación de solo dígitos |
| 6 | Facultad | Opción múltiple: `Ingeniería de Sistemas`, `Ingeniería de Software` |
| 7 | Área | Opción múltiple: `Semillero`, `Proyecto de grado` |
| 8 | Período de inscripción | Respuesta corta (texto), obligatoria |
| 9 | Autorización de tratamiento de datos | Casilla de verificación obligatoria |

Notas:

- **Número de documento:** respuesta corta de texto con validación «solo dígitos». No uses respuesta numérica: el sistema conserva los ceros iniciales (por ejemplo, `00123`).
- **Período de inscripción:** pregunta obligatoria y sin valores predefinidos; el período llega de la respuesta, no se asume.
- **Autorización de tratamiento de datos:** casilla obligatoria. El texto legal completo lo aporta la universidad; aquí solo va el enunciado de la pregunta. La importación solo acepta la respuesta afirmativa exacta; nunca se asume por defecto.
- No agregues «Carrera» ni una «modalidad» separada: el área ya distingue Semillero de Proyecto de grado.
- Si tu formulario ya separa `Primer Nombre`, `Segundo Nombre`, `Primer Apellido` y `Segundo Apellido`, podés conservarlo: el importador une esas partes y admite que las segundas estén vacías. Las columnas combinadas `Nombres` y `Apellidos` siguen siendo compatibles y tienen prioridad si también existen.

## Paso 2. Vincular la hoja privada

1. En el formulario, abre la pestaña «Respuestas» y crea la hoja de cálculo vinculada («Crear hoja de cálculo»).
2. Esa hoja es **privada**: no la compartas públicamente. El backend la leerá con su propio acceso de solo lectura cuando esté configurado; la web nunca accede directamente a Google.
3. Las cabeceras de la hoja deben ser, en este orden: `Nombres`, `Apellidos`, `Correo electrónico`, `Tipo de documento`, `Número de documento`, `Facultad`, `Área`, `Período de inscripción`, `Autorización de tratamiento de datos`. Puede existir una marca temporal inicial generada por Forms.
4. No crees usuarios ni participantes desde esta hoja: las respuestas solo se revisan en «Inscripciones».

## Paso 3. Configurar la fuente en la aplicación

1. Entra a «Inscripciones» (visible para administradores y encargados de área).
2. Elige el área real y el tipo de área (Semillero o Proyecto de grado).
3. Escribe el identificador de la hoja privada y el rango (por ejemplo, `Respuestas!A:I`) y pulsa «Guardar fuente». No se piden credenciales en la web.
4. Pulsa «Vista previa»: revisa las filas leídas, válidas, inválidas y duplicadas, con el período y la columna de autorización.
5. Solo si la vista previa es correcta, marca la confirmación y pulsa «Confirmar importación».

## Qué verificar antes de usar datos reales

- [ ] El texto legal de la autorización lo aprobó la universidad.
- [ ] Se revisó el tratamiento de datos de menores (TI) con el área competente.
- [ ] La hoja vinculada sigue privada y el backend tiene acceso de solo lectura.
- [ ] Las respuestas de prueba son ficticias; no se enviaron datos reales.
