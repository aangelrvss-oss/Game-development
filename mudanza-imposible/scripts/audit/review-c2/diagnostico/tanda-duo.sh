#!/usr/bin/env bash
# Diagnóstico ciclo 2: duo-instr.cjs intercalado entre versiones (una ejecución detrás de otra, nunca en paralelo).
# Uso: tanda-duo.sh <n> <etiqueta:puerto> [<etiqueta:puerto> ...]
set -u
D=$(dirname "$(readlink -f "$0")")
n=$1; shift
echo "== inicio $(date -u +%H:%M:%S)"
for i in $(seq 1 "$n"); do
  for lp in "$@"; do
    l=${lp%%:*}; port=${lp##*:}
    "$D/correr.sh" "$l-$i" "$D/duo-instr.cjs" "http://localhost:$port/"
  done
done
echo "== fin $(date -u +%H:%M:%S)"
