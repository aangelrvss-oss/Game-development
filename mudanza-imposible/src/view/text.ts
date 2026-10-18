import * as THREE from 'three';

/** Cartel de texto siempre de cara a la cámara. La escala sale del tamaño del texto (1 unidad ≈ 100 px). */
export function textSprite(text: string, o: { size?: number; color?: string; bg?: string; pad?: number; font?: string } = {}): THREE.Sprite {
  const size = o.size ?? 48, pad = o.pad ?? 10;
  const font = `900 ${size}px ${o.font ?? 'system-ui, sans-serif'}`;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = Math.ceil(size * 1.25) + pad * 2;
  c.width = w; c.height = h;
  ctx.font = font;
  if (o.bg) {
    ctx.fillStyle = o.bg;
    const r = Math.min(h / 2, 18);
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, r);
    ctx.fill();
  }
  ctx.fillStyle = o.color ?? '#ffffff';
  ctx.textBaseline = 'middle';
  if (!o.bg) { ctx.lineWidth = size / 6; ctx.strokeStyle = 'rgba(30,20,50,0.85)'; ctx.strokeText(text, pad, h / 2); }
  ctx.fillText(text, pad, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  s.scale.set(w / 100, h / 100, 1);
  return s;
}
