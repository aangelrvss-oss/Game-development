#!/usr/bin/env python3
"""Revisión QA del ciclo 2: mutaciones dirigidas al código nuevo, en una COPIA en /tmp (nunca en el worktree).

Uso: python3 -I mutar.py <id> [<id> ...]   (o «todas»)
Cada mutación: restaura src/ desde la copia original, aplica un único reemplazo exacto (falla si no está una sola vez),
ejecuta la batería entera de Vitest en la copia y anota qué pruebas fallan. Al acabar, deja src/ como estaba.
"""
import pathlib
import re
import shutil
import subprocess
import sys

MUT = pathlib.Path('/tmp/claude-0/review-c2/qa/mut')
ORIG = pathlib.Path('/tmp/claude-0/review-c2/qa/mut-src-orig')
LOG = pathlib.Path('/tmp/claude-0/review-c2/qa/mutaciones')

MUTATIONS = {
    # Entrega: basta con el centro dentro (sin el 80 % de la caja envolvente)
    'M1-entrega-centro': ('src/sim/game.ts',
                          'it.inHold = this.holdFraction(it) >= RULES.loadFraction;',
                          'it.inHold = this.holdFraction(it) > 0;'),
    # Entrega: cuenta aunque el objeto se esté moviendo (sin «quieto»)
    'M2-entrega-sin-quieto': ('src/sim/game.ts',
                              'const still = Math.hypot(v.x, v.y, v.z) < RULES.loadedSpeed && Math.hypot(w.x, w.y, w.z) < RULES.loadedSpin;',
                              'const still = true;'),
    # Fragilidad: los frágiles usan el umbral común de golpe (3,2 m/s) en vez del suyo (lámpara 2,45)
    'M3-fragil-umbral-comun': ('src/sim/game.ts',
                               'const threshold = f ? f.impactDv : RULES.impactDv;',
                               'const threshold = RULES.impactDv;'),
    # Fragilidad: cualquier objeto roto (también opcional) hace perder
    'M3b-opcional-roto-pierde': ('src/sim/game.ts',
                                 "if (this.items.some((it) => it.required && it.state === 'broken'))",
                                 "if (this.items.some((it) => it.state === 'broken'))"),
    # minCarriers en el reparto del piloto: a cada objeto, una persona menos de las que pide
    'M4-reparto-una-menos': ('src/sim/autopilot.ts',
                             'const need = Math.max(1, it.def.minCarriers - g.bots.size);',
                             'const need = Math.max(1, it.def.minCarriers - 1 - g.bots.size);'),
    # minCarriers en los ayudantes: ignoran lo que le falta a un objeto que nadie lleva (nivel 3 del reparto)
    'M4b-ayudantes-sin-espera': ('src/sim/game.ts',
                                 ": it.required && heavy && short ? 2 : -1;",
                                 ": -1;"),
    # Reparto de equipos: el 4.º jugador nunca entra en un equipo (se queda parado toda la partida)
    'M5-cuarto-parado': ('src/sim/autopilot.ts',
                         'let free = this.pilots.filter((i) => !this.crewOf.has(i));',
                         'let free = this.pilots.filter((i) => !this.crewOf.has(i) && i !== 3);'),
    # Reparto de equipos: el 4.º jugador entra en su equipo, pero no hace nada (ni anda ni agarra) en toda la partida
    'M5b-cuarto-en-equipo-quieto': ('src/sim/autopilot.ts',
                                    "    if (g.phase !== 'playing') return inp;\n    const me = g.carriers[this.carrierIndex];",
                                    "    if (g.phase !== 'playing' || this.carrierIndex === 3) return inp;\n    const me = g.carriers[this.carrierIndex];"),
    # Comprobación de una afirmación del paso 1: sin el filtro de manos libres (número de asas = máximo de manos)
    'M7-sin-freehand': ('src/sim/game.ts',
                        'private freeHand = (g: Grabbable) => g.maxHands === undefined || this.holdersOf(g.body).length < g.maxHands;',
                        'private freeHand = (g: Grabbable) => true;'),
    # Reparto de equipos: a cada objeto van los pilotos libres MÁS LEJANOS en vez de los más cercanos
    'M6-reparto-lejanos': ('src/sim/autopilot.ts',
                           'const pick = [...free].sort((a, b) => far(a) - far(b)).slice(0, need);',
                           'const pick = [...free].sort((a, b) => far(b) - far(a)).slice(0, need);'),
}


def restore():
    shutil.rmtree(MUT / 'src')
    shutil.copytree(ORIG, MUT / 'src')


def run(mid):
    path, old, new = MUTATIONS[mid]
    restore()
    f = MUT / path
    text = f.read_text()
    n = text.count(old)
    if n != 1:
        print(f'{mid}: el texto a mutar aparece {n} veces; no se aplica')
        return
    f.write_text(text.replace(old, new))
    LOG.mkdir(parents=True, exist_ok=True)
    out = subprocess.run(['npx', 'vitest', 'run', '--reporter=verbose', '--config', '/home/user/Game-development-rc2/mudanza-imposible/scripts/audit/review-c2/qa/vitest.qa.config.ts', '--root', '.'], cwd=MUT, capture_output=True, text=True, timeout=1800)
    log = out.stdout + out.stderr
    (LOG / f'{mid}.log').write_text(log)
    summary = [l.strip() for l in log.splitlines() if re.search(r'^\s*(Test Files|Tests)\s', l)]
    failed = sorted({l.strip() for l in log.splitlines() if re.match(r'^\s*[×✗]', l)})
    print(f'== {mid} ({path}): exit {out.returncode}')
    print(f'   - {old}\n   + {new}')
    for s in summary:
        print('  ', s)
    for l in failed:
        print('   FALLA', l[:220])
    if not failed:
        print('   NO DETECTADA: ninguna prueba falla')


if __name__ == '__main__':
    ids = list(MUTATIONS) if sys.argv[1:] == ['todas'] else sys.argv[1:]
    try:
        for mid in ids:
            run(mid)
    finally:
        restore()
        diff = subprocess.run(['diff', '-r', str(ORIG), str(MUT / 'src')], capture_output=True, text=True)
        print('src restaurado:', 'idéntico al original' if diff.returncode == 0 else 'DIFERENTE')
