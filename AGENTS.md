# AGENTS.md

Guía de trabajo para agentes de IA (y colaboradores) en el **Gestor de Semilleros Universitarios**.

> Este archivo describe **cómo trabajar en el repositorio**, no qué construir. El alcance funcional vive en [`README.md`](README.md).

---

## 1. Contexto del proyecto

Plataforma integral para gestionar los semilleros de investigación de una universidad: reuniones, documentación, seguimiento, tareas, recordatorios, notificaciones, integración con Microsoft Teams, inteligencia artificial y panel de control.

Se compone de tres entregables:

| Entregable | Ruta | Responsabilidad |
| --- | --- | --- |
| Aplicación web | `apps/web` | Administración, gestión y consulta |
| Backend | `apps/backend` | Lógica de negocio, API, integraciones |
| Aplicación móvil | `apps/mobile` | Acceso desde dispositivos móviles |

Stack definido: **React** (web), **React Native** (móvil), **NestJS** (backend), **PostgreSQL** como base de datos, **Prisma** como ORM, **AWS S3** para documentos e imágenes, **Auth.js** para autenticación y autorización, **Docker** para despliegue, **pnpm + Turborepo** para el monorepo y **MVC** como patrón de arquitectura.

Idioma del proyecto: **español** para documentación, interfaz y nombres de dominio; **inglés** para identificadores de código (variables, funciones, tipos) salvo términos del dominio que se acuerden conservar.

---

## 2. Estado actual — leer antes de actuar

- El proyecto está en **fase de planificación**.
- **El stack, la estructura base y el workspace están definidos**, pero **no existe código de aplicación ni dependencias instaladas.**
- El repositorio contiene documentación, la estructura de carpetas y la configuración del monorepo (`package.json`, `pnpm-workspace.yaml`, `turbo.json`).
- Los scripts raíz ya existen, pero delegan en paquetes que todavía no se han creado.

En consecuencia:

- ❌ No inventes versiones, dependencias, comandos, rutas ni credenciales.
- ❌ No presentes funcionalidades planificadas como si estuvieran disponibles.
- ❌ No cambies el stack definido en §5 sin aprobación explícita.
- ❌ No ejecutes scaffolding, instalaciones ni inicializaciones de proyecto sin autorización explícita.
- ✅ Si una tarea requiere una decisión técnica no tomada, **detente y pregunta** antes de escribir código.

---

## 3. Fuente de verdad

| Documento | Propósito |
| --- | --- |
| `README.md` | Alcance, módulos, estado y guía para personas |
| `AGENTS.md` | Reglas de trabajo para agentes |
| `docs/` *(a crear)* | Documentación técnica y decisiones |

Si el README y el código llegaran a contradecirse, **detente y reporta la inconsistencia**; no elijas una versión por tu cuenta.

---

## 4. Reglas de oro

1. **No inventar.** Sin versiones, dependencias, comandos ni estructura que no estén confirmados en el repositorio.
2. **No adelantar implementación.** Planificación ≠ código. No crear archivos de aplicación sin pedido explícito.
3. **Una decisión, un registro.** Toda elección técnica relevante debe quedar documentada (ver §5).
4. **Cambios mínimos y enfocados.** No refactorizar ni reorganizar lo que no forma parte de la tarea.
5. **No secretos en el repositorio.** Nunca credenciales, tokens, cadenas de conexión ni `.env` reales.
6. **Documentación sincronizada.** Si cambia el alcance, el estado o los comandos, actualiza `README.md` y este archivo.
7. **Preguntar antes de asumir.** Ante ambigüedad de alcance o de tecnología, pregunta; no improvises.

---

## 5. Stack y decisiones técnicas

### Definido

| Área | Decisión |
| --- | --- |
| Lenguaje | TypeScript |
| Organización | Monorepo |
| Gestor de paquetes | pnpm |
| Orquestador del monorepo | Turborepo |
| Aplicación web | React |
| Aplicación móvil | React Native |
| Backend | NestJS |
| Base de datos | PostgreSQL |
| ORM | Prisma |
| Documentos e imágenes | AWS S3 |
| Autenticación y autorización | Auth.js |
| Arquitectura | MVC |
| Despliegue | Docker |

### Pendiente de definición

Versiones de Node.js, pnpm, Turborepo, PostgreSQL y Prisma · pruebas y CI/CD · infraestructura de despliegue · flujo de sesiones y roles con Auth.js (incluido el cliente móvil) · contratos de API.

### Reglas de arquitectura

- **MVC:** el modelo (entidades y reglas de negocio) y la persistencia viven en el backend; las vistas son las aplicaciones React y React Native; los controladores exponen la API desde NestJS.
- La lógica de negocio **no** vive en las vistas ni en los controladores de transporte.
- **Prisma** es el ORM y el único punto de acceso a PostgreSQL; el esquema y las migraciones se versionan en el repositorio.
- Los clientes **no** acceden directamente a la base de datos ni a S3; todo pasa por el backend.
- Los binarios (documentos e imágenes) se almacenan en **S3**; sus metadatos, en **PostgreSQL**.
- **Auth.js** es el único mecanismo de autenticación y autorización; no implementar soluciones paralelas.
- **Docker** es el mecanismo de despliegue; los Dockerfiles se crearán al configurar el proyecto, no antes.

