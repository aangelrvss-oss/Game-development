#!/usr/bin/env bash
# Diagnóstico ciclo 2: corre un script de navegador en su carpeta de /tmp/claude-0/review-c2/diagnostico/runs/<etiqueta>
# (nunca dos a la vez). Uso: correr.sh <etiqueta> <script.cjs> <url> [args...]
set -u
label=$1; script=$2; url=$3; shift 3
export NODE_PATH=$(npm root -g)
d=/tmp/claude-0/review-c2/diagnostico/runs/$label; rm -rf "$d"; mkdir -p "$d"
start=$(date +%s)
( cd "$d" && timeout 1200 node "$script" "$url" "$@" ) > "$d/out.log" 2>&1
code=$?
echo "$label exit=$code OK=$(grep -cE '^OK' $d/out.log) FALLA=$(grep -cE '^FALLA' $d/out.log) dur=$(( $(date +%s)-start ))s load=$(cut -d' ' -f1 /proc/loadavg) $(grep -E '^GIRO' $d/out.log)"
grep -E '^FALLA' "$d/out.log" | cut -c1-200 | sed 's/^/    /'
