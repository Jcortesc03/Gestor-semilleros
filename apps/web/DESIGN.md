# Sistema de diseño de la aplicación web

Guía visual y técnica de las vistas web del Gestor de Semilleros
Universitarios. Es una aplicación autenticada, no una página de
presentación: no hay héroes de pantalla completa, precios, capturas
ni estadísticas inventadas.

La guía de estilos del proyecto
(`skill/front/habilidades/design-taste-frontend/guia-estilos-proyecto.md`)
prevalece sobre la skill `design-taste-frontend` en los conflictos
específicos de componente (paleta, tipografía, radios y tarjetas).
La skill aporta la disciplina editorial (jerarquía, whitespace,
una idea por pantalla y foco visible); la guía del proyecto aporta
la paleta y el sistema de componentes.

## Dirección (pase Frontlipe, noviembre de 2026)

**Concepto.** Producto institucional editorial y sobrio para
semilleros de investigación universitarios, no plantilla SaaS.
Azul marino dominante como superficie de marca, beige como lienzo
y dorado como único acento de acción. Sin héroe de marketing, sin
gradientes genéricos (salvo el filete editorial), sin tarjetas
iguales de tres columnas y sin iconos emoji.

**Tensión deliberada.** Display masivo en la marca (antes del
formulario) frente a formulario contenido y legible. El dorado
aparece una sola vez en el titular y en los botones, no como
decoración dispersa.

**Sistema tipográfico y espacial.** Una sola familia (Montserrat).
Titular de login en `clamp(2.25rem, 5vw, 4.5rem)` con
`leading-[0.95]` y `tracking-tight`; cuerpo en 16 px con
`leading-relaxed`; metadatos en MAYÚSCULAS de 11–12 px con
`tracking-[0.18em]`–`[0.22em]` solo para etiquetas. Secciones
separadas por `space-y-7` y `py-8`–`py-10`; tarjetas con
`p-5 sm:p-7` y `rounded-xl` (12 px). Todo contenedor usa `min-w-0`
y textos largos con `break-words` / `break-all` para que no haya
scroll horizontal a 390 px.

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
- `tokens.css` conserva los seis valores y añade escala editorial,
  radios y sombras; `app.css` los mapea en `@theme` para que
  `bg-canvas`, `text-navy`, `bg-gold`, etc. resuelvan a los hex.

## Tipografía

- Família única: **Montserrat** (pesos 400, 600, 700 y 800),
  cargada en local desde `@fontsource/montserrat`. Sin descargas
  externas.
- Títulos en 700 u 800 con interletraje ajustado; cuerpo en 400;
  botones y distintivos en 600.
- Etiquetas pequeñas en mayúsculas solo para metadatos (por
  ejemplo, «Roles» o «Panel personal»); el cuerpo siempre en
  tamaño legible (14 px o más, 16 px en campos y textos largos).
- Jerarquía: marca display (`text-6xl` en login) > H1 de sección
  (`text-3xl sm:text-4xl` en espaciado) > H2 de tarjeta
  (`text-xl`) > cuerpo/datos. Un solo H1 por vista.

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
- Filete editorial dorado (`hairline-gold`, 2 px) bajo el título
  del espacio de trabajo y sobre la tarjeta de sesión: una sola
  línea fina como gesto tipográfico, sin repetirla en cada tarjeta.

## Componentes y estados — receta de clases

### Marca (`BrandMark`)

- Contenedor: `inline-flex items-center gap-3`; icono en
  `grid size-11 place-items-center rounded-full bg-gold text-navy`
  con `GraduationCap size-6 strokeWidth 1.75` (en `size="sm"`,
  `size-9` y `size-5`). Props: `variant` (`light`/`dark`) y
  nueva `size` opcional (`sm`/`md`); nombres exportados sin cambio.
- Nombre: `text-base font-bold tracking-tight` (truncate);
  subtítulo «Universitarios» en
  `text-[0.6875rem] font-semibold uppercase tracking-[0.22em]`
  dorado sobre navy y navy/70 sobre claro.

### Inicio de sesión (`LoginPage`)

- Contenedor: `min-h-dvh bg-canvas lg:grid
  lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]`. En móvil la marca es
  banda superior y en `lg` ocupa la columna izquierda con
  `lg:min-h-dvh`.
- Marca: `bg-navy text-white on-dark` con `.texture-dots` y
  marca de agua dorada en `opacity-25`, ambas `aria-hidden`.
  Eyebrow dorada en MAYÚSCULAS; H1
  `text-[clamp(2.25rem,5vw,4.5rem)] font-extrabold leading-[0.95]
  tracking-tight` con «investigación» en `text-gold`; párrafo
  `mt-6 max-w-md text-base sm:text-lg text-white/85`.
- Índice real en `dl mt-10 grid gap-8 border-t
  border-white/15 pt-8 sm:grid-cols-3`: «Trabajo académico»
  (proyectos, tableros y actividades), «Encuentros» (reuniones
  con Microsoft Teams y novedades) y «Acceso» (solo cuentas
  institucionales activas). Se eliminó el bloque «En desarrollo»
  que presentaba las reuniones como inexistentes; no se menciona
  documentos (sin API) ni se inventa funcionalidad alguna.
