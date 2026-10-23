#!/usr/bin/env bash
# (Copia de lo usado en etapa-0.md; las rutas son las de aquella sesión: /tmp/claude-0/c2b-e0.)
# Mediciones de viewport: ejecuciones grabadas, de una en una
G=/home/user/Game-development-2b/mudanza-imposible/scripts/audit/ciclo-2b/etapa-0/grabar.sh
M=/tmp/claude-0/c2b-e0/medidas
for spec in "$@"; do
  IFS=: read -r test ver port vp i <<< "$spec"
  r=$($G $test $port $vp $M/$ver-$test-${vp%%x*}-$i)
  echo "$ver-$test-${vp%%x*}-$i $r load=$(cut -d' ' -f1 /proc/loadavg)" >> $M/medir.log
done
echo FIN >> $M/medir.log
