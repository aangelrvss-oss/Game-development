# Diagnóstico ciclo 2: convierte rec.jsonl (grabador pasivo) de la primera partida en el formato de duo-instr.json
# (phaseAt, inputs, marks cada 100 pasos) para repetir.ts / divergencia.ts, y resume la ejecución.
# Uso: python3 -I rec-a-json.py <carpeta de la ejecución>
import json, sys, os, re, math
d = sys.argv[1]
rows = []
for l in open(os.path.join(d, 'rec.jsonl')):
    try: rows += json.loads(l)
    except Exception: pass
gids = sorted({r[0] for r in rows})
# la partida de la parte A: la que tiene 2 porteadores y más pasos
best = max(gids, key=lambda k: sum(1 for r in rows if r[0] == k))
R = [r for r in rows if r[0] == best]
i1 = next(i for i, r in enumerate(R) if r[3] == 'p')
first = R[i1]
if first[1] != i1 + 1: pass
inputs = [r[6] for r in R[i1 + 1:]]
marks = []
for k, r in enumerate(R[i1 + 1:]):
    if (k + 1) % 100 == 0: marks.append({'tag': f'paso{k+1}', 'n': k + 1, 't': r[4], 'yaw': r[10], 'sofa': [r[7], r[8], r[9]], 'cs': []})
J = {'phaseAt': {'t': first[4]}, 'inputs': inputs, 'marks': marks, 'frames': []}
json.dump(J, open(os.path.join(d, 'duo-rec.json'), 'w'))
# resumen: primer paso con los dos agarrando, giro antes de «tirar en sentidos opuestos»
S = R[i1 + 1:]
both = next((k for k, r in enumerate(S) if r[11][0][2] and r[11][1][2]), None)
log = open(os.path.join(d, 'out.log')).read()
m = re.search(r'girar el sofá ([\d.]+) rad con (\S+) \+ (\S+)', log)
yaw0 = None
if m:
    k1, k2 = m.group(2), m.group(3)
    want = {'KeyA': (-1, 0), 'KeyD': (1, 0), 'KeyW': (0, -1), 'KeyS': (0, 1)}[k1]
    # primer tramo, tras el segundo agarre de J2 (vuelve a agarrar tras «uno solo»), en que J1 y J2 pulsan esas teclas
    g2 = [k for k, r in enumerate(S) if 'g1' in r[12]]
    if len(g2) >= 2:
        for k in range(g2[1] + 1, len(S)):
            a, b = S[k][6][0], S[k][6][1]
            if (round(a[0]), round(a[1])) == want and (round(b[0]), round(b[1])) == (-want[0], -want[1]):
                yaw0 = S[k - 1][10]; break
fails = re.findall(r'^FALLA (.{0,45})', log, re.M)
det = re.search(r'Rodeos del piloto de prueba al agarrar: (\d+)', log)
print(json.dumps({'run': os.path.basename(d), 'pasos': len(S), 't_agarran': S[both][4] if both is not None else None,
  'giro': m.group(0) if m else None, 'yaw0': yaw0, 'soltar_ok': bool(re.search(r'^OK +soltar', log, re.M)),
  'reagarra_ok': bool(re.search(r'^OK +tras levantarse', log, re.M)), 'fallos': fails}, ensure_ascii=False))