- Formulario: `main flex items-center justify-center px-5 py-10
  sm:px-8 lg:px-14 lg:py-12` con tarjeta `w-full max-w-md
  rounded-xl border border-navy/10 bg-white p-6 shadow-card
  sm:p-10`. Encabezado con eyebrow «Acceso institucional», H2
  «Iniciar sesión» (`text-2xl sm:text-3xl font-extrabold`).
- Campos: `h-12 w-full rounded-lg border border-navy/25 bg-white
  px-4 text-base` con icono `size-5` a la izquierda (`pl-12`),
  `hover:border-navy/45`, `focus:border-navy focus:ring-2
  focus:ring-gold/70`, `placeholder:text-navy/65`. Etiquetas
  visibles «Correo electrónico» y «Contraseña» (14 px, 600),
  `type="email"` con `autocomplete="username"` y
  `autocomplete="current-password"`, botón «Mostrar contraseña»
  / «Ocultar contraseña» en `size-9` con foco navy.
- Error: `AlertMessage` con `id="login-error"` y `role="alert"`
  asociado a ambos campos con `aria-invalid` y
  `aria-describedby`.
- Botón «Iniciar sesión»: `flex h-12 w-full bg-gold text-navy
  rounded-lg font-semibold hover:brightness-[0.97]
  hover:shadow-raised active:scale-[0.985]` con `focus-visible`
  navy; en carga, `LoaderCircle animate-spin` y «Iniciando
  sesión…», deshabilitado.
- Google (solo con `onGoogle`): divisor «o» con líneas
  `bg-navy/15` y botón «Continuar con Google» (`h-12
  border-navy/25 hover:bg-canvas`). Sin enlaces de registro ni
  recuperación: no existe ruta real para ellos.

### Sesión y aviso de servicio (`App`, solo JSX)

- `main grid min-h-dvh place-items-center bg-canvas px-5 py-10`;
  tarjeta `w-full max-w-md rounded-xl border border-navy/10
  bg-white p-6 shadow-card sm:p-10` con filete `hairline-gold`
  superior. Eyebrow «Gestor de Semilleros Universitarios», H1
  en `text-2xl sm:text-3xl font-extrabold text-balance`, texto
  con `role="status"` (carga, con icono giratorio SVG) o
  `role="alert"` (sin servicio, con triángulo SVG en `text-alert`).
- Botón «Reintentar conexión»: `bg-gold text-navy rounded-lg
  min-h-12 w-full sm:w-auto` con foco navy. Textos y roles sin
  cambio; la lógica de `App` no se modificó.

### Espacio de trabajo (`Workspace`)

- Contenedor: `min-h-dvh overflow-x-clip bg-canvas lg:grid
  lg:grid-cols-[280px_minmax(0,1fr)]`.
- Lateral (`aside`, `on-dark`): `hidden lg:flex h-dvh flex-col
  bg-navy p-6 text-white sticky top-0` con `.texture-dots`
  decorativa. Marca light, ficha de usuario `rounded-xl
  bg-navy-soft p-4` con avatar circular dorado de iniciales,
  nombre `truncate text-sm font-bold`, correo `truncate text-xs
  text-white/75` y roles en MAYÚSCULAS doradas
  `tracking-[0.18em]`. Navegación con `aria-label="Secciones de
  la aplicación"`: botones `min-h-12 rounded-lg px-3 text-sm
  font-semibold`; activo `bg-gold text-navy`, inactivo
  `text-white/85 hover:bg-white/10 hover:text-white` con icono
  `size-5`. Lista `navigation` y etiquetas
  («Proyectos y actividades», «Reuniones», «Crear usuarios»,
  etc.) sin cambios.
- «Cerrar sesión»: `Button` primario dorado a `mt-auto w-full`
  con «Cerrando sesión…» y deshabilitado durante el envío.
- Menú móvil: `dialog` con `bg-navy on-dark`, cierre con
  `aria-label="Cerrar navegación"` y foco dorado (`on-dark`);
  cabecera superior en `bg-white border-b border-navy/10` con
  botón hamburguesa `size-12 border-navy/30` y `aria-expanded`.
- Contenido: `mx-auto max-w-7xl space-y-7 px-5 py-8 sm:px-8
  lg:px-10 lg:py-10` sobre `min-w-0`. Encabezado con eyebrow
  «Tu espacio de investigación», H1 `text-3xl sm:text-4xl
  font-extrabold text-balance` y filete dorado.
- «Mi panel» (antes «Mi cuenta», página `account`): primero
  `DashboardWorkspace` (ver sección siguiente) y debajo una
  `PanelCard` compacta «Hola, {nombre}» con correo, roles y
  «Actualizar cuenta». Se eliminaron «Funciones disponibles» y
  «Módulos pendientes»: los accesos viven en cada bloque del panel.

### Panel por rol (`features/dashboard`)

