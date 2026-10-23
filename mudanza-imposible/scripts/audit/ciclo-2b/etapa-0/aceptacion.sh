#!/usr/bin/env bash
# Ciclo 2b, etapa 0: tandas DEFINITIVAS de aceptación, una detrás de otra (nunca dos navegadores a la vez), con
# tanda-final.sh (viewport 1280x720, sin grabador). Es lo que se ejecutó para etapa-0.md.
# Requiere servidas (vite preview de cada dist): 657fd30 en :4211, 5cab122 en :4212 y la copia mutada (5cab122 con
# mutacion-releaseKick.patch: releaseKick anulado) en :4213; W apunta a la carpeta con los worktrees de cada versión.
set -u
D=$(dirname "$(readlink -f "$0")")
W=${W:-/tmp/claude-0/c2b-e0}
"$D/tanda-final.sh" duo 1 20 aceptacion 657fd30:4211:$W/wt-657fd30 5cab122:4212:$W/wt-5cab122
"$D/tanda-final.sh" teclado 1 20 aceptacion 657fd30:4211:$W/wt-657fd30 5cab122:4212:$W/wt-5cab122
"$D/tanda-final.sh" duo 1 10 mutacion mut-releaseKick:4213:$W/wt-mut
