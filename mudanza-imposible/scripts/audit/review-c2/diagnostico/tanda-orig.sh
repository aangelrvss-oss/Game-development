#!/usr/bin/env bash
# Diagnóstico ciclo 2: duo-e2e original (partes A1–A5, grabador pasivo) intercalado entre versiones, nunca en paralelo.
# Uso: tanda-orig.sh <desde> <hasta> <etiqueta:puerto:árbol> ...
set -u
D=$(dirname "$(readlink -f "$0")")
a=$1; b=$2; shift 2
echo "== inicio $(date -u +%H:%M:%S)"
for i in $(seq "$a" "$b"); do
  for x in "$@"; do IFS=: read -r l port tree <<< "$x"; "$D/correr-parteA.sh" "$l-$i" "$tree/mudanza-imposible/scripts/duo-e2e.cjs" "http://localhost:$port/"; done
done
echo "== fin $(date -u +%H:%M:%S)"
