import * as THREE from 'three';

// Texturas dibujadas en un canvas al arrancar: sin archivos externos y siempre iguales (azar con semilla).

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(size: number, draw: (ctx: CanvasRenderingContext2D, r: () => number, n: number) => void, seed = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, rng(seed), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Motas de color alrededor de un tono base. */
function speckle(ctx: CanvasRenderingContext2D, r: () => number, n: number, count: number, colors: string[], size: [number, number], alpha = 1) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = size[0] + r() * (size[1] - size[0]);
    ctx.fillRect(r() * n, r() * n, s, s);
  }
  ctx.globalAlpha = 1;
}

const cache = new Map<string, THREE.Texture>();
function get(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
}

/** Cada textura con el tamaño, en metros, que cubre una repetición. */
export const TEX = {
  grass: () => get('grass', () => canvas(256, (ctx, r, n) => {
    ctx.fillStyle = '#8fd16a'; ctx.fillRect(0, 0, n, n);
    // Franjas de césped cortado
    ctx.fillStyle = '#9ad874'; ctx.fillRect(0, 0, n, n / 2);
    speckle(ctx, r, n, 900, ['#7cc35a', '#a6e07f', '#86cb63', '#b4e68d'], [2, 4], 0.7);
    speckle(ctx, r, n, 14, ['#fff7d6', '#fde68a'], [3, 4]);
  }, 2)),
  grassTile: 4,
  asphalt: () => get('asphalt', () => canvas(256, (ctx, r, n) => {
    ctx.fillStyle = '#4b505d'; ctx.fillRect(0, 0, n, n);
    speckle(ctx, r, n, 2600, ['#565b68', '#424754', '#5f6472', '#3c414d'], [1, 3], 0.9);
    ctx.strokeStyle = 'rgba(30,32,40,0.55)'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      let x = r() * n, y = r() * n;
      ctx.moveTo(x, y);
      for (let i = 0; i < 6; i++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, 3)),
  asphaltTile: 3,
  sidewalk: () => get('sidewalk', () => canvas(256, (ctx, r, n) => {
    ctx.fillStyle = '#b9b3aa'; ctx.fillRect(0, 0, n, n);
    const k = n / 4;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = 214 + Math.floor(r() * 14);
      ctx.fillStyle = `rgb(${v},${v - 4},${v - 11})`;
      ctx.fillRect(i * k + 2, j * k + 2, k - 4, k - 4);
    }
    speckle(ctx, r, n, 500, ['#c9c3ba', '#e6e1d8'], [1, 2], 0.6);
  }, 4)),
  sidewalkTile: 2,
  planks: () => get('planks', () => canvas(256, (ctx, r, n) => {
    const rows = 8, h = n / rows;
    for (let j = 0; j < rows; j++) {
      const off = r() * n;
      for (let x = -n; x < n; x += n / 2) {
        const v = r();
        ctx.fillStyle = `hsl(28, ${45 + v * 15}%, ${52 + v * 10}%)`;
        ctx.fillRect(x + off - n, j * h, n / 2, h);
        ctx.fillRect(x + off, j * h, n / 2, h);
        ctx.fillStyle = 'rgba(90,50,20,0.55)';
        ctx.fillRect(x + off, j * h, 2, h);
      }
      ctx.fillStyle = 'rgba(80,45,20,0.6)';
      ctx.fillRect(0, j * h, n, 2);
      // Vetas
      ctx.strokeStyle = 'rgba(120,70,30,0.25)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const y = j * h + 4 + r() * (h - 8);
        ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x <= n; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 1.5);
        ctx.stroke();
      }
    }
  }, 5)),
  planksTile: 1.8,
  brick: () => get('brick', () => canvas(256, (ctx, r, n) => {
    ctx.fillStyle = '#f3dccb'; ctx.fillRect(0, 0, n, n);
    const rows = 8, h = n / rows, w = n / 4;
    for (let j = 0; j < rows; j++) for (let i = -1; i < 5; i++) {
      const x = i * w + (j % 2 ? w / 2 : 0);
      const v = r();
      ctx.fillStyle = `hsl(${10 + v * 8}, ${62 + v * 10}%, ${66 + v * 8}%)`;
      ctx.fillRect(x + 3, j * h + 3, w - 6, h - 6);
    }
  }, 6)),
  brickTile: 1.4,
  plaster: () => get('plaster', () => canvas(128, (ctx, r, n) => {
    ctx.fillStyle = '#fbe9c9'; ctx.fillRect(0, 0, n, n);
    speckle(ctx, r, n, 700, ['#f3dfbc', '#fff3dc', '#f6e2c0'], [1, 3], 0.7);
  }, 7)),
  plasterTile: 2,
  roofTiles: () => get('roofTiles', () => canvas(256, (ctx, r, n) => {
    ctx.fillStyle = '#8a5546'; ctx.fillRect(0, 0, n, n);
    const rows = 8, h = n / rows, w = n / 8;
    for (let j = 0; j < rows; j++) for (let i = -1; i < 9; i++) {
      const x = i * w + (j % 2 ? w / 2 : 0), v = r();
      const g = ctx.createLinearGradient(0, j * h, 0, j * h + h);
      g.addColorStop(0, `hsl(${14 + v * 6}, 38%, ${54 + v * 8}%)`);
      g.addColorStop(1, `hsl(${12 + v * 6}, 38%, ${42 + v * 6}%)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(x + 1.5, j * h + 1, w - 3, h - 2, [0, 0, 8, 8]); ctx.fill();
    }
  }, 8)),
  roofTilesTile: 2.2,
  metal: () => get('metal', () => canvas(128, (ctx, _r, n) => {
    ctx.fillStyle = '#9aa7b8'; ctx.fillRect(0, 0, n, n);
    // Chapa lagrimada
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.translate(i * 16 + 8, j * 16 + 8);
      ctx.rotate((i + j) % 2 ? Math.PI / 4 : -Math.PI / 4);
      ctx.fillStyle = '#c3ccd8'; ctx.fillRect(-6, -1.5, 12, 3);
      ctx.fillStyle = '#7d8a9b'; ctx.fillRect(-6, 1.5, 12, 1.2);
      ctx.restore();
    }
  }, 9)),
  metalTile: 1,
  hedge: () => get('hedge', () => canvas(128, (ctx, r, n) => {
    ctx.fillStyle = '#3f9d4b'; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = ['#358a40', '#4cb058', '#2f7a39', '#5abd63'][Math.floor(r() * 4)];
      ctx.beginPath(); ctx.arc(r() * n, r() * n, 3 + r() * 6, 0, Math.PI * 2); ctx.fill();
    }
  }, 10)),
  hedgeTile: 1.5,
  fabric: () => get('fabric', () => canvas(128, (ctx, r, n) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, n, n);
    // Trama de tela: líneas cruzadas muy suaves
    for (let i = 0; i < n; i += 2) {
      ctx.fillStyle = `rgba(120,100,70,${0.05 + r() * 0.05})`;
      ctx.fillRect(i, 0, 1, n);
      ctx.fillStyle = `rgba(120,100,70,${0.04 + r() * 0.04})`;
      ctx.fillRect(0, i, n, 1);
    }
  }, 11)),
};

/**
 * Coordenadas de textura según la posición en el mundo (proyección por caras), para que los
 * ladrillos, tablas y baldosas tengan el mismo tamaño en cajas de cualquier medida.
 */
export function worldUV(geo: THREE.BufferGeometry, offset: THREE.Vector3, tile: number) {
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset.x, y = pos.getY(i) + offset.y, z = pos.getZ(i) + offset.z;
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    let u: number, v: number;
    if (ny > 0.5) { u = x; v = z; } else if (nx > 0.5) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Fachada con ventanas y persianas: una ventana por repetición (3 m × 3 m, una planta). */
export function windowsTex(wall: string, shutter: string, seed = 12) {
  return get(`win|${wall}|${shutter}`, () => canvas(128, (ctx, r, n) => {
    ctx.fillStyle = wall; ctx.fillRect(0, 0, n, n);
    speckle(ctx, r, n, 260, ['rgba(255,255,255,0.25)', 'rgba(0,0,0,0.06)'], [1, 3]);
    // Línea de forjado
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, n - 6, n, 6);
    const wx = 38, wy = 30, ww = 52, wh = 62;
    ctx.fillStyle = shutter; ctx.fillRect(wx - 14, wy, 12, wh); ctx.fillRect(wx + ww + 2, wy, 12, wh);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    for (let y = wy + 4; y < wy + wh; y += 6) { ctx.fillRect(wx - 14, y, 12, 1.5); ctx.fillRect(wx + ww + 2, y, 12, 1.5); }
    ctx.fillStyle = '#fdf6e7'; ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0, '#9dd3f2'); g.addColorStop(1, '#4f8fc0');
    ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.moveTo(wx + 6, wy + wh - 6); ctx.lineTo(wx + 20, wy + 6); ctx.lineTo(wx + 28, wy + 6); ctx.lineTo(wx + 14, wy + wh - 6); ctx.fill();
    ctx.fillStyle = '#fdf6e7'; ctx.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
    // Alféizar y, a veces, maceta con flores
    ctx.fillStyle = '#e8dcc8'; ctx.fillRect(wx - 6, wy + wh + 3, ww + 12, 5);
    if (r() < 0.6) {
      ctx.fillStyle = '#c2410c'; ctx.fillRect(wx + 4, wy + wh - 4, ww - 8, 7);
      for (let i = 0; i < 7; i++) { ctx.fillStyle = ['#f472b6', '#ef4444', '#facc15', '#ffffff'][Math.floor(r() * 4)]; ctx.beginPath(); ctx.arc(wx + 8 + i * 6.5, wy + wh - 6, 3, 0, Math.PI * 2); ctx.fill(); }
    }
  }, seed));
}

/** Cartel de texto pintado en un plano (no flota delante de todo como los sprites). */
export function signTex(text: string, o: { bg: string; color: string; w?: number; h?: number; stripes?: boolean }) {
  return get(`sign|${text}|${o.bg}|${o.color}|${o.stripes ? 1 : 0}`, () => {
    const w = o.w ?? 512, h = o.h ?? 128;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = o.bg; ctx.fillRect(0, 0, w, h);
    if (o.stripes) {
      ctx.fillStyle = '#111827';
      for (let x = -h; x < w + h; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 24, 0); ctx.lineTo(x + 24 - 14, 14); ctx.lineTo(x - 14, 14); ctx.fill(); ctx.beginPath(); ctx.moveTo(x, h - 14); ctx.lineTo(x + 24, h - 14); ctx.lineTo(x + 10, h); ctx.lineTo(x - 14, h); ctx.fill(); }
    }
    ctx.fillStyle = o.color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let size = h * 0.5;
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    while (ctx.measureText(text).width > w * 0.9 && size > 10) { size -= 2; ctx.font = `900 ${size}px system-ui, sans-serif`; }
    ctx.fillText(text, w / 2, h / 2 + 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
}

/** Toldo a rayas. */
export function awningTex(a: string, b: string) {
  return get(`awn|${a}|${b}`, () => canvas(64, (ctx, _r, n) => {
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? a : b; ctx.fillRect(i * n / 8, 0, n / 8, n); }
  }));
}
