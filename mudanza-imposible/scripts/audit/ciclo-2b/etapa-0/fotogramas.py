# Ciclo 2b, etapa 0: resume una o varias ejecuciones grabadas con grabador-fotogramas.cjs (rec.jsonl).
# Para la partida jugada con teclas (la de más pasos en fase «playing» con humanos; la parte B de duo-e2e va por
# `advance` y se descarta porque no tiene fotogramas reales):
#   - FPS (fotogramas de requestAnimationFrame por segundo de reloj), pasos de física por fotograma (histograma de los
#     fotogramas con algún paso) y relación tiempo de juego / tiempo de reloj;
#   - en duo-e2e, el paso 4d: la suelta de J2 que va seguida de un tambaleo (tensión sostenida de J2 justo antes,
#     inclinación máxima y sucesos en los 1,5 s siguientes).
# Uso: python3 -I fotogramas.py <carpeta> [<carpeta> ...]   (imprime una línea JSON por carpeta)
import json, os, sys, collections

def load(d):
    # Al recargar la página el grabador vuelve a empezar (partida 1, reloj desde 0): se numeran las cargas y la partida
    # pasa a ser (carga, partida)
    rows, load_n = [], 0
    for l in open(os.path.join(d, 'rec.jsonl')):
        try: chunk = json.loads(l)
        except Exception: continue
        for r in chunk:
            if r[1] == 0 and r[0] == 1: load_n += 1
            rows.append([(load_n, r[0])] + r[1:])
    return rows

def summarize(d):
    rows = load(d)
    heads = {r[0]: r for r in rows if r[1] == 0}
    steps = collections.defaultdict(list)
    for r in rows:
        if r[1] > 0: steps[r[0]].append(r)
    # partida con humanos y más pasos en juego
    # (la parte B de duo-e2e avanza con `advance`: 30 o más pasos por fotograma; se descarta)
    def real(g):
        c = collections.Counter(r[3] for r in steps[g] if r[4] == 'p')
        return c and max(c.values()) <= 5
    cand = [g for g in steps if heads.get(g) and heads[g][6] > 0 and real(g)]
    gid = max(cand, key=lambda g: sum(1 for r in steps[g] if r[4] == 'p'))
    S = [r for r in steps[gid] if r[4] == 'p']
    # Fotogramas con pasos: cuántos pasos tiene cada uno
    per = collections.Counter(r[3] for r in S)
    hist = collections.Counter(per.values())
    nf = len(per)
    # Tramo continuo de juego (sin pausa): de la primera a la última fila en juego
    wall = (S[-1][2] - S[0][2]) / 1000
    game = S[-1][5] - S[0][5]
    frames_all = S[-1][3] - S[0][3]
    out = {
        'run': os.path.basename(d.rstrip('/')), 'seed': heads[gid][7], 'viewport': f'{heads[gid][8]}x{heads[gid][9]}',
        'pasos': len(S), 'fotogramas_con_pasos': nf, 'fotogramas_totales': frames_all,
        'fps': round(frames_all / wall, 2) if wall > 0 else None,
        'ms_por_fotograma': round(wall * 1000 / frames_all, 1) if frames_all else None,
        'pasos_por_fotograma_medio': round(len(S) / nf, 2),
        'hist_pasos_por_fotograma': {k: hist[k] for k in sorted(hist)},
        'frac_5_pasos': round(hist[5] / nf, 3),
        'juego_por_reloj': round(game / wall, 3) if wall > 0 else None,
    }
    # 4d: suelta de J2 (r1) seguida de tambaleo (w1) en 0,3 s
    evs = [(i, r[5], e) for i, r in enumerate(S) for e in r[13]]
    rel = None
    for i, t, e in evs:
        if e == 'r1' and any(e2 == 'w1' and 0 <= t2 - t <= 0.3 for _, t2, e2 in evs):
            rel = (i, t)
    if rel is not None:
        i, t = rel
        prev = S[i - 1]
        after = [r for r in S[i:] if r[5] - t <= 1.5]
        out['soltar'] = {
            't': t, 'tension_J2_antes': prev[12][1][7], 'tension_J1_antes': prev[12][0][7],
            'entradas_antes': prev[7], 'giro_sofa': prev[11], 'sofa': [prev[8], prev[10]], 'J2': prev[12][1][:2],
            'inclinacion_max': max(r[12][1][6] for r in after),
            'sucesos': [f'{round(r[5] - t, 2)} {e}' for r in after for e in r[13] if e.endswith('1')],
            'J2_fin': after[-1][12][1][:2],
        }
    return out

for d in sys.argv[1:]:
    try: print(json.dumps(summarize(d), ensure_ascii=False))
    except Exception as ex: print(json.dumps({'run': d, 'error': repr(ex)}))
