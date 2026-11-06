# AGENTS.md

Guía operativa para agentes de IA que trabajen en el **Gestor de Semilleros Universitarios**. Define cómo trabajar y qué restricciones respetar; el alcance funcional está en [`README.md`](README.md) y los detalles técnicos en [`docs/`](docs/).

## 1. Propósito y contexto

Plataforma para centralizar la gestión académica, administrativa y organizativa de los semilleros de investigación de una universidad.

Monorepo TypeScript con tres entregables:

- `apps/web` — aplicación web (React).
- `apps/mobile` — aplicación móvil (React Native).
- `apps/backend` — API y lógica de negocio (NestJS).

El alcance, los módulos y el estado se documentan en `README.md`; no los repitas aquí.

## 2. Estado actual del proyecto

- **Fase de planificación:** no existe código de aplicación.
- **Definido:** stack, estructura base del monorepo, workspace (pnpm + Turborepo) y scripts raíz.
- **No instalado:** dependencias; no hay `pnpm-lock.yaml`.
- **No implementado:** base de datos, API, autenticación, Docker, pruebas ni CI/CD.
- Los scripts raíz existen, pero aún no hay paquetes de aplicación que ejecutar.

Por lo tanto:

- No asumas dependencias, versiones, comandos ni configuraciones no confirmadas.
- No presentes funcionalidades planificadas como disponibles.
- No ejecutes scaffolding, instalaciones ni inicializaciones sin autorización explícita.
- Ante una decisión pendiente, detente y pregunta (§12).

## 3. Fuentes de verdad

| Documento | Propósito |
| --- | --- |
| `README.md` | Alcance funcional, estado y visión para personas |
| `AGENTS.md` | Reglas operativas para agentes |
| `docs/architecture/` | Arquitectura y estructura del monorepo |
| `docs/domain/` | Glosario, reglas de negocio y permisos |
| `docs/api/` | Contratos de API (pendiente) |
| `docs/decisions/` | Decisiones técnicas (ADR) |

Si dos fuentes se contradicen, **detente y reporta**; no elijas una por tu cuenta.

## 4. Stack y decisiones aprobadas

| Área | Decisión |
| --- | --- |
| Lenguaje | TypeScript |
| Organización | Monorepo |
| Gestor de paquetes | pnpm |
| Orquestador | Turborepo |
| Web | React |
| Móvil | React Native |
| Backend | NestJS |
| Base de datos | PostgreSQL |
| ORM | Prisma |
| Documentos e imágenes | AWS S3 |
| Autenticación y autorización | Auth.js |
| Contenedores | Docker |
| Arquitectura | MVC + monolito modular |

**Pendiente de definición:** versiones (Node.js, pnpm, Turborepo, PostgreSQL, Prisma), framework de pruebas, CI/CD, infraestructura de despliegue, contratos de API, flujo de sesiones de Auth.js (incluido móvil), modelo de datos/migraciones y permisos por rol.

No fijes versiones ni agregues herramientas para cubrir estos pendientes sin aprobación.

## 5. Reglas de oro

1. **No inventar:** ni versiones, ni dependencias, ni scripts, ni rutas, ni contratos, ni datos.
2. **No adelantar implementación:** la fase actual es de planificación.
3. **Cambios mínimos:** no refactorices fuera del alcance solicitado.
4. **Sin secretos:** nunca credenciales, tokens, `.env` reales ni datos personales.
5. **Preguntar antes de asumir:** ante ambigüedad técnica o funcional, detente.
6. **Registrar decisiones:** toda elección técnica relevante va a `docs/decisions/` y actualiza el stack.
7. **Documentación sincronizada:** si cambia el alcance, la estructura o los comandos, actualiza README/AGENTS/docs.

## 6. Arquitectura y estructura del monorepo

Backend como **monolito modularizado**: un solo despliegue, dividido en módulos por dominio.

