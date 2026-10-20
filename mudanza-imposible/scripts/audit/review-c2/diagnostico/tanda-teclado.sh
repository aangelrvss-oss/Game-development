#!/usr/bin/env bash
# Diagnóstico ciclo 2: keyboard-e2e ORIGINAL (sin tocar) con el grabador pasivo, intercalado entre versiones.
# Uso: tanda-teclado.sh <desde> <hasta> <etiqueta:puerto:árbol> ...
set -u
D=$(dirname "$(readlink -f "$0")")
a=$1; b=$2; shift 2
export NODE_PATH=$(npm root -g)
echo "== inicio $(date -u +%H:%M:%S)"
for i in $(seq "$a" "$b"); do
  for x in "$@"; do
    IFS=: read -r l port tree <<< "$x"
    d=/tmp/claude-0/review-c2/diagnostico/runs-teclado/$l-$i; rm -rf "$d"; mkdir -p "$d/shots"; start=$(date +%s)
    ( cd "$d" && timeout 600 node -r "$D/grabador-pasivo.cjs" "$tree/mudanza-imposible/scripts/keyboard-e2e.cjs" "http://localhost:$port/" ) > "$d/out.log" 2>&1
    echo "$l-$i exit=$? OK=$(grep -cE '^OK' $d/out.log) FALLA=$(grep -cE '^FALLA' $d/out.log) dur=$(( $(date +%s)-start ))s"
    grep -E '^FALLA' "$d/out.log" | cut -c1-160 | sed 's/^/    /'
  done
done
echo "== fin $(date -u +%H:%M:%S)"
