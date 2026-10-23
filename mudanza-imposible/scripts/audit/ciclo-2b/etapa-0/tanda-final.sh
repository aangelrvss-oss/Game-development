#!/usr/bin/env bash
# Ciclo 2b, etapa 0: tanda DEFINITIVA de un e2e (del árbol de 2b, sin grabador) contra versiones servidas, alternando
# versión en cada ronda y nunca dos navegadores a la vez. Cada ejecución en <RUNS>/<versión>-<prueba>-<i>/out.log
# (salida completa) con sus capturas. El resumen <RUNS>/resumen-<prueba>-<etiqueta>.txt lleva, por ejecución: versión,
# commit, semilla de la partida (la imprime la prueba), navegador, viewport, código de salida, OK/FALLA y cada FALLA.
# Uso: tanda-final.sh <duo|teclado> <desde> <hasta> <etiqueta> <versión:puerto:árbol> [<versión:puerto:árbol> ...]
# Entorno: RUNS (por defecto /tmp/claude-0/c2b-e0/final), E2E_VIEWPORT (por defecto 1280x720), CHROMIUM_PATH (por
# defecto /opt/pw-browsers/chromium), TIMEOUT por ejecución en s (por defecto 1800).
set -u
D=$(dirname "$(readlink -f "$0")")
SCRIPTS=$(readlink -f "$D/../../..")
test=$1; a=$2; b=$3; tag=$4; shift 4
case "$test" in duo) script=$SCRIPTS/duo-e2e.cjs ;; teclado) script=$SCRIPTS/keyboard-e2e.cjs ;; *) echo "prueba desconocida: $test"; exit 2 ;; esac
RUNS=${RUNS:-/tmp/claude-0/c2b-e0/final}
export NODE_PATH=$(npm root -g)
export E2E_VIEWPORT=${E2E_VIEWPORT:-1280x720}
export CHROMIUM_PATH=${CHROMIUM_PATH:-/opt/pw-browsers/chromium}
TIMEOUT=${TIMEOUT:-1800}
mkdir -p "$RUNS"
sum=$RUNS/resumen-$test-$tag.txt
{
  echo "== $test $a..$b ($*) inicio $(date -u +%FT%TZ)"
  echo "   script $script ($(sha1sum "$script" | cut -c1-12)), piloto $(sha1sum "$SCRIPTS/e2e-piloto.cjs" | cut -c1-12), viewport $E2E_VIEWPORT"
  echo "   chromium $CHROMIUM_PATH -> $(readlink -f "$CHROMIUM_PATH"), args: --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist (headless)"
  for x in "$@"; do
    IFS=: read -r ver port tree <<< "$x"
    echo "   $ver: puerto $port, árbol $tree, commit $(git -C "$tree" rev-parse --short=12 HEAD)$(git -C "$tree" diff --quiet || echo " + cambios sin commit: $(git -C "$tree" diff | sha1sum | cut -c1-12) ($(git -C "$tree" diff --stat | tail -1 | sed 's/^ *//'))"), bundle $(curl -s "http://localhost:$port/" | grep -o 'assets/index-[^"]*js')"
  done
} >> "$sum"
for i in $(seq "$a" "$b"); do
  for x in "$@"; do
    IFS=: read -r ver port tree <<< "$x"
    d=$RUNS/$ver-$test-$i; rm -rf "$d"; mkdir -p "$d/shots"
    start=$(date +%s)
    ( cd "$d" && timeout "$TIMEOUT" node "$script" "http://localhost:$port/" ) > "$d/out.log" 2>&1
    code=$?
    ok=$(grep -cE '^OK' "$d/out.log"); fail=$(grep -cE '^FALLA' "$d/out.log")
    seed=$(grep -oE 'Semilla de la partida( \(parte A\))?: [0-9]+' "$d/out.log" | head -1 | grep -oE '[0-9]+$')
    nav=$(grep -oE 'Chromium [0-9.]+' "$d/out.log" | head -1)
    { echo "$ver-$test-$i exit=$code OK=$ok FALLA=$fail semilla=${seed:-n/d} commit=$(git -C "$tree" rev-parse --short=12 HEAD)$(git -C "$tree" diff --quiet || echo +mut) navegador=\"${nav:-n/d}\" viewport=$E2E_VIEWPORT dur=$(( $(date +%s) - start ))s load=$(cut -d' ' -f1 /proc/loadavg)"
      grep -E '^FALLA' "$d/out.log" | sed 's/^/    /'; } >> "$sum"
  done
done
echo "== fin $(date -u +%FT%TZ)" >> "$sum"
for x in "$@"; do
  IFS=: read -r ver port tree <<< "$x"
  n=$(grep -cE "^$ver-$test-[0-9]+ exit=" "$sum"); pass=$(grep -cE "^$ver-$test-[0-9]+ exit=0 " "$sum")
  echo "TOTAL $ver $test: pasa $pass de $n (exit=0)" >> "$sum"
done
