# Entidades del dominio

> **Estado:** modelo **conceptual** con las preguntas P-01 a P-07, P-10 a P-12, P-14 a P-16, P-18, P-20, P-25 y P-26 ya respondidas. No todas las entidades son tablas y algunas tablas no son entidades del negocio. La traducción relacional, ya implementada en `apps/backend/prisma/schema.prisma`, está en [`../database/data-model.md`](../database/data-model.md).
> Marcas: ✅ confirmado · 🟡 hipótesis · ❓ pendiente. Los códigos `P-xx` remiten a las [preguntas pendientes](business-rules.md#preguntas-pendientes).

## Índice

- [Entidades principales](#entidades-principales): Usuario, Área, Facultad, Proyecto, Tablero, Actividad, Documento, Novedad y Reunión.
- [Entidades secundarias y asociativas](#entidades-secundarias-y-asociativas).
- [Conceptos que no son entidades](#conceptos-que-no-son-entidades).
- [Resumen de relaciones y cardinalidades](#resumen-de-relaciones-y-cardinalidades).
- [Diagrama entidad-relación conceptual](#diagrama-entidad-relación-conceptual).

---

## Entidades principales

### Usuario

Persona con cuenta en la plataforma. La entidad no aparece de forma explícita en la definición funcional, pero todos los roles dependen de ella.

| Atributo conceptual | Estado | Notas |
| --- | --- | --- |
| Nombre completo | 🟡 | |
| Correo electrónico | 🟡 | Se supone único e institucional. |
| Rol(es) global(es) | ✅ | Puede tener **varios** (P-02). |
| Estado (activo/inactivo) | 🟡 | Permite desactivar sin perder el historial. |
| Datos de autenticación | — | Los gestiona **Auth.js**; están fuera del dominio. |

**Responsabilidades:** identificar a la persona y concentrar sus roles y vinculaciones.
**Relaciones:** se vincula con facultades (decano), áreas (encargado), proyectos (participante), tableros, actividades (autor, encargado, aprobador), documentos, novedades y reuniones.

### Área

Tipo de proyecto académico, por ejemplo *semillero de investigación*, *proyecto de grado* o *tesis*.

| Atributo conceptual | Estado | Notas |
| --- | --- | --- |
| Nombre | ✅ | Implícito en los ejemplos. |
| Descripción | 🟡 | |
| Información institucional | ✅ | Se publica **mediante novedades** y no como atributo del área. |

**Responsabilidades:** clasificar proyectos y servir de audiencia para novedades.
**Relaciones:**
- Área **1 : N** Proyecto. Cada proyecto tiene un único tipo (🟡, se deduce de "representa el tipo de proyecto").
- Área **N : M** Usuario, como encargado de área (🟡, P-08).
- Área **1 : N** Audiencia de novedad.

> ✅ P-01: "Semillero de investigación" es un **tipo de proyecto** (un Área). No existe una entidad Semillero.

### Facultad

Facultad de la universidad.

| Atributo conceptual | Estado | Notas |
| --- | --- | --- |
| Nombre | 🟡 | |
| Código institucional | ❓ | No se debe inventar. |
| Información institucional | ✅ | Se publica mediante novedades. |

**Responsabilidades:** agrupar proyectos y delimitar el alcance del decano.
**Relaciones:**
- Facultad **N : M** Proyecto, mediante **Proyecto-Facultad** (✅ P-04). Un proyecto tiene al menos una facultad (se valida en el servicio).
- Decano **1 : N** Facultad (✅, "una o varias facultades a su cargo"). Una facultad tiene un único decano vigente y se conserva el historial (✅ P-06).

### Proyecto

Proyecto académico en desarrollo. Es el **núcleo del dominio**.

| Atributo conceptual | Estado | Notas |
| --- | --- | --- |
| Título | 🟡 | |
| Descripción / información | ✅ | "Gestionar su información". |
| Área (tipo) | 🟡 | Obligatoria, una por proyecto. |
| Facultades | ✅ | Una o varias, mínimo una (P-04). |
| Estado / ciclo de vida | ✅ | Activo, finalizado o cancelado (P-26). |
| Fechas (inicio, fin) | 🟡 | |
| Creado por | 🟡 | Un decano, según los permisos. |
| Eliminación | ✅ | Lógica (P-20). |

**Responsabilidades:** contener participantes, tableros, actividades, documentos y reuniones.
**Relaciones:**
- Proyecto **N : M** Facultad, a través de **Proyecto-Facultad** (✅ P-04).
- Proyecto **N : M** Usuario, a través de **Participante de proyecto**. Como máximo un estudiante líder activo (P-03) y un tutor principal activo (P-05).
- Proyecto **1 : N** Tablero.
- Proyecto **1 : N** Documento (✅ P-15).
- Proyecto **0..1 : N** Reunión (✅ P-18, el proyecto es opcional en la reunión).

### Tablero

Recopilación de actividades relacionadas con una meta común.

| Atributo conceptual | Estado | Notas |
| --- | --- | --- |
| Título | ✅ | |
| Fecha de entrega | ✅ | |
| Estado de progreso | ✅ | Pendiente, en progreso, finalizado o cancelado (P-11). |
| Resultado | ✅ | Opcional: éxito o fracaso, independiente del progreso (P-11). |
| Tutor responsable | ✅ | Exactamente uno. Debe ser tutor del proyecto (🟡, P-24). |
| Estudiante encargado | ✅ | Exactamente uno. Debe ser estudiante del proyecto (🟡, P-24). |
| Proyecto | 🟡 | Se deduce de "gestionar sus tableros". |

**Responsabilidades:** agrupar y dar seguimiento a un conjunto de actividades.
**Relaciones:** Proyecto **1 : N** Tablero; Tablero **1 : N** Actividad; Tablero **N : 1** Usuario (tutor responsable); Tablero **N : 1** Usuario (estudiante encargado).

### Actividad

Tarea o unidad de trabajo pequeña dentro de un tablero.

| Atributo conceptual | Estado | Notas |
| --- | --- | --- |
| Información (título, descripción) | ✅ | |
| Autor | ✅ | Usuario que la creó. |
| Estado de progreso | ✅ | Pendiente, en progreso, finalizado o cancelado (P-11). |
| Resultado | ✅ | Opcional: éxito o fracaso (P-11). |
| Estado de aprobación del tutor | ✅ | Pendiente, aprobada o rechazada; solo el estado actual, con quién y cuándo (P-12). |
| Adjuntos | ✅ | Cero o varios; cada uno es un enlace o un documento (P-14). |
| Encargados | ✅ | Uno o varios (P-10). |
| Fecha límite | ❓ | No está definida. |

**Responsabilidades:** representar el trabajo asignable, verificable y aprobable.
**Relaciones:** Tablero **1 : N** Actividad; Actividad **N : 1** Usuario (autor); Actividad **N : M** Usuario (encargados, ✅ P-10); Actividad **1 : N** Adjunto de actividad (✅ P-14); Actividad **N : 1** Usuario (tutor que aprueba, 🟡; cuál tutor aprueba sigue ❓).

### Documento

Archivo guardado en un servidor externo y accesible por API. El sistema guarda los **metadatos**, no el binario.

| Atributo conceptual | Estado | Notas |
| --- | --- | --- |
| Nombre | 🟡 | |
| Formato | ✅ | PDF, Word, Excel o imagen. |
| Clave de almacenamiento | ✅ | Clave del objeto en S3; el backend genera el enlace de acceso (P-15, DB-08). |
| Tamaño | 🟡 | |
| Subido por | 🟡 | |
| Fecha de carga | 🟡 | |
| Proyecto | ✅ | Todo documento pertenece a un proyecto (P-15). |

**Responsabilidades:** permitir identificar y recuperar el archivo externo.
**Relaciones:** Documento **N : 1** Usuario (autor de la carga); Documento **N : 1** Proyecto (✅); Documento **1 : N** Adjunto de actividad (un mismo documento puede adjuntarse a varias actividades).

### Novedad

Noticia, comunicación, cambio o notificación dirigida a un grupo de usuarios.

| Atributo conceptual | Estado | Notas |
| --- | --- | --- |
| Título | 🟡 | |
| Contenido | ✅ | |
| Tipo (noticia, comunicación, cambio, notificación) | ✅ | La notificación es un tipo de novedad (P-16). |
| Autor | 🟡 | |
| Fecha de publicación | 🟡 | |
| Audiencia(s) | ✅ | Todos, roles, facultad, área o proyecto. |
| Vigencia / expiración | ❓ | No definida; no hay columna de expiración. |
| Registro de lectura | ✅ | No existe; la audiencia se calcula al consultar (P-16). |
| Canales externos (WhatsApp, correo) | ❓ | Pendientes (P-16). |

**Responsabilidades:** comunicar información institucional a una audiencia acotada.
**Relaciones:** Novedad **N : 1** Usuario (autor); Novedad **1 : N** Audiencia de novedad.

### Reunión

Registro local de una reunión de **Microsoft Teams**. No replica toda la información que gestiona Teams.

| Atributo conceptual | Estado | Notas |
| --- | --- | --- |
| Fecha (y hora) | ✅ | |
| Motivo | ✅ | |
| Participantes | ✅ | Relación N:M con usuarios del sistema (P-18). |
| Enlace de acceso | ✅ | |
| Enlace de grabación | ✅ | "Enlace de acceso **o** grabación"; se proponen dos atributos opcionales. |
| Duración | ✅ | |
| Identificador externo de Teams | 🟡 | Necesario para sincronizar. |
| Proyecto | ✅ | Opcional (P-18). |
| Organizador | 🟡 | Probablemente un tutor. |

**Responsabilidades:** registrar la reunión y su acceso sin depender de consultar Teams cada vez.
**Relaciones:** Reunión **N : M** Usuario, a través de **Participante de reunión**; Reunión **N : 0..1** Proyecto (✅).

---

## Entidades secundarias y asociativas

| Entidad | Tipo | Une | Atributos propios | Estado |
| --- | --- | --- | --- | --- |
| **Asignación de rol global** | Asociativa | Usuario ↔ Rol | Fecha de asignación, asignado por | ✅ Un usuario puede tener varios roles (P-02). |
| **Asignación de decano** | Asociativa | Usuario (decano) ↔ Facultad | Vigencia (desde/hasta) | ✅ P-06 |
| **Asignación de encargado de área** | Asociativa | Usuario ↔ Área | Fecha de asignación | 🟡 Provisional (P-08) |
| **Proyecto-Facultad** | Asociativa | Proyecto ↔ Facultad | — | ✅ P-04 |
| **Participante de proyecto** | Asociativa | Usuario ↔ Proyecto | Rol de proyecto, tutor principal, estado (activo/inactivo), fecha de ingreso y salida | ✅ Con historial de participación (P-25). Un estudiante tiene un solo proyecto activo; un proyecto tiene un líder y un tutor principal como máximo. |
| **Encargado de actividad** | Asociativa | Usuario ↔ Actividad | Asignado por, fecha | ✅ P-10 |
| **Audiencia de novedad** | Asociativa | Novedad ↔ (todos / rol / facultad / área / proyecto) | Tipo de audiencia | ✅ Sistema de destinatarios flexible. Ver DB-06. |
| **Participante de reunión** | Asociativa | Usuario ↔ Reunión | Asistencia (❓) | 🟡 |
| **Recordatorio** | Secundaria | Usuario (creador), Proyecto (opcional) | Título, fecha y hora | ✅ Existe / ❓ P-19 (modelo mínimo provisional) |
| **Adjunto de actividad** | Asociativa | Actividad → (enlace o Documento) | Tipo (enlace/documento), URL o documento, creado por | ✅ P-14. Ver DB-07. |
| **Rol** (catálogo) | Catálogo | — | Nombre | 🟡 Conjunto cerrado y pequeño; puede modelarse como enumeración. |
| **Rol de proyecto** (catálogo) | Catálogo | — | Tutor, Estudiante, Estudiante líder | ✅ P-03 |

---

## Conceptos que no son entidades

| Concepto | Tratamiento | Motivo |
| --- | --- | --- |
| Dashboard / métricas | Consultas derivadas | Persistirlas duplicaría información, salvo que se decida cachearlas. |
| Información institucional de un área o facultad | Novedades con esa audiencia | Lo define así la propia descripción funcional. |
| Sesión, cuenta y credenciales | Las gestiona Auth.js | Están fuera del dominio de negocio. |
| Datos completos de Teams | No se almacenan | Restricción confirmada. |
| Binario del documento | Almacenamiento externo (AWS S3) | Restricción confirmada. |

---

## Resumen de relaciones y cardinalidades

| Relación | Cardinalidad | Estado | Mecanismo |
| --- | --- | --- | --- |
| Área – Proyecto | 1 : N | 🟡 | Referencia en Proyecto |
| Facultad – Proyecto | N : M (mínimo una facultad por proyecto) | ✅ | Proyecto-Facultad |
| Decano – Facultad | 1 : N (un decano vigente por facultad; con historial) | ✅ | Asignación de decano |
| Encargado – Área | N : M | 🟡 | Asignación de encargado |
| Usuario – Proyecto | N : M (estudiante: un proyecto activo) | ✅ | Participante de proyecto |
| Proyecto – Tablero | 1 : N | 🟡 | Referencia en Tablero |
| Tablero – Actividad | 1 : N | ✅ | Referencia en Actividad |
| Tablero – Tutor responsable | N : 1 | ✅ | Referencia en Tablero |
| Tablero – Estudiante encargado | N : 1 | ✅ | Referencia en Tablero |
| Actividad – Autor | N : 1 | ✅ | Referencia en Actividad |
| Actividad – Encargados | N : M | ✅ | Encargado de actividad |
| Actividad – Adjunto | 1 : N | ✅ | Adjunto de actividad (enlace o Documento) |
| Documento – Adjunto | 1 : N | ✅ | Referencia en Adjunto de actividad |
| Proyecto – Documento | 1 : N | ✅ | Referencia en Documento |
| Novedad – Audiencia | 1 : N | ✅ | Audiencia de novedad |
| Reunión – Usuario | N : M | ✅ | Participante de reunión |
| Proyecto – Reunión | 1 : N (proyecto opcional) | ✅ | Referencia opcional en Reunión |

---

## Diagrama entidad-relación conceptual

Las líneas reflejan la propuesta e incluyen hipótesis. El detalle de cada relación está en las tablas anteriores.

```mermaid
erDiagram
    USUARIO ||--o{ ASIGNACION_DECANO : "es decano en"
    FACULTAD ||--o{ ASIGNACION_DECANO : "tiene"
    USUARIO ||--o{ ASIGNACION_ENCARGADO_AREA : "administra"
    AREA ||--o{ ASIGNACION_ENCARGADO_AREA : "tiene"

    AREA ||--o{ PROYECTO : "clasifica"
    PROYECTO ||--|{ PROYECTO_FACULTAD : "pertenece a"
    FACULTAD ||--o{ PROYECTO_FACULTAD : "agrupa"
    USUARIO ||--o{ PARTICIPANTE_PROYECTO : "participa"
    PROYECTO ||--o{ PARTICIPANTE_PROYECTO : "tiene"

    PROYECTO ||--o{ TABLERO : "contiene"
    USUARIO ||--o{ TABLERO : "tutor responsable"
    USUARIO ||--o{ TABLERO : "estudiante encargado"
    TABLERO ||--o{ ACTIVIDAD : "agrupa"
    USUARIO ||--o{ ACTIVIDAD : "es autor"
    ACTIVIDAD ||--o{ ENCARGADO_ACTIVIDAD : "asignada a"
    USUARIO ||--o{ ENCARGADO_ACTIVIDAD : "es encargado"
    ACTIVIDAD ||--o{ ADJUNTO_ACTIVIDAD : "tiene"
    ADJUNTO_ACTIVIDAD }o--o| DOCUMENTO : "documento (si no es enlace)"

    PROYECTO ||--o{ DOCUMENTO : "almacena"
    USUARIO ||--o{ DOCUMENTO : "sube"

    USUARIO ||--o{ NOVEDAD : "publica"
    NOVEDAD ||--|{ AUDIENCIA_NOVEDAD : "dirigida a"
    FACULTAD |o--o{ AUDIENCIA_NOVEDAD : ""
    AREA |o--o{ AUDIENCIA_NOVEDAD : ""
    PROYECTO |o--o{ AUDIENCIA_NOVEDAD : ""

    PROYECTO |o--o{ REUNION : "programa"
    REUNION ||--o{ PARTICIPANTE_REUNION : "convoca"
    USUARIO ||--o{ PARTICIPANTE_REUNION : "asiste"

    USUARIO ||--o{ RECORDATORIO : "crea"
```

### Usuarios, proyectos, facultades y áreas

```mermaid
flowchart LR
    U(("Usuario"))
    U -- "rol(es) global(es), uno o varios" --> RG["Administrador · Encargado de área ·<br/>Decano · Tutor · Estudiante"]
    U -- "decano de (1..N, con historial)" --> F["Facultad"]
    U -- "encargado de (N:M) 🟡" --> A["Área"]
    U -- "participante (N:M)<br/>rol de proyecto" --> P["Proyecto"]
    F -- "N:M (mín. 1 por proyecto)" --> P
    A -- "1 por proyecto" --> P
```

### Tableros y actividades

```mermaid
flowchart TB
    P["Proyecto"] -->|1:N| T["Tablero<br/>título · fecha de entrega · progreso · resultado"]
    T -->|N:1| TR["Tutor responsable"]
    T -->|N:1| EE["Estudiante encargado"]
    T -->|1:N| A["Actividad<br/>info · progreso · resultado · aprobación"]
    A -->|N:1| AU["Autor"]
    A -->|N:M| EN["Encargados"]
    A -->|1:N| AD["Adjuntos: enlace o Documento"]
```