```text
.
├── apps/
│   ├── backend/   # NestJS + Prisma, módulos por dominio
│   ├── web/       # React
│   └── mobile/    # React Native
├── packages/      # types, validation, utils
├── docs/          # arquitectura, dominio, API, ADRs
├── docker/        # configuración de contenedores
├── scripts/       # automatizaciones
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

Detalle completo: [`docs/architecture/estructura.md`](docs/architecture/estructura.md).

**Dependencias**

- `apps/*` puede importar `packages/*`; lo contrario no.
- Cada módulo del backend encapsula `controllers/`, `services/`, `dtos/` y `models/`.
- Un módulo no importa archivos internos de otro ni accede a su persistencia.
- El código compartido vive en `packages/`; evita duplicarlo entre web, móvil y backend.

**Reglas accionables**

- La lógica de negocio no vive en componentes de UI ni en controladores de transporte.
- **Prisma** es el único acceso a PostgreSQL.
- Web y móvil no acceden directamente a PostgreSQL ni a S3.
- Binarios en S3; metadatos en PostgreSQL.
- **Auth.js** es el único mecanismo de autenticación; no crear alternativas.
- No agregar tecnologías o dependencias sin aprobación.

## 7. Convenciones de implementación

### Generales

- TypeScript estricto; evitar `any` sin justificación.
- Documentación, interfaz y mensajes al usuario en español; identificadores en inglés (salvo términos del dominio acordados).
- Validar datos en los límites del sistema.
- Commits con **Conventional Commits**.
- Linting, formato y pruebas: herramientas **pendientes**; no imponerlas.

### Backend

- Un módulo por dominio, con controladores delgados y lógica en servicios.
- DTOs para contratos de entrada/salida; no exponer modelos de persistencia.
- Acceso a datos mediante `PrismaService` (`src/database/`).
- Esquema y migraciones de Prisma versionados; no modificarlos sin necesidad.

### Web y móvil

- Componentes funcionales y hooks cuando corresponda.
- Separar la UI de la capa de acceso a la API.
- Reutilizar tipos y validaciones de `packages/`.
- Estados de carga, error y vacío explícitos.

### Dependencias

- Usar **pnpm** exclusivamente; no npm ni yarn.
- Dependencias internas con `workspace:*`.
- Los scripts raíz delegan en Turborepo; no dupliques lógica.
- No agregar dependencias, plugins ni herramientas sin aprobación.

## 8. Comandos y ejecución

El workspace está configurado, pero **no hay aplicaciones ni dependencias instaladas**.

| Comando | Estado |
| --- | --- |
| `pnpm install` | Configurado; instalaría solo la dependencia raíz. **No ejecutado.** |
| `pnpm dev` | Configurado; delega en Turborepo. Sin paquetes que ejecutar. |
| `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm typecheck` | Configurados; delegan en Turborepo. Sin paquetes todavía. |
| `pnpm turbo run <tarea> --filter=<paquete>` | Previsto para cuando existan paquetes. |
| Scripts de cada aplicación | **Pendientes** de crear con cada app. |
| Docker, migraciones y despliegue | **Pendientes** de configuración. |

Reglas:

- No presentes comandos como funcionales si aún no producen resultados.
- No ejecutes instalaciones ni agregues dependencias sin autorización.
- No inventes scripts: deben existir en un `package.json`.
- No ejecutes comandos destructivos (`rm -rf`, resets, limpiezas de historial) sin confirmación.

## 9. Flujo de trabajo para agentes

1. Leer `AGENTS.md`, `README.md` y la documentación relevante.
2. Verificar el estado real (`git status`, árbol, archivos existentes).
3. Clasificar la tarea: documentación, decisión técnica o implementación.
4. Identificar decisiones pendientes (§4 y §12).
5. Detenerse y preguntar si corresponde.
6. Planificar el cambio mínimo y avisarlo si afecta varios archivos.
7. Implementar únicamente lo solicitado.
8. Verificar según las herramientas disponibles.
9. Actualizar la documentación o el ADR afectados.
10. Reportar cambios, pendientes y supuestos.

## 10. Seguridad y privacidad

- No versionar `.env`, credenciales, tokens ni cadenas de conexión.
- Configurar secretos por entorno; nunca en el código.
- No incluir datos personales o académicos reales en ejemplos, pruebas o capturas.
- El backend es el único que accede a PostgreSQL y S3; no exponer credenciales a los clientes.
- Claves de WhatsApp, correo, Microsoft Teams, IA y AWS solo en variables de entorno.
- Tratar la información de estudiantes y docentes como sensible.

## 11. Verificación y criterios de finalización

Una tarea está terminada cuando:

- [ ] Cumple exactamente lo solicitado, sin alcance extra.
- [ ] No introduce tecnologías, versiones ni decisiones no aprobadas.
- [ ] La documentación afectada está actualizada.
- [ ] Se verificó el resultado (comando, prueba, revisión o validación de enlaces).
- [ ] Se indicó qué falta definir, verificar o probar.

Si no puedes verificar algo, dilo explícitamente; no lo declares terminado.

## 12. Cuándo detenerse y preguntar

Detente antes de avanzar si la tarea requiere:

- Fijar versiones no definidas.
- Instalar dependencias o inicializar/scaffolding de aplicaciones.
- Cambiar la estructura acordada del monorepo.
- Definir el modelo de datos, migraciones o contratos de API.
- Resolver el flujo de autenticación o el modelo de permisos.
- Configurar Docker, S3 o infraestructura de despliegue.
- Elegir herramientas de pruebas, linting, formato o CI/CD.
- Ejecutar acciones destructivas o reescribir trabajo existente.
- Seguir instrucciones que contradigan el README, este archivo o `docs/`.

Si la decisión ya está aprobada y registrada, procede sin volver a preguntar.

## 13. Documentación relacionada

| Documento | Contenido |
| --- | --- |
| [`README.md`](README.md) | Alcance, módulos, estado y uso |
| [`docs/architecture/estructura.md`](docs/architecture/estructura.md) | Árbol y convenciones del monorepo |
| [`docs/domain/glossary.md`](docs/domain/glossary.md) | Glosario del dominio |
| [`docs/domain/business-rules.md`](docs/domain/business-rules.md) | Reglas de negocio |
| [`docs/domain/roles-permissions.md`](docs/domain/roles-permissions.md) | Roles y permisos (pendientes) |
| `docs/api/` | Contratos de API (pendientes) |
| `docs/decisions/` | ADRs |

Antes de modificar lógica de dominio, consulta `docs/domain/`. **No inventes reglas de negocio ni permisos** que sigan pendientes.

## 14. Mantenimiento de este archivo

Actualiza `AGENTS.md` cuando:

- Se apruebe una tecnología, se fije una versión o cambie la estructura.
- Existan comandos reales o cambien los existentes.
- Cambien las convenciones o el flujo de trabajo.
- Se definan reglas de negocio, permisos o contratos.

Mantén este documento operativo y compacto; mueve el detalle a `docs/`.
