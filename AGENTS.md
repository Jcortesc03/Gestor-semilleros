# AGENTS.md

## Proyecto

**Gestor de Semilleros Universitarios**: plataforma para la gestión académica, administrativa y organizativa de semilleros de investigación. El proyecto está en fase de planificación; el stack y la arquitectura todavía no están definidos.

## Normas de trabajo

- No implementar la aplicación sin una decisión explícita de stack, arquitectura y alcance.
- Mantener `README.md` como descripción del proyecto real.
- Las pruebas de skills, prototipos y experimentos viven en `experiments/` y no forman parte del producto.
- No versionar `.agents/` (skills instaladas localmente). `skills-lock.json` sí se conserva para poder reproducirlas.
- No mezclar contenido ficticio de experimentos con la documentación del proyecto.

## Estructura

- `.agents/skills/`: skills instaladas en el proyecto: `design-taste-frontend` y `find-skills`.
- `.opencode/agents/frontlipe.md`: agente principal de frontend/UI-UX. Se alterna con `Tab`.
- `experiments/taste-skill-test/`: prueba visual de la skill `design-taste-frontend`. El contenido es ficticio (un SaaS de viveros) y no representa el proyecto universitario.
