#!/usr/bin/env bash
# Enciende los enlaces locales del agente frontlipe y de sus skills para OpenCode.
# Las carpetas .opencode/ y .agents/ son locales: nunca se versionan.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/.opencode/agents" "$ROOT/.agents/skills"
ln -sfn "$ROOT/skill/front/agentes/frontlipe/frontlipe.md" "$ROOT/.opencode/agents/frontlipe.md"
for skill in design-taste-frontend find-skills; do
  ln -sfn "$ROOT/skill/front/habilidades/$skill" "$ROOT/.agents/skills/$skill"
done

echo "Enlaces creados: .opencode/agents/frontlipe.md y .agents/skills/{design-taste-frontend,find-skills}"
echo "Reinicia OpenCode (o pulsa Tab) para usar el agente frontlipe."
