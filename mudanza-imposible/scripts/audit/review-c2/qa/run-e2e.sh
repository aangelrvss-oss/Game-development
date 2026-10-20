#!/usr/bin/env bash
# Revisión QA del ciclo 2: ejecuta un e2e N veces seguidas (nunca en paralelo) y guarda cada salida.
# Uso: run-e2e.sh <etiqueta> <script.cjs absoluto> <url> <n> [args extra...]
# Cada ejecución corre en su propia carpeta de /tmp/claude-0/review-c2/qa/runs/<etiqueta>-<i>/ para que las capturas
# (`shots/…`, rutas relativas de los e2e) no caigan en el worktree.
set -u
label=$1; script=$2; url=$3; n=$4; shift 4
export NODE_PATH=$(npm root -g)
root=/tmp/claude-0/review-c2/qa/runs
mkdir -p "$root"
for i in $(seq 1 "$n"); do
  d="$root/$label-$i"; rm -rf "$d"; mkdir -p "$d/shots"
  start=$(date +%s)
  ( cd "$d" && timeout 900 node "$script" "$url" "$@" ) > "$d/out.log" 2>&1
  code=$?
  end=$(date +%s)
  ok=$(grep -cE '^OK' "$d/out.log"); fail=$(grep -cE '^FALLA' "$d/out.log")
  echo "$label #$i exit=$code OK=$ok FALLA=$fail dur=$((end-start))s load=$(cut -d' ' -f1 /proc/loadavg)"
  grep -E '^FALLA' "$d/out.log" | sed 's/^/    /'
done
