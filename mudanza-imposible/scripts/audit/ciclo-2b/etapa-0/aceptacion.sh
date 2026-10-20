#!/usr/bin/env bash
# Ciclo 2b, etapa 0: tandas de aceptación, una detrás de otra (nunca dos navegadores a la vez).
# Requiere servidas: 657fd30 en :4211, 5cab122 en :4212 y la copia mutada (releaseKick anulado) en :4213.
set -u
D=$(dirname "$(readlink -f "$0")")
"$D/tanda.sh" duo 1 20 aceptacion 657fd30:4211 5cab122:4212
"$D/tanda.sh" teclado 1 20 aceptacion 657fd30:4211 5cab122:4212
"$D/tanda.sh" duo 1 20 mutacion mut-releaseKick:4213
