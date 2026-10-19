# Verificación ui-audio-18: medidas del HUD en una captura real a 1280x720 (viewport de los scripts e2e, escala 1,
# así que 1 px de imagen = 1 px CSS). Busca tramos oscuros (paneles .pill, fondo rgba(31,22,51,.86)) en filas fijas.
# Uso (desde mudanza-imposible): python3 -I scripts/audit/verif-ui-audio/06-anchos-hud.py docs/capturas/duo/a2-uno-solo.jpg
import sys
from PIL import Image

img = Image.open(sys.argv[1]).convert('RGB')
W, H = img.size
print(f'imagen {W}x{H}')

def runs(y, thr=70, minlen=25, gap=6):
    out, start, last = [], None, None
    for x in range(W):
        r, g, b = img.getpixel((x, y))
        dark = (r + g + b) / 3 < thr and b >= r  # violeta muy oscuro de los paneles
        if dark:
            if start is None: start = x
            last = x
        elif start is not None and x - last > gap:
            if last - start >= minlen: out.append((start, last))
            start = None
    if start is not None and last - start >= minlen: out.append((start, last))
    return out

def vextent(x, y0, thr=70):
    top = y0
    while top > 0 and sum(img.getpixel((x, top - 1))) / 3 < thr: top -= 1
    bot = y0
    while bot < H - 1 and sum(img.getpixel((x, bot + 1))) / 3 < thr: bot += 1
    return top, bot

for y in (30, 40):
    rs = runs(y)
    print(f'fila y={y}: paneles superiores (x0-x1, ancho): ' + ', '.join(f'{a}-{b} ({b - a + 1})' for a, b in rs))
rs = runs(30)
if len(rs) >= 3:
    widths = [b - a + 1 for a, b in rs]
    t, bt = vextent((rs[0][0] + rs[0][1]) // 2, 30)
    need = sum(widths) + 10 * (len(widths) - 1) + 20
    print(f'suma de anchos {sum(widths)} px + huecos 10 px + márgenes 10+10 → la fila cabe sin partirse si la ventana mide ≥ ~{need} px')
    print(f'alto del panel de tiempo: y={t}..{bt} ({bt - t + 1} px); si la fila se parte, la 2.ª fila ocupa ~y={bt + 10}..{bt + 10 + bt - t} y #h-warn/#h-light empiezan en y=96')
for y in (681, 690):
    rs = runs(y)
    print(f'fila y={y}: paneles inferiores: ' + ', '.join(f'{a}-{b} ({b - a + 1})' for a, b in rs))
