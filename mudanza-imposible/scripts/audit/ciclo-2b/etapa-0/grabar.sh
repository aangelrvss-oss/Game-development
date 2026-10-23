#!/usr/bin/env bash
# Ciclo 2b, etapa 0: UNA ejecución de un e2e (sin modificar) con el grabador pasivo de fotogramas precargado.
# Uso: grabar.sh <duo|teclado> <puerto> <viewport WxH> <carpeta de salida>
# Deja en la carpeta out.log (salida de la prueba), rec.jsonl (grabación) y shots/.
set -u
D=$(dirname "$(readlink -f "$0")")
SCRIPTS=$(readlink -f "$D/../../..")
case "$1" in duo) script=$SCRIPTS/duo-e2e.cjs ;; teclado) script=$SCRIPTS/keyboard-e2e.cjs ;; *) echo "prueba desconocida: $1"; exit 2 ;; esac
port=$2; vp=$3; out=$4
rm -rf "$out"; mkdir -p "$out/shots"
export NODE_PATH=$(npm root -g)
export E2E_VIEWPORT=$vp
export CHROMIUM_PATH=${CHROMIUM_PATH:-/opt/pw-browsers/chromium}
start=$(date +%s)
( cd "$out" && timeout "${TIMEOUT:-1800}" node -r "$D/grabador-fotogramas.cjs" "$script" "http://localhost:$port/" ) > "$out/out.log" 2>&1
code=$?
echo "exit=$code OK=$(grep -cE '^OK' "$out/out.log") FALLA=$(grep -cE '^FALLA' "$out/out.log") dur=$(( $(date +%s) - start ))s"
exit $code
