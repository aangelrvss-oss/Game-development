# Revisión c1b (segunda ronda del ciclo 1), roles B+F: pruebas de mutación de la corrección f8efb59.
# Copia el proyecto (src, tests, index.html y configuración) a /tmp/claude-0/review-c1b/mut/<nombre>, aplica la
# mutación (texto exacto que debe aparecer una sola vez) y ejecuta Vitest sobre los ficheros indicados.
# Uso: python3 scripts/audit/review-c1b/fisica-qa/mutar.py [nombre ...]   (sin nombres: todas)
# No toca el repositorio.
import os, re, shutil, subprocess, sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..'))
OUT = '/tmp/claude-0/review-c1b/mut'
NM = '/home/user/Game-development/mudanza-imposible/node_modules'

CARRIER = 'src/sim/carrier.ts'
HAND = 'src/sim/hand.ts'
GAME = 'src/sim/game.ts'
CORE = 'src/input/inputCore.ts'
MAIN = 'src/main.ts'
VIEW = 'src/view/doll/dollView.ts'
RIG = 'src/view/doll/dollRig.ts'
SIM = 'tests/sim.test.ts'
COH = 'tests/coherence.test.ts'
INP = 'tests/input.test.ts'

M = {
  # «¡Se escapa!» anulado por completo (M4 de la primera ronda)
  'M4-sin-soltar': ([(CARRIER, 'if (this.gripStrain > CARRIER.gripHold || this.hangTime > CARRIER.gripHold || r.separation > CARRIER.gripBreak * 2) {', 'if (false) {')], [SIM]),
  # Solo la regla de tiempo (gripHold) anulada: sigue soltando de golpe al doble de gripBreak
  'M4b-sin-gripHold': ([(CARRIER, 'if (this.gripStrain > CARRIER.gripHold || this.hangTime', 'if (this.hangTime')], [SIM]),
  # Ayudantes con el triple de fuerza (M8)
  'M8-ayudante-x3': ([(HAND, 'const maxH = HAND.maxH * reach * hill(along / HAND.hillSpeed) * this.dt, maxV = HAND.maxV * this.dt;',
                       'const boost = (this.owner as any).human === null ? 3 : 1; const maxH = HAND.maxH * boost * reach * hill(along / HAND.hillSpeed) * this.dt, maxV = HAND.maxV * boost * this.dt;')], [SIM]),
  # Ayudantes con un 30 % más de fuerza (mutación sutil)
  'M8b-ayudante-x1.3': ([(HAND, 'const maxH = HAND.maxH * reach * hill(along / HAND.hillSpeed) * this.dt, maxV = HAND.maxV * this.dt;',
                       'const boost = (this.owner as any).human === null ? 1.3 : 1; const maxH = HAND.maxH * boost * reach * hill(along / HAND.hillSpeed) * this.dt, maxV = HAND.maxV * boost * this.dt;')], [SIM]),
  # Ayudantes con más fuerza solo de lado (la elipse no aplica a los ayudantes)
  'M8c-ayudante-sin-elipse': ([(HAND, 'const reach = 1 / Math.hypot(fwd, side / HAND.lateral);',
                       'const reach = (this.owner as any).human === null ? 1 : 1 / Math.hypot(fwd, side / HAND.lateral);')], [SIM]),
  # stepFrame lee una vez por fotograma, antes de los pasos (M13 en stepFrame)
  'M13a-stepFrame': ([(CORE, 'for (let i = 0; i < n; i++) step(read());',
                       'const first = read(); for (let i = 0; i < n; i++) step(i === 0 ? first : first.map((p) => ({ ...p, grab: false, right: false })));')], [INP]),
  # main.ts deja de usar stepFrame y lee antes de los pasos (M13 en main.ts)
  'M13b-main': ([(MAIN, '''      stepFrame(stepper, dtReal, () => {
        const keys: PlayerInput[] = input.step(Math.max(1, humans));
        return autopilot ? [autopilot.input(g, DT)] : keys;
      }, (inputs) => {''', '''      const keys0: PlayerInput[] = input.step(Math.max(1, humans));
      stepFrame(stepper, dtReal, () => {
        const keys: PlayerInput[] = keys0;
        return autopilot ? [autopilot.input(g, DT)] : keys;
      }, (inputs) => {''')], [INP]),
  # Muñeco dibujado 15 cm por detrás de su cápsula (M14)
  'M14-15cm': ([(VIEW, 's.pos = { x: p.x * IS, y: p.y * IS, z: p.z * IS };', 's.pos = { x: (p.x - c.facing.x * 0.15) * IS, y: p.y * IS, z: (p.z - c.facing.z * 0.15) * IS };')], [COH]),
  # Desplazamiento de 2 cm (sutil)
  'M14b-2cm': ([(VIEW, 's.pos = { x: p.x * IS, y: p.y * IS, z: p.z * IS };', 's.pos = { x: (p.x - c.facing.x * 0.02) * IS, y: p.y * IS, z: (p.z - c.facing.z * 0.02) * IS };')], [COH]),
  # Desplazamiento solo cuando tumbado: 15 cm
  'M14c-tumbado': ([(VIEW, 's.pos = { x: k.x * IS, y: k.y * IS, z: k.z * IS };', 's.pos = { x: (k.x + 0.15) * IS, y: k.y * IS, z: k.z * IS };')], [COH]),
  # Vuelve el fallo crítico: escala aplicada dos veces en los miembros
  'RIG-doble-escala': ([(RIG, 'return o.localToWorld(new THREE.Vector3(x, y, z)).applyMatrix4(this.groupInv);', 'return o.localToWorld(new THREE.Vector3(x, y, z));')], [COH]),
  # Sin elipse lateral (T-grip-2 de lado)
  'E1-sin-elipse': ([(HAND, 'lateral: 0.45,', 'lateral: 1,')], [SIM]),
  # Elipse más floja (sensibilidad de la prueba)
  'E2-elipse-0.6': ([(HAND, 'lateral: 0.45,', 'lateral: 0.6,')], [SIM]),
  'E3-elipse-0.75': ([(HAND, 'lateral: 0.45,', 'lateral: 0.75,')], [SIM]),
  # La correa nunca cede (vuelve el tira y afloja imposible)
  'L1-correa-no-cede': ([(CARRIER, 'if (!resist && cur < min)', 'if (cur < min)')], [SIM]),
  # La correa cede siempre que el jugador tira hacia fuera, sin exigir que la mano no dé abasto ni que se lo lleven
  'L2-correa-cede-siempre': ([(CARRIER, 'const resist = this.handSatH && away > CARRIER.tugAway && mx * ux + mz * uz < -CARRIER.tugBack;',
                               'const resist = mx * ux + mz * uz < -CARRIER.tugBack;')], [SIM]),
  # Aviso «Pesa mucho» sin tope
  'H1-aviso-sin-tope': ([(GAME, 'heavyHintMax: 1.0,', 'heavyHintMax: 1e9,')], [SIM]),
  # Aviso: no se borra al llegar ayuda (solo el tope)
  'H2-aviso-sin-reset-ayuda': ([(GAME, 'if (helped && !solo) { this.soloDrag = 0; this.soloDragCarrier = null; }', '')], [SIM]),
  # El collider nunca se tumba (M7 de la primera ronda)
  'M7-sin-tumbar': ([(CARRIER, '  private applyTilt() {', '  private applyTilt() { return;')], [COH]),
}


