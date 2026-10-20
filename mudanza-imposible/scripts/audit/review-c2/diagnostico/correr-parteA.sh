#!/usr/bin/env bash
# Diagnóstico ciclo 2: corre el duo-e2e ORIGINAL (sin tocar) con el grabador pasivo y lo corta cuando imprime la
# comprobación «tras levantarse, J2 vuelve a agarrar» (fin de las partes A1–A5; la parte B no interviene en el fallo).
# Uso: correr-parteA.sh <etiqueta> <duo-e2e.cjs> <url>
set -u
D=$(dirname "$(readlink -f "$0")")
label=$1; script=$2; url=$3
export NODE_PATH=$(npm root -g)
d=/tmp/claude-0/review-c2/diagnostico/runs-orig/$label; rm -rf "$d"; mkdir -p "$d"
start=$(date +%s)
( cd "$d" && exec node -r "$D/grabador-pasivo.cjs" "$script" "$url" ) > "$d/out.log" 2>&1 &
pid=$!
for i in $(seq 1 900); do
  if grep -q "tras levantarse, J2 vuelve a agarrar" "$d/out.log" 2>/dev/null || ! kill -0 $pid 2>/dev/null; then break; fi
  sleep 1
done
sleep 1; kill -TERM $pid 2>/dev/null; wait $pid 2>/dev/null
echo "$label OK=$(grep -cE '^OK' $d/out.log) FALLA=$(grep -cE '^FALLA' $d/out.log) dur=$(( $(date +%s)-start ))s load=$(cut -d' ' -f1 /proc/loadavg)"
grep -E '^FALLA' "$d/out.log" | cut -c1-200 | sed 's/^/    /'
