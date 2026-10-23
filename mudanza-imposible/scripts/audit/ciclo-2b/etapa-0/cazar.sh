#!/usr/bin/env bash
# (Copia de lo usado en etapa-0.md; las rutas son las de aquella sesión: /tmp/claude-0/c2b-e0.)
# Ejecuciones grabadas alternando versiones hasta que «soltar mientras tira» falle (o se acabe la cuenta)
G=/tmp/claude-0/c2b-e0/orig/mudanza-imposible/scripts/audit/ciclo-2b/etapa-0/grabar.sh
M=/tmp/claude-0/c2b-e0/caza; mkdir -p $M
for i in $(seq $1 $2); do
  for x in 5cab122:4212 657fd30:4211; do
    v=${x%%:*}; p=${x##*:}
    r=$($G duo $p ${VP:-320x180} $M/$v-duo-$i)
    echo "$v-duo-$i $r $(grep -h 'soltar mientras' $M/$v-duo-$i/out.log | grep -o 'tiran con [^,]*, desvío máximo de las teclas respecto al eje [0-9]*°' )" >> $M/caza.log
    grep -h '^FALLA' $M/$v-duo-$i/out.log | sed 's/^/    /' >> $M/caza.log
    if grep -q '^FALLA soltar' $M/$v-duo-$i/out.log; then echo "CAZADO $v-duo-$i" >> $M/caza.log; exit 0; fi
  done
done
echo FIN >> $M/caza.log