Un bloque por sección devuelta por `GET /api/dashboard`, en el
orden del backend (ADMIN, AREA_MANAGER, DEAN, TUTOR, STUDENT);
un usuario con varios roles ve los bloques apilados. Debajo, una
rejilla `lg:grid-cols-2` con «Próximas reuniones» (máx. 5) y
«Novedades recientes» (máx. 3). Cada fuente tiene su propia
carga (`role="status"`), vacío (`EmptyState`) y error
(`ErrorNotice`); un fallo no oculta las demás.

- **Administrador:** único bloque sobre azul marino con puntos
  (`darkCard`): H2 «Toda la institución», tres cifras de
  `text-4xl` (proyectos, tableros vencidos, actividades por
  aprobar; las dos últimas en dorado si son mayores que 0),
  botones dorados «Crear usuarios» y «Estado de WhatsApp», y una
  tarjeta `bg-navy-soft` con «Proyectos por estado».
- **Encargado de área:** tarjeta clara; áreas asignadas como
  pastillas con borde, tres cifras (proyectos, actividades,
  tableros vencidos), lista de proyectos con avance y botón «Ver
  novedades».
- **Decano:** facultades como lista tipográfica de filete a filete
  (`text-lg font-bold`) y proyectos con su avance; botón «Ver
  proyectos».
- **Tutor:** dos avisos con borde izquierdo de 4 px: actividades
  pendientes de aprobación (dorado tenue cuando hay) y tableros
  vencidos (rojo `alert` cuando hay), seguidos de sus proyectos
  con avance.
- **Estudiante:** dos columnas desde `md`: a la izquierda el
  medidor «Hechas: n de m» y el desglose por progreso de sus
  actividades asignadas; a la derecha sus proyectos, con la
  pastilla dorada «Líder del proyecto» si `projectRole` es
  `STUDENT_LEADER`.
- **Medidores:** el número siempre va en texto («Avance: 1 de 5
  (20 %)»); la barra (`h-2`, `aria-hidden`) solo refuerza.
  Las distribuciones son listas con cifra visible, sin depender
  del color. Los botones de acceso llaman a `onNavigate`.

### Alertas, botones y estados (`AlertMessage`, `WorkspaceUi`)

- `AlertMessage`: `flex gap-3 rounded-xl border border-alert/30
  bg-alert/10 px-4 py-3` con `CircleAlert size-5 text-alert` y
  texto `text-sm font-semibold text-alert`. Nombres y props sin
  cambio (`message`, `id`); nueva `variant` opcional
  (`error`/`plain`) para casos neutros.
- `Button`: `min-h-12 rounded-lg border px-4 font-semibold
  transition hover:-translate-y-0.5 hover:shadow-raised
  active:translate-y-0 motion-reduce:transform-none`; primario
  `bg-gold text-navy`, secundario `bg-white border-navy/30`,
  peligro `bg-alert text-white`. Foco navy vía global.
- `Field` / `inputClassName`: `min-h-12 rounded-lg border
  border-navy/50 bg-white px-3 text-base` con `focus:outline-navy`
  de 2 px; etiqueta 14 px 600 y pista `text-sm text-navy/70`.
- `PanelCard`: `rounded-xl border border-navy/10 bg-white p-5
  shadow-card sm:p-7` con H2 `text-xl font-bold tracking-tight`.
- `EmptyState`: `rounded-xl border-dashed border-navy/30
  bg-canvas/50 p-6`.
- `LoadingState`: `role="status"` con `LoaderCircle animate-spin
  motion-reduce:animate-none`; `ErrorNotice` delega en
  `AlertMessage`. Nombres exportados sin cambio.

### Contraste de comportamiento

- Las vistas son componentes visuales independientes: no hacen
  llamadas de red, no guardan la sesión y no enrutan. El padre
  conecta sesión y callbacks.
- Los callbacks del padre resuelven siempre y comunican el fallo
  mediante la prop `error`; el componente captura cualquier
  rechazo para no dejar promesas sin tratar.
- Microinteracciones discretas (botones que se elevan 2 px y se
  presionan, transiciones de 150–200 ms). Con
  `prefers-reduced-motion` todo movimiento se detiene: los
  spinners usan `motion-reduce:animate-none` y el CSS global
  reduce duraciones al mínimo.

## Accesibilidad y responsive

- Orden de lectura con un solo título principal por vista,
  regiones con nombre (`aria-labelledby`), etiquetas visibles en
  campos y foco de teclado siempre visible (azul sobre fondos
  claros, dorado sobre fondos oscuros vía `.on-dark`; campos con
  anillo dorado y `outline-offset`).
- Objetivos táctiles de al menos 44 px (48 px en botones y
  campos); listas de roles como listas reales; icono decorativo
  siempre con `aria-hidden`; `role="alert"` en errores y
  `role="status"` en la carga.
- Diseño verificado contra los anchos de referencia 390, 768,
  1024 y 1440 px: sin desbordamiento horizontal (contenedores
  `min-w-0`, `overflow-x: clip` en el documento y títulos
  `text-balance`) y con una sola columna en móvil.
  El lateral pasa a cabecera superior con `dialog` nativo.
