# skill/ — Agentes y skills de diseño y desarrollo

Carpeta de trabajo de los agentes y skills utilizadas para construir el **Gestor de Semilleros Universitarios**.
**No forma parte del producto final** ni del stack definido en `AGENTS.md`; aquí viven las herramientas de diseño, los agentes especializados y los prototipos visuales de referencia.

> Todo lo aquí contenido es material de herramienta y prototipado. No representa el avance del producto ni se despliega como parte de la aplicación.

## Estructura

```text
skill/
├── README.md                    # este archivo
├── install.sh                   # activa el enlace local del agente frontlipe en OpenCode
├── skills-lock.json             # versiones reproducibles de las skills instaladas
├── front/                       ← todo lo de diseño y frontend (UI/UX)
│   ├── agentes/
│   │   └── frontlipe/           # agente Frontlipe (arquitecto frontend / UI-UX)
│   │       └── frontlipe.md
│   ├── habilidades/             # copias de referencia de skills de diseño instaladas
│   │   ├── design-taste-frontend/   # tasteskill 2.5.0 (sistema de diseño editorial)
│   │   │   └── SKILL.md
│   │   └── find-skills/             # descubridor e instalador de skills
│   │       └── SKILL.md
│   └── experimentos/            # prototipos visuales aislados (no son el producto)
│       ├── taste-skill-test/        # prueba de design-taste-frontend (contenido ficticio)
│       └── landing-semilleros/      # prueba visual adicional de landing
├── backend/                     # futuro: skills de backend (NestJS, etc.)
├── mobile/                      # futuro: skills de móvil (React Native)
└── utilidades/                  # scripts y herramientas transversales
```

## Reglas

- No implementar la aplicación sin una decisión explícita de stack, arquitectura y alcance. Mantener `README.md` y `AGENTS.md` como descripción del proyecto real.
- Las pruebas de skills, prototipos y experimentos viven en `skill/front/experimentos/` y no forman parte del producto.
- Las skills instaladas en `.agents/skills/` son locales de OpenCode y no se versionan. Las copias en `skill/front/habilidades/` son solo referencia local.
- No mezclar contenido ficticio de experimentos con la documentación del proyecto.

## Activación del agente frontlipe

Desde la raíz del repositorio:

```bash
bash skill/install.sh
```

El script crea el enlace local `.opencode/agents/frontlipe.md -> front/agentes/frontlipe/frontlipe.md` para que OpenCode cargue al agente Frontlipe.

## Ver un prototipo

```bash
python3 -m http.server 8000 -d skill/front/experimentos/taste-skill-test
```

Abrir <http://localhost:8000>.
