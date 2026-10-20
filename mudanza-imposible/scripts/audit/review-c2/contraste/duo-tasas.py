# Árbitro de contraste: tasas de «soltar» de duo-e2e en el emulador del diagnóstico (por teclas) y Fisher del navegador.
# Uso: python3 -I duo-tasas.py <carpeta diagnostico-evidencias>
import gzip, json, sys
from math import comb
d = sys.argv[1]
for s in ('657fd30', '23b8c66'):
    byk = {}
    for l in gzip.open(f'{d}/emulado-{s}.jsonl.gz', 'rt'):
        r = json.loads(l); k = r['twist']; byk.setdefault(k, [0, 0]); byk[k][0] += 1; byk[k][1] += r['soltar']
    print(s, 'teclas: [partidas, soltar OK]', byk, 'total OK', sum(v[1] for v in byk.values()), '/', sum(v[0] for v in byk.values()))
def fisher(a, b, c, e):
    n = a + b + c + e; r1 = a + b; c1 = a + c
    P = lambda x: comb(r1, x) * comb(n - r1, c1 - x) / comb(n, c1)
    p0 = P(a)
    return sum(P(x) for x in range(max(0, c1 - (n - r1)), min(r1, c1) + 1) if P(x) <= p0 + 1e-12)
# Navegador agregado (revisor 1: base 6/6, c2 2/8; diagnóstico tanda-orig1: base 5/10, c2 5/10)
print('navegador agregado «soltar» OK base 11/16 frente a c2 7/18: Fisher bilateral p =', round(fisher(11, 5, 7, 11), 3))
