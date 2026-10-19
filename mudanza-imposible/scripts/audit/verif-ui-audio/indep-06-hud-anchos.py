# Verificación independiente ui-audio-18: anchura real de las «pills» del HUD superior y del panel de jugador,
# medida en una captura 1:1 del juego (docs/capturas/duo/a2-uno-solo.jpg, viewport 1280x720 según duo-e2e.cjs:20).
# Las pills tienen fondo rgba(31,22,51,.86): píxeles muy oscuros (max(R,G,B) < 70). Se mide en filas donde no
# hay texto blanco que corte el tramo: y=45 (tiempo y etapas), y=30 (sofá), y=690 (paneles de jugador).
# Uso (desde mudanza-imposible): python3 -I scripts/audit/verif-ui-audio/indep-06-hud-anchos.py
from PIL import Image

im = Image.open('docs/capturas/duo/a2-uno-solo.jpg').convert('RGB')
W, H = im.size
px = im.load()

def segs(y, thr=70, gap=4, min_len=20):
    xs = [x for x in range(W) if max(px[x, y]) < thr]
    out, s, p = [], xs[0], xs[0]
    for x in xs[1:]:
        if x - p > gap:
            out.append((s, p)); s = x
        p = x
    out.append((s, p))
    return [(a, b) for a, b in out if b - a >= min_len]

def col(x, y1=0, y2=100, thr=70):
    ys = [y for y in range(y1, y2) if max(px[x, y]) < thr]
    return (ys[0], ys[-1]) if ys else None

print('captura', W, 'x', H)
r45, r30, r690 = segs(45), segs(30), segs(690)
print('y=45', r45, '\ny=30', r30, '\ny=690', r690)
t = next(s for s in r45 if s[0] < 40)
# la pill de etapas contiene «chips» más claros y el asfalto de detrás es gris oscuro (~80,80,90): se toma el primer
# y el último píxel «morado oscuro» del panel (azul - rojo >= 12 y rojo < 65) entre x=300 y 880
_xs = [x for x in range(300, 880) if px[x, 45][2] - px[x, 45][0] >= 12 and px[x, 45][0] < 65]
st = (_xs[0], _xs[-1])
so = next(s for s in r30 if s[1] > W - 40)
wt, ws, wf = t[1] - t[0] + 1, st[1] - st[0] + 1, so[1] - so[0] + 1
ht = col(60); hs = col(1100)
print(f'pills: tiempo {wt}px (x {t[0]}-{t[1]}), etapas {ws}px (x {st[0]}-{st[1]}), sofá {wf}px (x {so[0]}-{so[1]})')
print(f'alturas: tiempo y {ht}, sofá y {hs}')
need = wt + ws + wf + 2 * 10
print(f'#h-top (left/right 10px, gap 10px) cabe en una fila si 100vw-20 >= {need}: se parte por debajo de ~{need + 20}px')
rowh = max(ht[1] - ht[0] + 1, hs[1] - hs[0] + 1)
print(f'2.ª fila (sofá solo, alineado a la izquierda): y {10 + rowh + 10}-{10 + rowh + 10 + rowh}px; #h-warn/#h-light empiezan en y=96px')
print(f'por debajo de ~{wt + ws + 10 + 20}px también baja la pill de etapas ({ws}px, alineada a la izquierda)')
pl = [s for s in r690 if s[0] < 700]
print('paneles de jugador (y=690):', [(a, b, b - a + 1) for a, b in pl])
