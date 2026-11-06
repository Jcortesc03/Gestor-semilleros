# skill/ — Agente y skills de frontend

Carpeta de trabajo personal del agente de frontend (`frontlipe`) y de las skills de diseño. **No forma parte del producto** ni del stack definido en `AGENTS.md`.

> Todo lo aquí contenido es material de prueba y de herramienta local. No representa el *Gestor de Semilleros Universitarios* ni su avance.

## Estructura

```text
skill/
├── README.md                    # este archivo
├── install.sh                   # enciende el enlace local del agente
├── skills-lock.json             # versiones reproducibles de las skills
├── frontlipe/
│   └── frontlipe.md             # agente principal de frontend/UI-UX
└── experiments/                 # prototipos visuales aislados
    ├── taste-skill-test/        # prueba de design-taste-frontend (contenido ficticio: SaaS de viveros)
    └── landing-semilleros/      # prueba visual adicional
```

## Activación local

Desde la raíz del repositorio:

```bash
bash skill/install.sh
```

El script crea el enlace local `.opencode/agents/frontlipe.md -> ../../skill/frontlipe/frontlipe.md` para que OpenCode lo cargue (se alterna con `Tab`). Las carpetas `.opencode/`, `.agents/` y `.taste-skill/` son **locales y no se versionan**.

Las skills instaladas (`design-taste-frontend`, `find-skills`) se reproducen desde `skill/skills-lock.json`.

## Reglas (traídas del antiguo `AGENTS.md` de esta rama)

- No implementar la aplicación sin una decisión explícita de stack, arquitectura y alcance. Mantener `README.md` como descripción del proyecto real.
- Las pruebas de skills, prototipos y experimentos viven en `skill/experiments/` y no forman parte del producto.
- No versionar `.agents/` (skills instaladas localmente). `skill/skills-lock.json` sí se conserva para poder reproducirlas.
- No mezclar contenido ficticio de experimentos con la documentación del proyecto.

## Ver una prueba

```bash
python3 -m http.server 8000 -d skill/experiments/taste-skill-test
```

Abrir <http://localhost:8000>.
