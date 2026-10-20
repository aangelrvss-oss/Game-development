# Diagnóstico ciclo 2: compara los escenarios emulados (duo-emulado.ts) entre versiones, emparejados por semilla.
# Uso: python3 -I resumen-emulado.py <carpeta> <v1> <v2> ...
import json, sys, math
W = sys.argv[1]; vs = sys.argv[2:]
D = {v: {r['seed']: r for r in map(json.loads, open(f'{W}/emulado-{v}.jsonl'))} for v in vs}
def fisher(a, n1, b, n2):
    # bilateral exacta (hipergeométrica)
    from math import comb
    K = a + b; N = n1 + n2
    p0 = comb(n1, a) * comb(n2, b) / comb(N, K)
    return sum(comb(n1, x) * comb(n2, K - x) / comb(N, K) for x in range(max(0, K - n2), min(K, n1) + 1) if comb(n1, x) * comb(n2, K - x) / comb(N, K) <= p0 + 1e-12)
checks = ['grab1', 'aviso', 'regrab', 'soltar', 'regrab2']
for v in vs:
    rs = list(D[v].values()); n = len(rs)
    ok = {c: sum(1 for r in rs if r[c]) for c in checks}
    allok = sum(1 for r in rs if all(r[c] for c in checks) and r['dyaw'] > 0.4 and r['together'] > 2.5 and r['solo'] < r['together'] * 0.5)
    keysA = sum(1 for r in rs if r['twist'].startswith('KeyA'))
    sA = sum(1 for r in rs if r['twist'].startswith('KeyA') and r['soltar']); sS = sum(1 for r in rs if r['twist'].startswith('KeyS') and r['soltar'])
    print(f"{v}: n={n} " + ' '.join(f"{c}={ok[c]}/{n}" for c in checks) + f" | todo A OK={allok}/{n} | teclas A {keysA} (soltar OK {sA}), S {n-keysA} (soltar OK {sS})")
base = vs[0]
for v in vs[1:]:
    seeds = sorted(set(D[base]) & set(D[v]))
    same = sum(1 for s in seeds if D[base][s] == D[v][s])
    a = sum(D[base][s]['soltar'] for s in seeds); b = sum(D[v][s]['soltar'] for s in seeds)
    disc = sum(1 for s in seeds if D[base][s]['soltar'] != D[v][s]['soltar'])
    print(f"{base} vs {v}: escenarios idénticos {same}/{len(seeds)}; soltar OK {a} vs {b} (discordantes {disc}); Fisher bilateral p={fisher(a, len(seeds), b, len(seeds)):.3f}")
    for c in ['aviso', 'grab1', 'regrab2']:
        a = sum(D[base][s][c] for s in seeds); b = sum(D[v][s][c] for s in seeds)
        print(f"   {c}: {a} vs {b}, Fisher p={fisher(a, len(seeds), b, len(seeds)):.3f}")
