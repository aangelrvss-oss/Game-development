# Diagnóstico ciclo 2: resume las ejecuciones de duo-instr.cjs (runs/<etiqueta>/duo-instr.json + out.log).
# Uso: python3 -I resumen-duo.py <carpeta runs> [prefijos...]
import json, os, sys, statistics as st, re
root = sys.argv[1]; pref = sys.argv[2:] or ['']
rows = []
for d in sorted(os.listdir(root)):
    if not any(d.startswith(p) for p in pref): continue
    f = os.path.join(root, d, 'duo-instr.json'); lg = os.path.join(root, d, 'out.log')
    if not os.path.exists(f): print(d, 'SIN JSON'); continue
    J = json.load(open(f)); log = open(lg).read()
    M = {m['tag']: m for m in J['marks']}
    ins = J['inputs']; fr = J['frames']
    # pasos por fotograma y ms por fotograma
    starts = [a for a, _ in fr] + [len(ins)]
    per = [starts[i+1]-starts[i] for i in range(len(fr))]
    ms = [fr[i+1][1]-fr[i][1] for i in range(len(fr)-1)]
    def steps(a, b, pred): return sum(1 for r in ins[M[a]['n']:M[b]['n']] if pred(r))
    solo = steps('J2-suelta+0.6', 'tras-solo', lambda r: r[0][1] > 0.5) if 'tras-solo' in M else None
    juntos = steps('antes-juntos', 'tras-juntos', lambda r: r[0][1] < -0.5 and r[1][1] < -0.5) if 'tras-juntos' in M else None
    fails = re.findall(r'^FALLA (.*?)(?:  | [0-9(\[]|$)', log, re.M)
    rows.append(dict(run=d, ok=not fails, fails=[x[:40] for x in fails],
        yaw_agarran=M.get('agarran', {}).get('yaw'), gl=[c['gl'] for c in M.get('agarran', {}).get('cs', [])],
        yaw_juntos=M.get('tras-juntos', {}).get('yaw'), yaw_suelta=M.get('J2-suelta+0.6', {}).get('yaw'),
        yaw_solo=M.get('tras-solo', {}).get('yaw'), yaw0=M.get('antes-giro', {}).get('yaw'), yaw_giro=M.get('tras-giro', {}).get('yaw'),
        pasos_juntos=juntos, pasos_solo=solo, t_agarran=M.get('agarran', {}).get('t'),
        pasos_fot=round(st.mean(per), 2), ms_fot=round(st.median(ms), 1), rodeos=len(J.get('detours', []))))
for r in rows:
    print(f"{r['run']:10} {'PASA ' if r['ok'] else 'FALLA'} t_agarran={r['t_agarran']} yaw: agarran={r['yaw_agarran']} juntos={r['yaw_juntos']} suelta={r['yaw_suelta']} solo={r['yaw_solo']} antes-giro={r['yaw0']} -> {r['yaw_giro']} | pasos juntos={r['pasos_juntos']} solo={r['pasos_solo']} | {r['pasos_fot']} pasos/fot, {r['ms_fot']} ms/fot, rodeos {r['rodeos']} | gl={r['gl']} {r['fails']}")
