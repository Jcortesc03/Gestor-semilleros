# ADR 0019 — Linting y formato

- **Estado:** propuesto (pendiente de aprobación; no autoriza instalar dependencias ni crear configuración).
- **Fecha:** 2026-11-20.
- **Relacionado:** [ADR 0002](0002-autenticacion-y-pruebas.md) (TypeScript y pruebas), [ADR 0008](0008-aplicacion-web-y-sistema-visual.md) (aplicación web).

## Contexto

El monorepo usa pnpm 12.18.0 y Turborepo, con `apps/backend` (NestJS 12.3.3, CommonJS, `module: nodenext`, decoradores y Prisma 7.10.1) y `apps/web` (React 19.3.1, Vite 8.3.6, Tailwind 4, ESM, `moduleResolution: Bundler` y `verbatimModuleSyntax`), ambos en TypeScript 6.0.3 con `strict: true`. `apps/mobile` y `packages/*` están vacíos.

Hoy no hay linter ni formateador: no existen ESLint, Prettier, EditorConfig, husky ni lint-staged, y no hay pipeline de CI. La raíz define `"lint": "turbo run lint"` y `turbo.json` declara la tarea `lint: {}`, pero **ningún paquete implementa el script**, por lo que el comando no comprueba nada. El estilo actual es consistente por convención (comillas simples, punto y coma, comas finales), sin una herramienta que lo haga cumplir.

Un lint de prueba sobre una copia del repo (390 archivos, ~30 s en modo con tipos) dio 93 errores con `recommended` sin tipos, y 1 115 errores y 2 advertencias con `recommendedTypeChecked` y el cliente de Prisma generado (38 autocorregibles; 234 en `src` — 152 backend y 82 web — y 883 en pruebas). Sin el cliente generado aparecen unos 2 400 falsos positivos. Prettier con `singleQuote` y `printWidth` 100 cambiaría **294 archivos** (~10 000 líneas de diff).

## Decisión (propuesta, pendiente de aprobación)

1. **ESLint 10 con flat config por aplicación**, no una configuración global: `apps/backend/eslint.config.mjs` (el paquete es CommonJS, así que se usa `.mjs`) y `apps/web/eslint.config.js` (el paquete es ESM). No se usa `eslint.config.ts`, porque exigiría `jiti` como dependencia adicional. ESLint 10 busca la configuración desde el directorio de cada archivo, lo que encaja con Turborepo. Cuando exista móvil se podrá extraer un paquete compartido `packages/eslint-config` con `workspace:*`.

2. **Reglas base:** `@eslint/js` `recommended` más `typescript-eslint` `recommendedTypeChecked`. `strictTypeChecked` y las reglas `stylistic` quedan para una fase posterior. Solo en web se añaden `eslint-plugin-react-hooks` (preset `recommended-latest`; verificar la clave exacta del preset en la versión fijada antes de implementar) y `eslint-plugin-react-refresh` (configuración de Vite/HMR). `eslint-config-prettier` se coloca al final para desactivar las reglas de estilo que entren en conflicto. **No se usa `eslint-plugin-react`** (ver alternativas).

3. **Ajustes previstos:** `require-await` como advertencia en el backend (métodos `async` de interfaces de Nest sin `await`), reglas `no-unsafe-*` relajadas en pruebas, `no-misused-promises` con `checksVoidReturn.attributes: false` para manejadores `async` en JSX, y las reglas del React Compiler (`set-state-in-effect`, `refs`, `immutability`) como advertencias. Se valora añadir `no-restricted-imports` para las fronteras entre módulos; el patrón exacto se acuerda con el equipo antes de fijarlo.

4. **Prettier por separado**, sin `eslint-plugin-prettier`: configuración en la raíz (`singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`), `.prettierignore` (`dist`, `coverage`, `src/generated`, `pnpm-lock.yaml`, `apps/backend/prisma/migrations`) y `.editorconfig` (UTF-8, LF, 2 espacios, salto de línea final). Scripts raíz `format` (`prettier --write .`) y `format:check` (`prettier --check .`).

5. **Scripts:** en backend y web, `lint` (`eslint .`) y `lint:fix` (`eslint . --fix`); en la raíz, `lint` ya existe como `turbo run lint` y se añade `lint:fix` como `turbo run lint:fix`. En `turbo.json`, `lint:fix` con `cache: false` e `inputs` explícitos que incluyan `eslint.config.*` y `tsconfig*.json`, para no depender del comportamiento por defecto de una versión `latest` de Turborepo.

6. **Cliente Prisma generado antes de lintar con tipos:** se propone `prelint: prisma generate` en el backend; cualquier pipeline deberá generarlo también antes de ejecutar el lint.

7. **Pre-commit con husky y lint-staged:** `prepare: husky` en la raíz y `.husky/pre-commit` con `pnpm exec lint-staged`, con configuraciones por paquete (raíz para `json`/`md`/`yaml`, backend para `*.ts`, web para `*.{ts,tsx}` y `*.css`) que aplican `eslint --fix` y `prettier --write`. El hook no ejecuta `tsc`; el typecheck queda fuera del pre-commit.

8. **Versiones exactas**, fijadas con `pnpm add -E` como hace el repo:

   | Paquete | Versión | Ámbito |
   | --- | --- | --- |
   | `eslint` | 10.15.0 | backend y web |
   | `@eslint/js` | 10.0.1 | backend y web |
   | `typescript-eslint` | 8.73.0 | backend y web |
   | `globals` | 17.14.0 | backend y web |
   | `eslint-config-prettier` | 10.1.8 | backend y web |
   | `eslint-plugin-react-hooks` | 7.1.1 | solo web |
   | `eslint-plugin-react-refresh` | 0.5.8 | solo web |
   | `prettier` | 3.10.1 | raíz |
   | `husky` | 9.1.7 | raíz |
   | `lint-staged` | 17.6.1 | raíz |