**Regla:** antes de agregar una tecnología o dependencia:

1. Confirma que la decisión está aprobada por el responsable del proyecto.
2. Registra la decisión en `docs/decisions/` (formato ADR: contexto, decisión, alternativas, consecuencias).
3. Actualiza las tablas de `README.md` (§ Tecnologías previstas) y de este archivo.
4. Solo entonces crea la configuración o el código correspondiente.

No agregues una dependencia “porque hace falta” sin pasar por este flujo.

---

## 6. Estructura del repositorio

La estructura inicial ya existe; consulta el árbol completo en [`docs/architecture/estructura.md`](docs/architecture/estructura.md). El backend es un **monolito modularizado**.

```text
.
├── apps/
│   ├── backend/
│   │   ├── prisma/migrations/
│   │   └── src/
│   │       ├── common/
│   │       ├── config/
│   │       ├── database/
│   │       └── modules/<dominio>/{controllers,services,dtos,models}
│   ├── web/src/
│   └── mobile/src/
├── packages/{types,validation,utils}/
├── docker/
├── docs/{architecture,api,decisions}/
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── README.md
└── AGENTS.md
```

- Cada módulo del backend sigue el patrón `controllers/ · services/ · dtos/ · models/`.
- Un módulo no importa archivos internos de otro ni accede a su persistencia.
- `apps/*` puede importar `packages/*`; lo contrario no.
- Código compartido entre entregables vive en `packages/`, no se duplica.
- Los `.gitkeep` solo preservan carpetas vacías; no son contenido del proyecto.
- La configuración de contenedores vive en `docker/`; los Dockerfiles se añadirán al implementar.

---

## 7. Comandos

El workspace está configurado con **pnpm + Turborepo**. Las dependencias aún no se han instalado y no hay aplicaciones.

Desde la raíz:

| Comando | Uso |
| --- | --- |
| `pnpm install` | Instala las dependencias del workspace |
| `pnpm dev` | Ejecuta `dev` en los paquetes (proceso persistente) |
| `pnpm build` | Compila respetando el orden de dependencias |
| `pnpm lint` | Ejecuta el análisis estático |
| `pnpm test` | Ejecuta las pruebas |
| `pnpm typecheck` | Verifica los tipos |
| `pnpm turbo run <tarea> --filter=<paquete>` | Ejecuta una tarea en un paquete concreto |

Reglas:

- Usa **pnpm** exclusivamente; no npm ni yarn.
- No ejecutes `pnpm install` ni agregues dependencias sin autorización.
- Los comandos deben existir en `package.json`; no inventes *scripts*.
- No ejecutes comandos destructivos (`rm -rf`, resets, limpiezas de historial) sin confirmación.

---

## 8. Convenciones de código (propuestas, sujetas a aprobación)

