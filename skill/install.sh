#!/usr/bin/env bash
# Enciende el enlace local del agente frontlipe para OpenCode.
# Las carpetas .opencode/ y .agents/ son locales: nunca se versionan.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/.opencode/agents"
ln -sfn "$ROOT/front/agentes/frontlipe/frontlipe.md" "$ROOT/.opencode/agents/frontlipe.md"

echo "Enlace creado: .opencode/agents/frontlipe.md -> front/agentes/frontlipe/frontlipe.md"
echo "Reinicia OpenCode (o pulsa Tab) para usar el agente frontlipe."