## Alternativas consideradas

- **Un único ESLint en la raíz:** descartado; los dos apps tienen módulos y `tsconfig` distintos (CJS/Nest frente a ESM/Vite) y Turborepo ejecuta las tareas por paquete.
- **`eslint-plugin-react` 7.37.5:** descartado; su peer exige como máximo `eslint ^9.7`, incompatible con ESLint 10. Con React 19, `jsx: react-jsx` y TypeScript, apenas aporta reglas que no cubran ya `react-hooks` y `react-refresh`.
- **`eslint-plugin-prettier`:** descartado; ejecuta Prettier como regla de ESLint, ralentiza el lint y mezcla responsabilidades. Se prefiere Prettier por separado con `eslint-config-prettier`.
- **Solo `recommended` sin información de tipos:** más rápido y con menos ruido inicial (93 errores), pero deja fuera las reglas que detectan promesas mal manejadas, que son las de mayor valor; se descarta como configuración final, aunque sirve como referencia para la adopción.
- **`strictTypeChecked`, reglas `stylistic` y `eslint-plugin-import-x` 4.18.1:** pospuestos. TypeScript ya valida la resolución con `nodenext`/`Bundler`; `import-x/no-cycle` ralentiza bastante el lint. Las fronteras entre módulos se cubren con `no-restricted-imports`.
- **Dejar las reglas ruidosas como `warn` con `--max-warnings` decreciente:** alternativa válida a las supresiones masivas; se descarta como mecanismo principal porque requiere mantener un número global de advertencias, pero queda disponible si las supresiones resultan difíciles de podar.

## Consecuencias

- Habrá que añadir las dependencias, los archivos de configuración y los scripts descritos, y actualizar `AGENTS.md`, `README.md` y los README de cada app cuando la decisión se apruebe y se implemente.
- `pnpm lint` pasa de no comprobar nada a ejecutar ESLint en backend y web; `format:check` introduce una comprobación nueva.
- El reformateo inicial de 294 archivos debe hacerse en un único commit de solo formato, con su hash en `.git-blame-ignore-revs`, y coordinarse para no coincidir con ramas largas abiertas.
- La adopción requiere varios PR: el primero congela el estado actual y los siguientes reducen la lista de supresiones.
- **La CI/CD no se decide aquí:** sigue pendiente y requiere su propio ADR; este documento no fija su pipeline. Solo advierte que cualquier pipeline futuro deberá generar el cliente Prisma antes de ejecutar el lint con tipos.

## Riesgos

- **Prisma:** sin `prisma generate`, el lint con tipos produce unos 2 400 falsos positivos y errores de parseo; hay que garantizarlo en local, en los hooks y en cualquier pipeline futuro.
- **Compatibilidad:** `typescript-eslint` 8.73.0 admite TypeScript `>=4.8.4 <6.1.0`. TS 6.0.3 es compatible, pero una subida a TS 6.1 quedaría bloqueada hasta actualizar `typescript-eslint`.
- **Reformateo masivo:** 294 archivos implican conflictos con trabajo en curso y pérdida de `git blame` si no se versiona `.git-blame-ignore-revs`.
- **React Compiler:** las reglas `set-state-in-effect`, `refs` e `immutability` pueden exigir refactors con impacto funcional; por eso empiezan como advertencias y se revisan una a una.
- **Husky en Docker:** `prepare` se ejecuta también durante `pnpm install` en imágenes, donde no hay `.git`; hay que comprobarlo y, si falla, usar `husky || true` o instalar con `--ignore-scripts` en los Dockerfile.
- **Rendimiento:** el modo con tipos tarda ~30 s en el total del repo. Activar `import-x` lo empeoraría.
- **Turborepo `latest`:** el comportamiento de la caché de `lint` puede variar; mitigan el riesgo los `inputs` explícitos y `lint:fix` sin caché.
- **Backend CommonJS:** un `eslint.config.js` se interpretaría como CJS; por eso se usa `.mjs`.

## Estrategia de adopción gradual

1. **PR 1, infraestructura:** ADR, dependencias, configuraciones y scripts. Para que el lint esté en verde desde el inicio, se generan supresiones masivas con `eslint . --suppress-all` (`eslint-suppressions.json`, versionado): el código nuevo cumple las reglas y lo existente queda congelado. `eslint --prune-suppressions` reduce la lista a medida que se corrige.
2. **PR 2, correcciones rápidas:** `eslint --fix` (38 autocorregibles) y los 32 `no-unused-vars`.
3. **PR 3, reglas de promesas:** `no-floating-promises` y `no-misused-promises`, las que más bugs reales detectan.
4. **PR 4, reglas del React Compiler:** revisar una a una `set-state-in-effect`, `refs` e `immutability`, por su posible impacto en el comportamiento.
5. **Prettier:** un único commit de solo formato, coordinado cuando no haya ramas largas abiertas, con su hash en `.git-blame-ignore-revs`. Aplicarlo solo a archivos tocados vía lint-staged mientras tanto es posible, pero mezcla formato y lógica en cada PR.
6. **Después:** valorar `strictTypeChecked`, las reglas `stylistic` y `import-x`, y extraer una configuración compartida cuando aparezca `apps/mobile`.

Este ADR queda **propuesto** hasta que el dueño lo apruebe; mientras tanto no se instalan dependencias, no se crean configuraciones de ESLint/Prettier ni se activa `pnpm lint` como comprobación.
