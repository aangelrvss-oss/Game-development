# Resumen por configuración de las líneas «R {json}» de matriz.ts. Uso: python3 -I resumen.py archivo...
import json, sys, statistics
rows = []
for f in sys.argv[1:]:
    for l in open(f):
        if l.startswith('R '): rows.append(json.loads(l[2:]))
groups = {}
for r in rows:
    k = (r['lvl'], r.get('spawns', 'nivel'), r['h'], r['helpers'], r['style'] if r['helpers'] else '-')
    groups.setdefault(k, []).append(r)
def f(x, d=1): return '-' if x is None else (f'{x:.{d}f}')
print('nivel|salidas|hum|ayud|estilo|ganadas|mediana|peor|caídasH|caídasA|derribos|rotos|integ.mín|estanc.máx|aguarre|ayud.quieto|ayud.aparcado|ayud.esperaAgarr|rachaHsin|perdidas')
for k in sorted(groups):
    rs = groups[k]
    won = [r for r in rs if r['phase'] == 'won']
    ts = sorted(r['t'] for r in won)
    med = statistics.median(ts) if ts else None
    worst = max(r['t'] for r in rs)
    m = lambda key: statistics.mean([r[key] for r in rs if r[key] is not None]) if any(r[key] is not None for r in rs) else None
    lost = ','.join(f"s{r['seed']}:{r['reason'] or r['phase']}@{r['t']}({r['loaded']})" for r in rs if r['phase'] != 'won')
    print('|'.join(map(str, [k[0], k[1], k[2], k[3], k[4], f'{len(won)}/{len(rs)}', f(med, 2), f(worst, 2),
        sum(r['fallsH'] for r in rs), sum(r['fallsB'] for r in rs), sum(r['stunsH'] + r['stunsB'] for r in rs), sum(r['broken'] for r in rs),
        min(r['integ'] for r in rs), f(max(r['stallMax'] for r in rs)), f(m('bHold'), 2), f(m('bIdleStill'), 2), f(m('bParked'), 2), f(m('bWaitHold'), 2),
        f(max(r['hNotHoldMax'] for r in rs)), lost or '-'])))
