#!/usr/bin/env bash
# Ciclo 2b, etapa 0: ejecuta un e2e ARREGLADO (del árbol de 2b) contra varias versiones servidas, alternando versión en
# cada ronda y nunca dos navegadores a la vez. Cada ejecución en su carpeta <runs>/<versión>-<prueba>-<i>/ (out.log y
# capturas); el resumen (código de salida, OK/FALLA y cada línea FALLA) se añade a <runs>/resumen-<prueba>-<etiqueta>.txt.
# Uso: tanda.sh <duo|teclado> <desde> <hasta> <etiqueta-del-resumen> <versión:puerto> [<versión:puerto> ...]
# Entorno: RUNS (por defecto /tmp/claude-0/c2b-e0/runs), E2E_VIEWPORT (por defecto 320x180), CHROMIUM_PATH
# (por defecto /opt/pw-browsers/chromium), TIMEOUT por ejecución en s (por defecto 1500).
set -u
D=$(dirname "$(readlink -f "$0")")
SCRIPTS=$(readlink -f "$D/../../..")
test=$1; a=$2; b=$3; tag=$4; shift 4
case "$test" in duo) script=$SCRIPTS/duo-e2e.cjs ;; teclado) script=$SCRIPTS/keyboard-e2e.cjs ;; *) echo "prueba desconocida: $test"; exit 2 ;; esac
RUNS=${RUNS:-/tmp/claude-0/c2b-e0/runs}
export NODE_PATH=$(npm root -g)
export E2E_VIEWPORT=${E2E_VIEWPORT:-320x180}
export CHROMIUM_PATH=${CHROMIUM_PATH:-/opt/pw-browsers/chromium}
TIMEOUT=${TIMEOUT:-1500}
mkdir -p "$RUNS"
sum=$RUNS/resumen-$test-$tag.txt
{
  echo "== $test $a..$b ($*) inicio $(date -u +%FT%TZ)"
  echo "   script $script ($(sha1sum "$script" | cut -c1-12)), piloto $(sha1sum "$SCRIPTS/e2e-piloto.cjs" | cut -c1-12), viewport $E2E_VIEWPORT, chromium $CHROMIUM_PATH"
} >> "$sum"
for i in $(seq "$a" "$b"); do
  for x in "$@"; do
    IFS=: read -r ver port <<< "$x"
    d=$RUNS/$ver-$test-$i; rm -rf "$d"; mkdir -p "$d/shots"
    start=$(date +%s)
    ( cd "$d" && timeout "$TIMEOUT" node "$script" "http://localhost:$port/" ) > "$d/out.log" 2>&1
    code=$?
    ok=$(grep -cE '^OK' "$d/out.log"); fail=$(grep -cE '^FALLA' "$d/out.log")
    { echo "$ver-$test-$i exit=$code OK=$ok FALLA=$fail dur=$(( $(date +%s) - start ))s load=$(cut -d' ' -f1 /proc/loadavg)"
      grep -E '^FALLA' "$d/out.log" | sed 's/^/    /'; } >> "$sum"
  done
done
echo "== fin $(date -u +%FT%TZ)" >> "$sum"
for x in "$@"; do
  IFS=: read -r ver port <<< "$x"
  n=$(grep -cE "^$ver-$test-[0-9]+ exit=" "$sum"); pass=$(grep -cE "^$ver-$test-[0-9]+ exit=0 " "$sum")
  echo "TOTAL $ver $test: pasa $pass de $n (exit=0)" >> "$sum"
done
