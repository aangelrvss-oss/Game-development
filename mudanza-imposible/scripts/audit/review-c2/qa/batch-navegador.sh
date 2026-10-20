#!/usr/bin/env bash
# Revisión QA del ciclo 2: todas las pruebas de navegador, una detrás de otra (la máquina, libre).
# 5cab122 servido en :4193 y 657fd30 en :4196 (vite preview de cada build).
set -u
Q=/home/user/Game-development-rc2/mudanza-imposible/scripts/audit/review-c2/qa
C2=/home/user/Game-development-rc2/mudanza-imposible/scripts
BASE=/tmp/claude-0/review-c2/qa/base/mudanza-imposible/scripts
log=/tmp/claude-0/review-c2/qa/batch-navegador.txt
{
  echo "== inicio $(date -u +%H:%M:%S)"
  "$Q/run-e2e.sh" c2-duo-b "$C2/duo-e2e.cjs" http://localhost:4193/ 4
  "$Q/run-e2e.sh" c2-teclado "$C2/keyboard-e2e.cjs" http://localhost:4193/ 3
  "$Q/run-e2e.sh" c2-dos "$Q/two-players-e2e-url.cjs" http://localhost:4193/ 1
  "$Q/run-e2e.sh" c2-smoke "$C2/smoke.cjs" 'http://localhost:4193/?auto=1&carriers=4' 1 shots 240
  "$Q/run-e2e.sh" base-duo "$BASE/duo-e2e.cjs" http://localhost:4196/ 3
  echo "== fin $(date -u +%H:%M:%S)"
} 2>&1 | tee "$log"
