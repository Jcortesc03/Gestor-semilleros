# Glosario del dominio

> **Estado:** planificación. Definiciones de trabajo, todavía no implementadas.
> Marcas: ✅ confirmado · 🟡 hipótesis · ❓ pendiente (ver [`README.md`](README.md)).

## Estructura académica

| Término | Definición | Estado |
| --- | --- | --- |
| Área | Tipo de proyecto académico, por ejemplo *semillero de investigación*, *proyecto de grado* o *tesis*. Puede publicar información institucional mediante novedades. | ✅ |
| Facultad | Unidad académica de la universidad. Agrupa proyectos y puede publicar información institucional mediante novedades. | ✅ |
| Proyecto | Proyecto académico en desarrollo, con participantes, tableros, actividades y documentos. | ✅ |
| Semillero | Tipo de proyecto académico: es un **Área**. Cada semillero concreto se registra como un Proyecto de esa área (P-01). | ✅ |
| Participante | Usuario vinculado a un proyecto con un rol de proyecto. Se guarda el historial de ingreso y salida, y un estudiante solo puede tener un proyecto activo a la vez (P-25). | ✅ |

## Personas y roles

| Término | Definición | Estado |
| --- | --- | --- |
| Usuario | Persona con cuenta en la plataforma. | ✅ |
| Rol global | Rol que tiene un usuario en todo el sistema: Administrador, Encargado de área, Decano, Tutor o Estudiante. Un usuario puede tener varios (P-02). | ✅ |
| Rol de proyecto | Responsabilidad de un usuario dentro de un proyecto concreto: tutor (uno de ellos principal), estudiante o estudiante líder. | ✅ |
| Administrador | Gestiona usuarios y roles y consulta métricas generales. | ✅ |
| Encargado de área | Administra la información de una o varias áreas y publica anuncios generales. | ✅ |
| Decano | Tiene a cargo una o varias facultades y administra sus proyectos. | ✅ |
| Tutor | Docente responsable de uno o varios proyectos. | ✅ |
| Estudiante | Participante que interactúa con las actividades que tiene asignadas. Sinónimo anterior: **Integrante**. | ✅ |
| Estudiante líder | Rol de proyecto: estudiante que gestiona los encargados de las actividades. Como máximo uno activo por proyecto (P-03). | ✅ |

## Trabajo

| Término | Definición | Estado |
| --- | --- | --- |
| Tablero | Conjunto de actividades con una meta común. Tiene fecha de entrega, estado, tutor responsable y estudiante encargado. | ✅ |
| Actividad | Tarea o unidad de trabajo pequeña dentro de un tablero. Falta confirmar si equivale a la **tarea** del alcance original. | ✅ / ❓ (equivalencia) |
| Encargado (de actividad) | Usuario asignado para ejecutar una actividad. Una actividad puede tener varios (P-10). | ✅ |
| Estado de aprobación | Validación que hace el tutor sobre una actividad. Es independiente del estado de la actividad. | ✅ |
| Progreso | Avance de una tarea o proceso. | ✅ |
| Resultado | Desenlace de una tarea o proceso. No equivale al progreso. | ✅ |
| Adjunto | Enlace o documento asociado a una actividad. Una actividad puede tener varios (P-14). | ✅ |

## Comunicación y recursos

| Término | Definición | Estado |
| --- | --- | --- |
| Documento | Metadatos de un archivo (PDF, Word, Excel o imagen) guardado en un almacenamiento externo y accesible por API. | ✅ |
| Novedad | Noticia, comunicación, cambio o notificación dirigida a una audiencia. | ✅ |
| Audiencia / destinatario | A quién va dirigida una novedad: todos, determinados roles, una facultad, un área o un proyecto. | ✅ |
| Notificación | Tipo de novedad (P-16). Los canales externos (WhatsApp o correo) están por definir. | ✅ / ❓ (canales) |
| Reunión | Registro local de una reunión de Microsoft Teams. | ✅ |
| Recordatorio | Aviso programado creado por un tutor. Sus atributos no están definidos. | ✅ (existencia) / ❓ (detalle) |
| Dashboard | Vista de métricas derivadas, acotada al alcance de cada rol. No es una entidad persistida. | 🟡 |

Los términos nuevos deben acordarse y registrarse aquí antes de usarlos en el código.
