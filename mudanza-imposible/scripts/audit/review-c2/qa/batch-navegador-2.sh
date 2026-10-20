#!/usr/bin/env bash
# Revisión QA del ciclo 2, segunda tanda de navegador (una prueba detrás de otra):
# - keyboard-e2e ×3 sobre 657fd30 (:4196), para comparar con las 3 de 5cab122;
# - demo automática del patio de pruebas (?nivel=pruebas&auto=1) en 5cab122, con smoke.cjs;
# - duo-e2e intercalado base/c2 ×3 cada uno (mismas condiciones de máquina para los dos).
set -u
Q=/home/user/Game-development-rc2/mudanza-imposible/scripts/audit/review-c2/qa
C2=/home/user/Game-development-rc2/mudanza-imposible/scripts
BASE=/tmp/claude-0/review-c2/qa/base/mudanza-imposible/scripts
log=/tmp/claude-0/review-c2/qa/batch-navegador-2.txt
{
  echo "== inicio $(date -u +%H:%M:%S)"
  "$Q/run-e2e.sh" base-teclado "$BASE/keyboard-e2e.cjs" http://localhost:4196/ 3
  "$Q/run-e2e.sh" c2-smoke-patio "$C2/smoke.cjs" 'http://localhost:4193/?nivel=pruebas&auto=1&carriers=4' 1 shots 420
  for i in 1 2 3; do
    "$Q/run-e2e.sh" "base-duo-x$i" "$BASE/duo-e2e.cjs" http://localhost:4196/ 1
    "$Q/run-e2e.sh" "c2-duo-x$i" "$C2/duo-e2e.cjs" http://localhost:4193/ 1
  done
  echo "== fin $(date -u +%H:%M:%S)"
} 2>&1 | tee "$log"
