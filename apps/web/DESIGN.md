# Sistema de diseño de la aplicación web

Guía visual y técnica de las vistas web del Gestor de Semilleros
Universitarios. Es una aplicación autenticada, no una página de
presentación: no hay héroes de pantalla completa, precios, capturas
ni estadísticas inventadas.

La guía de estilos del proyecto
(`skill/front/habilidades/design-taste-frontend/guia-estilos-proyecto.md`)
prevalece sobre la skill `design-taste-frontend` en los conflictos
específicos de componente (paleta, tipografía, radios y tarjetas).

## Color

Seis valores exactos, sin otros tonos en la interfaz:

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-navy` | `#151B40` | Fondos oscuros, área de marca, títulos sobre fondos claros |
| `--color-navy-soft` | `#2A2C41` | Tarjetas sobre fondos oscuros |
| `--color-gold` | `#F3B92F` | Acciones principales, iconos, distintivos y acentos |
| `--color-alert` | `#C1272D` | Errores y avisos de extrema importancia |
| `--color-canvas` | `#F5F2EB` | Fondo de la aplicación |
| `--color-paper` | `#FFFFFF` | Tarjetas y campos sobre el fondo claro |

Reglas de contraste:

- Texto principal en azul marino sobre blanco o beige (supera el
  requisito AA).
- Texto blanco o dorado sobre azul marino. El dorado nunca se usa
  como texto sobre blanco.
- Los botones principales son dorados con texto azul marino.
- Los mensajes de error usan rojo `#C1272D` con negrita sobre un
  fondo claro teñido.

## Tipografía

- Família única: **Montserrat** (pesos 400, 600, 700 y 800),
  cargada en local desde `@fontsource/montserrat`. Sin descargas
  externas.
- Títulos en 700 u 800 con interletraje ajustado; cuerpo en 400;
  botones y distintivos en 600.
- Etiquetas pequeñas en mayúsculas solo para metadatos (por
  ejemplo, «Roles» o «Panel personal»); el cuerpo siempre en
  tamaño legible (14 px o más, 16 px en campos y textos largos).

## Forma, espacio y profundidad

- Radios de 8 a 12 px en tarjetas, botones, campos y avisos. Los
  círculos se reservan para iconos y avatares; los distintivos de
  rol usan forma de pastilla.
- La información vive en tarjetas independientes, nunca suelta
  sobre el fondo. Margen interno amplio y separación generosa
  entre secciones.
- La separación se logra por contraste de fondos (tarjeta clara
  sobre beige, tarjeta gris azulada sobre azul marino). Las
  sombras son muy sutiles (`--shadow-card`, `--shadow-raised`).
- Textura sutil de puntos dorados en las áreas de marca sobre
  azul marino; nunca sobre formularios ni texto.
- Iconos de línea (`lucide-react`) en contenedores circulares
  dorados tenues o sobre azul marino, según el fondo.

## Componentes y estados

### Inicio de sesión (`LoginPage`)

- Área de marca editorial azul marino a la izquierda en pantallas
  amplias y banda superior en pantallas pequeñas. Presenta el
  nombre real del producto y su finalidad, sin datos ni pruebas
  inventadas.
- Tarjeta de formulario blanca con campos de correo y contraseña:
  etiqueta visible, `type="email"` con `autocomplete="username"`,
  `autocomplete="current-password"` en la contraseña y botón
  accesible para mostrarla u ocultarla.
- Estado de error: aviso con `role="alert"` asociado a los campos.
  Estado de carga: botón deshabilitado con indicador giratorio y
  texto «Iniciando sesión…», campos deshabilitados.
- Tras cada intento se limpia la contraseña del formulario.
- Sin enlaces de registro ni recuperación de contraseña: no
  existe una ruta real para ellos en esta versión.

### Panel personal (`PanelPage`)

- Barra lateral azul marino con marca, resumen de la persona
  usuaria (iniciales, nombre, correo y roles) y botón «Cerrar
  sesión». En pantallas pequeñas la barra se convierte en una
  cabecera superior.
- Contenido sobre fondo beige: panel de bienvenida con el nombre
  real y tarjetas de **Perfil**, **Roles**, **Sesión** (activa) y
  **Módulos de gestión** (explícitamente no disponibles, sin
  enlaces ni botones engañosos).
- Solo se muestran datos reales del usuario recibido: sin
  analíticas, proyectos, conteos ni autorizaciones inventadas.
- Estado de error de cierre de sesión con `role="alert"`.
  Estado de carga: botón deshabilitado con «Cerrando sesión…».

### Contraste de comportamiento

- Las vistas son componentes visuales independientes: no hacen
  llamadas de red, no guardan la sesión y no enrutan. El padre
  conecta sesión y callbacks.
- Los callbacks del padre resuelven siempre y comunican el fallo
  mediante la prop `error`; el componente captura cualquier
  rechazo para no dejar promesas sin tratar.
- Microinteracciones discretas (botones que se elevan y se
  presionan, transiciones de 150–200 ms). Con
  `prefers-reduced-motion` todo movimiento se detiene.

## Accesibilidad y responsive

- Orden de lectura con un solo título principal por vista,
  regiones con nombre (`aria-labelledby`), etiquetas visibles en
  campos y foco de teclado siempre visible (azul sobre fondos
  claros, dorado sobre fondos oscuros).
- Objetivos táctiles de al menos 44 px; listas de roles como
  listas reales; icono decorativo siempre con `aria-hidden`.
- Diseño verificado contra los anchos de referencia 390, 768,
  1024 y 1440 px: sin desbordamiento horizontal y con una sola
  columna en móvil.