- **TypeScript estricto**; evitar `any` sin justificación.
- Un módulo de dominio por carpeta, con nombres en `kebab-case` y tipos en `PascalCase`.
- Validar datos en los límites del sistema (API, formularios, integraciones).
- Errores explícitos y mensajes en español para el usuario final.
- Sin lógica de negocio en componentes de UI ni en controladores de transporte.
- Commits en **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`…), en español o inglés, pero consistente.
- Formateo y linting: herramienta **por definir**; no imponer una sin aprobación.

### Monorepo (pnpm + Turborepo)

- Usa **pnpm** para instalar y ejecutar; no npm ni yarn.
- Cada `app` y `package` declara su propio `package.json` y sus scripts.
- Los scripts de la raíz solo delegan en `turbo run`; no dupliques lógica en ellos.
- Las dependencias internas se referencian con `workspace:*`.
- Ejecuta tareas desde la raíz con `pnpm <tarea>` o `pnpm turbo run <tarea> --filter=<paquete>`.
- No agregues dependencias globales si pueden vivir en el paquete que las usa.

### Backend (NestJS)

- Organizar por módulos de dominio; cada módulo con su controlador, servicio y modelos.
- Controladores delgados: reciben la petición, validan el DTO y delegan en el servicio.
- La lógica de negocio y las reglas de estado de las tareas viven en servicios.
- Los contratos de entrada/salida se validan con DTOs; no exponer entidades de persistencia directamente.
- El acceso a PostgreSQL se realiza exclusivamente mediante **Prisma**; evitar SQL crudo salvo justificación y revisión.
- El esquema de Prisma y sus migraciones viven en el repositorio; no modificarlos ni regenerar el cliente sin necesidad.
- El acceso a PostgreSQL y a S3 se encapsula en el backend; los clientes nunca reciben credenciales.

### Frontend (React y React Native)

- Componentes funcionales y *hooks*; evitar lógica de negocio en la UI.
- Separar la capa de acceso a la API de los componentes de presentación.
- Reutilizar tipos y validaciones desde `packages/` en lugar de duplicarlos.
- Los estados de carga, error y vacío deben ser explícitos en las vistas.

### Autenticación y despliegue

- La autenticación y autorización se implementan con **Auth.js**; no crear mecanismos alternativos.
- El despliegue se realiza con **Docker**; no introducir otras plataformas de despliegue sin aprobación.
- Las variables sensibles (PostgreSQL, S3, Auth.js, servicios externos) se leen del entorno, nunca del código.

---

## 9. Dominio y reglas de negocio

### Glosario

| Término | Significado |
| --- | --- |
| Semillero | Grupo de investigación al que pertenecen integrantes y tutores |
| Integrante | Estudiante vinculado a un semillero |
| Tutor | Docente que orienta un semillero |
| Facultad | Unidad académica que agrupa semilleros |
| Decano | Autoridad con visión agregada de su facultad |

### Reglas que no deben romperse

- El seguimiento debe poder filtrarse por **semillero, integrante, tutor, facultad y decano**.
- En tareas se distinguen **progreso** (avance) y **resultado** (desenlace). No son lo mismo.
- Estados de tarea permitidos: `pendiente`, `en progreso`, `finalizado`, `cancelado`, `éxito`, `fracaso`.
- Un resultado (`éxito`/`fracaso`) no reemplaza al estado de progreso.
- Recordatorios y notificaciones pertenecen a un usuario/contexto; no son globales.
- Los permisos por rol (integrante, tutor, decano, administrador) están **pendientes de definición**: no los inventes.

---

## 10. Flujo de trabajo para agentes

1. **Leer** `README.md` y este archivo completos antes de tocar nada.
2. **Verificar** el estado real del repositorio (`git status`, árbol de archivos).
3. **Clasificar** la tarea: documentación, decisión técnica o implementación.
4. **Detenerse** ante decisiones no tomadas → preguntar.
5. **Planificar** el cambio mínimo y anunciarlo si afecta varios archivos.
6. **Implementar** respetando la estructura aprobada.
7. **Verificar**: que los enlaces y tablas sigan siendo válidos; que no se hayan introducido datos ficticios.
8. **Documentar**: actualizar README/AGENTS/ADR cuando corresponda.
9. **Reportar** qué se cambió, qué quedó pendiente y qué supuestos se usaron.

### Al escribir documentación

- Español claro, sin promesas de funcionalidad no confirmadas.
- Distinguir siempre **definido**, **propuesto** y **pendiente**.
- Nada de URLs, capturas o credenciales de ejemplo que parezcan reales.
- Enlaces internos funcionales; encabezados jerárquicos y tablas cuando aporten claridad.

---

## 11. Seguridad y privacidad

- No versionar `.env`, credenciales ni datos personales de estudiantes.
- Las integraciones (WhatsApp, correo, Teams, IA) requieren claves: deben ir en variables de entorno, nunca en el código.
- Las credenciales de AWS S3 y de la base de datos se gestionan por entorno; el backend es el único que accede a S3.
- Al proponer variables de entorno, usa nombres genéricos y documenta su propósito; no inventes valores.
- Datos académicos y de personas: tratar como información sensible; no incluir datos reales en ejemplos, pruebas ni capturas.

---

## 12. Pruebas y calidad (pendiente)

- No hay framework de pruebas definido.
- Cuando se defina: pruebas para reglas de negocio (estados de tarea, seguimiento, permisos) y para los límites de la API.
- Priorizar pruebas de servicios en NestJS y de los flujos críticos en React/React Native.
- No declares una tarea “terminada” sin evidencia de verificación (prueba, revisión manual documentada o validación del enlace).
- Si no puedes verificar algo, dilo explícitamente.

---

## 13. Criterios de finalización

Una tarea está terminada cuando:

- [ ] Cumple exactamente lo pedido, sin alcance extra.
- [ ] No introduce tecnologías, rutas ni datos no aprobados.
- [ ] La documentación afectada quedó actualizada.
- [ ] Los enlaces, tablas y diagramas siguen siendo válidos.
- [ ] Se indicó qué falta definir o verificar.

---

## 14. Cuándo preguntar (y no avanzar)

- Versiones de Node.js, pnpm, Turborepo, PostgreSQL y Prisma.
- Detalles del flujo de autenticación y del modelo de permisos con Auth.js.
- Cambios en la estructura acordada, instalación de dependencias o scaffolding de React, React Native o NestJS.
- Creación o modificación del esquema/migraciones de Prisma, Dockerfiles, configuración de S3 o infraestructura de despliegue.
- Reglas de permisos por rol.
- Modelo de datos y contratos de API.
- Cualquier cambio que elimine o reescriba trabajo existente.
- Cualquier instrucción que contradiga el alcance descrito en `README.md`.

---

## 15. Mantenimiento de este archivo

Actualiza `AGENTS.md` cuando:

- Se apruebe una tecnología, se fije una versión o cambie la estructura del workspace.
- Existan comandos reales de instalación, ejecución o prueba.
- Cambien las convenciones de código o el flujo de trabajo.
- Se definan reglas de negocio o permisos nuevos.

Mantén este documento breve y accionable: es una guía operativa, no una especificación de requisitos.