def run(name):
    edits, tests = M[name]
    d = os.path.join(OUT, name)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    for f in ['src', 'tests']:
        shutil.copytree(os.path.join(REPO, f), os.path.join(d, f))
    for f in ['index.html', 'package.json', 'tsconfig.json', 'vite.config.ts']:
        shutil.copy(os.path.join(REPO, f), os.path.join(d, f))
    os.symlink(NM, os.path.join(d, 'node_modules'))
    for f, old, new in edits:
        p = os.path.join(d, f)
        s = open(p).read()
        n = s.count(old)
        if n != 1:
            print(f'{name}: el texto aparece {n} veces en {f}; no se aplica')
            return
        open(p, 'w').write(s.replace(old, new))
    r = subprocess.run(['npx', 'vitest', 'run', *tests], cwd=d, capture_output=True, text=True)
    out = r.stdout + r.stderr
    open(os.path.join(OUT, name + '.log'), 'w').write(out)
    summary = ' | '.join(l.strip() for l in out.splitlines() if re.match(r'\s*Tests\s', l))
    fails = sorted(set(l.strip()[:170] for l in out.splitlines() if l.strip().startswith('×') or l.strip().startswith('FAIL')))
    print(f'== {name}: {summary or "(sin resumen)"}')
    for f in fails[:12]:
        print('   ', f)


if __name__ == '__main__':
    names = sys.argv[1:] or list(M)
    for n in names:
        run(n)
