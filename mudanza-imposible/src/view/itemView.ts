import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { ItemBox, ItemDef } from '../sim/items';
import { mat, PALETTE } from './materials';
import { awningTex, signTex, TEX } from './textures';

// Dibujo procedural de los objetos del catálogo a partir de su `ItemDef` (el sofá tiene el suyo, `SofaView`, también a
// partir de su definición), según la dirección artística: maqueta de juguete, piezas gruesas de cantos redondeados, un
// color principal y un acento por objeto, contorno oscuro y la planta reconocible desde la cámara (cinta de la caja,
// tablero de madera de la mesa, pantalla cónica de la lámpara, puerta blanca de la nevera con tirador, tapa negra y
// teclado del piano).
//
// Lo dibujado es lo que choca: cada pieza va dentro de las cajas de su forma (`ItemDef.shape`, de las que salen todas las
// medidas) y los detalles (cinta, tiradores, teclas, pegatinas, parches) van pegados a sus caras, a menos de
// `DETAIL` m. Lo comprueba `tests/coherence.test.ts`. El contorno (`ink`) es el trazo de dibujo animado, por fuera.

/** Lo más que un detalle sobresale de las cajas de choque (m). */
export const DETAIL = 0.03;

const C = {
  honey: '#c98b52', honeyLight: '#e0b07c', woodDark: '#8a5a3c', mustard: '#e0a526', cream: '#efe3c8',
  enamel: '#f4f1ea', cardboard: '#c8a26b', cardboardDark: '#ad8853', tape: '#e8d7a8', darkMetal: '#374151',
  steel: '#a3aab5', brass: '#d4a24c', lacquer: '#1d1a26', ivory: '#fbf6e9', red: '#dc2626',
};

const inkMat = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });

const rbox = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));

/** Pieza con contorno de dibujo animado (copia por detrás, `ink` m más gruesa por cada lado; 0: sin contorno). */
function piece(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, ink = 0.02) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  if (ink) {
    geo.computeBoundingBox();
    const s = geo.boundingBox!.getSize(new THREE.Vector3());
    const o = new THREE.Mesh(geo, inkMat);
    o.scale.set(1 + (2 * ink) / Math.max(s.x, 0.01), 1 + (2 * ink) / Math.max(s.y, 0.01), 1 + (2 * ink) / Math.max(s.z, 0.01));
    o.userData.ink = true;
    mesh.add(o);
  }
  parent.add(mesh);
  return mesh;
}

/** Medidas de una caja de la forma: ancho, alto, fondo, centro y radio del borde. */
const dims = (b: ItemBox) => ({ w: b.h.x * 2, h: b.h.y * 2, d: b.h.z * 2, x: b.p.x, y: b.p.y, z: b.p.z, r: b.round ?? 0, top: b.p.y + b.h.y, bottom: b.p.y - b.h.y });

/** Caja de cartón: cinta que cierra las solapas (y baja por los extremos), asideros troquelados y rótulo de mudanza. */
function caja(g: THREE.Group, def: ItemDef) {
  const b = dims(def.shape[0]);
  piece(g, rbox(b.w, b.h, b.d, b.r), mat(C.cardboard, { rough: 0.95 }), b.x, b.y, b.z, 0.022);
  const tape = mat(C.tape, { rough: 0.55 });
  // Junta de las solapas (a lo largo de x) y la cinta encima, que baja por las dos caras de los extremos
  piece(g, new THREE.BoxGeometry(b.w * 0.94, 0.004, 0.012), mat(C.cardboardDark), b.x, b.top + 0.001, b.z, 0);
  piece(g, new THREE.BoxGeometry(b.w + 0.008, 0.008, 0.1), tape, b.x, b.top + 0.004, b.z, 0);
  for (const s of [-1, 1]) piece(g, new THREE.BoxGeometry(0.008, b.h * 0.32, 0.1), tape, b.x + s * (b.w / 2 + 0.004), b.top - b.h * 0.16, b.z, 0);
  // Asideros: ranuras oscuras en la cara de cada asa, por debajo de la cinta
  for (const h of def.handles) {
    if (Math.abs(h.out.x) < 0.5) continue;
    const s = Math.sign(h.out.x);
    piece(g, new RoundedBoxGeometry(0.006, 0.05, 0.15, 1, 0.003), mat('#4a3420'), b.x + s * (b.w / 2 + 0.003), Math.min(h.p.y, b.top - 0.06) - 0.04, b.z, 0);
  }
  // Rótulo en las dos caras grandes
  const label = mat('#ffffff', { map: signTex('MUDANZA', { bg: '#fdf6e7', color: '#7c3aed', w: 256, h: 96 }), rough: 0.8 });
  for (const s of [-1, 1]) {
    const p = piece(g, new THREE.PlaneGeometry(b.w * 0.62, b.h * 0.22), label, b.x, b.y - b.h * 0.08, b.z + s * (b.d / 2 + 0.004), 0);
    if (s < 0) p.rotation.y = Math.PI;
  }
}

/** Silla de madera miel: asiento con cojín mostaza, respaldo de barrotes y patas oscuras. */
function silla(g: THREE.Group, def: ItemDef) {
  const [seat, back, ...legs] = def.shape.map(dims);
  const wood = mat(C.honey, { rough: 0.7 }), dark = mat(C.woodDark, { rough: 0.7 });
  piece(g, rbox(seat.w, seat.h, seat.d, seat.r), wood, seat.x, seat.y, seat.z);
  piece(g, rbox(seat.w * 0.84, 0.034, seat.d * 0.8, 0.014), mat(C.mustard, { rough: 0.9 }), seat.x, seat.top + 0.012, seat.z + seat.d * 0.06, 0.012);
  // Respaldo: dos largueros, travesaño de arriba y tres barrotes, todo dentro de su caja
  const post = 0.05;
  for (const s of [-1, 1]) piece(g, rbox(post, back.h, back.d, 0.012), wood, back.x + s * (back.w / 2 - post / 2), back.y, back.z);
  const rail = 0.08;
  piece(g, rbox(back.w, rail, back.d, 0.015), wood, back.x, back.top - rail / 2, back.z);
  const slatH = back.h - rail - 0.04;
  for (const k of [-1, 0, 1]) piece(g, new THREE.BoxGeometry(0.035, slatH, back.d * 0.6), wood, back.x + k * back.w * 0.22, back.bottom + 0.02 + slatH / 2, back.z, 0.012);
  // Patas, algo más finas abajo
  for (const l of legs) piece(g, new THREE.CylinderGeometry(Math.min(l.w, l.d) / 2 - 0.004, Math.min(l.w, l.d) / 2 - 0.01, l.h, 8), dark, l.x, l.y, l.z, 0.012);
}

/** Lámpara de pie (frágil): base redonda oscura, pie fino, pantalla cónica de tela crema y franja roja y blanca. */
function lampara(g: THREE.Group, def: ItemDef) {
  const [base, pole, shade] = def.shape.map(dims);
  const metal = mat(C.darkMetal, { rough: 0.4, metal: 0.3 });
  const rb = Math.min(base.w, base.d) / 2;
  piece(g, new THREE.CylinderGeometry(rb * 0.92, rb, base.h, 24), metal, base.x, base.y, base.z, 0.015);
  piece(g, new THREE.CylinderGeometry(Math.min(pole.w, pole.d) / 2 * 0.85, Math.min(pole.w, pole.d) / 2 * 0.85, pole.h, 8), metal, pole.x, pole.y, pole.z, 0.01);
  const rs = Math.min(shade.w, shade.d) / 2;
  piece(g, new THREE.CylinderGeometry(rs * 0.6, rs, shade.h, 28), mat(C.cream, { map: TEX.fabric(), rough: 0.9 }), shade.x, shade.y, shade.z, 0.018);
  // Bombilla que asoma por debajo de la pantalla
  piece(g, new THREE.SphereGeometry(0.04, 12, 8), mat('#fff7cc', { emissive: '#fcd34d' }), shade.x, shade.bottom + 0.035, shade.z, 0);
  // Lo frágil lleva pegatina roja y blanca: franja alrededor del borde de la pantalla
  if (def.fragility) {
    const band = mat('#ffffff', { map: awningTex(C.red, '#ffffff'), rough: 0.7 });
    piece(g, new THREE.CylinderGeometry(rs * 0.93 + 0.004, rs + 0.004, 0.05, 28, 1, true), band, shade.x, shade.bottom + 0.025, shade.z, 0);
  }
}

/** Mesa de comedor: tablero de madera miel con camino de mesa, faldón fino y patas oscuras. */
function mesa(g: THREE.Group, def: ItemDef) {
  const [top, ...legs] = def.shape.map(dims);
  piece(g, rbox(top.w, top.h, top.d, top.r), mat('#ffffff', { map: TEX.planks(), rough: 0.7 }), top.x, top.y, top.z, 0.022);
  // Camino de mesa a lo largo, con dos rayas
  piece(g, new THREE.BoxGeometry(top.w * 0.86, 0.006, top.d * 0.3), mat(C.cream, { rough: 0.95 }), top.x, top.top + 0.003, top.z, 0);
  for (const s of [-1, 1]) piece(g, new THREE.BoxGeometry(top.w * 0.86, 0.007, 0.018), mat(C.red, { rough: 0.9 }), top.x, top.top + 0.0035, top.z + s * top.d * 0.11, 0);
  // Faldón bajo el tablero, entre las patas (2,5 cm bajo el tablero)
  const dark = mat(C.woodDark, { rough: 0.7 }), lx = Math.max(...legs.map((l) => Math.abs(l.x))), lz = Math.max(...legs.map((l) => Math.abs(l.z)));
  piece(g, new THREE.BoxGeometry(lx * 2, 0.025, 0.02), dark, top.x, top.bottom - 0.0125, top.z + lz, 0);
  piece(g, new THREE.BoxGeometry(lx * 2, 0.025, 0.02), dark, top.x, top.bottom - 0.0125, top.z - lz, 0);
  piece(g, new THREE.BoxGeometry(0.02, 0.025, lz * 2), dark, top.x + lx, top.bottom - 0.0125, top.z, 0);
  piece(g, new THREE.BoxGeometry(0.02, 0.025, lz * 2), dark, top.x - lx, top.bottom - 0.0125, top.z, 0);
  // Patas cuadradas, más finas abajo (lo pesado tiene la base oscura)
  for (const l of legs) {
    const half = Math.min(l.w, l.d) / 2;
    const leg = piece(g, new THREE.CylinderGeometry(half * Math.SQRT2 * 0.97, half * Math.SQRT2 * 0.7, l.h, 4), dark, l.x, l.y, l.z, 0.012);
    leg.rotation.y = Math.PI / 4;
  }
}

/** Nevera de metal esmaltado blanco: puerta del congelador y de abajo con tiradores, imanes y zócalo oscuro. */
function nevera(g: THREE.Group, def: ItemDef) {
  const b = dims(def.shape[0]);
  piece(g, rbox(b.w, b.h, b.d, b.r), mat(C.enamel, { rough: 0.35 }), b.x, b.y, b.z, 0.022);
  const front = b.z + b.d / 2;
  // Junta entre el congelador (arriba) y la puerta de abajo
  const split = b.top - b.h * 0.32;
  piece(g, new THREE.BoxGeometry(b.w * 0.94, 0.014, 0.006), mat('#9ca3af'), b.x, split, front + 0.003, 0);
  // Tiradores verticales junto al borde, uno por puerta
  const steel = mat(C.steel, { rough: 0.3, metal: 0.6 }), hx = b.x + b.w / 2 - 0.1;
  piece(g, new RoundedBoxGeometry(0.035, 0.16, 0.024, 1, 0.01), steel, hx, split + 0.11, front + 0.012, 0.008);
  piece(g, new RoundedBoxGeometry(0.035, 0.3, 0.024, 1, 0.01), steel, hx, split - 0.22, front + 0.012, 0.008);
  // Imanes de colores en la puerta del congelador
  [['#ef4444', -0.15, 0.06], ['#facc15', -0.05, 0.12], ['#14b8a6', -0.18, 0.18]].forEach(([c, dx, dy]) => {
    const m = piece(g, new THREE.CylinderGeometry(0.032, 0.032, 0.01, 12), mat(c as string, { rough: 0.5 }), b.x + (dx as number), split + (dy as number), front + 0.005, 0);
    m.rotation.x = Math.PI / 2;
  });
  // Zócalo oscuro (lo pesado tiene la base oscura)
  piece(g, rbox(b.w * 0.985, 0.08, b.d * 0.985, 0.02), mat(C.darkMetal, { rough: 0.6 }), b.x, b.bottom + 0.04, b.z, 0);
}

/** Piano de pared: caja de laca negra con tapa, teclado blanco y negro, partitura, placa dorada y pedales. */
function piano(g: THREE.Group, def: ItemDef) {
  const [body, shelf] = def.shape.map(dims);
  const lacquer = mat(C.lacquer, { rough: 0.28, metal: 0.1 });
  piece(g, rbox(body.w, body.h, body.d, body.r), lacquer, body.x, body.y, body.z, 0.022);
  piece(g, rbox(shelf.w, shelf.h, shelf.d, shelf.r), lacquer, shelf.x, shelf.y, shelf.z, 0.018);
  // Tapa: una tabla algo más clara por encima, que se lee desde arriba
  piece(g, rbox(body.w * 0.96, 0.012, body.d * 0.9, 0.005), mat('#3b3547', { rough: 0.25 }), body.x, body.top + 0.006, body.z, 0);
  // Teclado: teclas blancas y, por detrás, las negras en grupos de dos y tres
  const keysW = shelf.w * 0.92, front = body.z + body.d / 2;
  piece(g, new THREE.BoxGeometry(keysW, 0.012, shelf.d * 0.72), mat(C.ivory, { rough: 0.4 }), shelf.x, shelf.top + 0.004, shelf.z + shelf.d * 0.12, 0);
  const n = 21, black = mat('#0b0a10', { rough: 0.3 });
  for (let i = 0; i < n; i++) {
    if ([2, 6, 9, 13, 16, 20].includes(i)) continue;
    piece(g, new THREE.BoxGeometry(keysW / n * 0.5, 0.012, shelf.d * 0.38), black, shelf.x - keysW / 2 + (keysW * (i + 1)) / (n + 1), shelf.top + 0.016, shelf.z - shelf.d * 0.05, 0);
  }
  // Partitura apoyada y placa dorada con el nombre, en la cara de delante
  piece(g, new THREE.BoxGeometry(0.38, 0.24, 0.006), mat(C.ivory, { map: signTex('♪ ♫ ♪', { bg: '#fbf6e9', color: '#1d1a26', w: 256, h: 160 }), rough: 0.9 }), body.x, shelf.top + 0.24, front + 0.004, 0);
  piece(g, new THREE.BoxGeometry(0.2, 0.04, 0.006), mat(C.brass, { rough: 0.3, metal: 0.7 }), body.x, shelf.top + 0.07, front + 0.003, 0);
  // Pedales dorados abajo, y ruedas oscuras en las esquinas
  for (const k of [-1, 0, 1]) piece(g, new THREE.BoxGeometry(0.045, 0.018, 0.026), mat(C.brass, { rough: 0.3, metal: 0.7 }), body.x + k * 0.08, body.bottom + 0.07, front + 0.012, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = piece(g, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12), mat(C.darkMetal), body.x + sx * (body.w / 2 - 0.08), body.bottom + 0.04, body.z + sz * (body.d / 2 - 0.07), 0);
    w.rotation.z = Math.PI / 2;
  }
}

/** Modelo de cada clave de dibujo (`ItemDef.draw`). */
const BUILD: Record<string, (g: THREE.Group, def: ItemDef) => void> = { caja, silla, lampara, mesa, nevera, piano };

/** Lo que no tiene modelo propio: las cajas de su forma, tal cual. */
function plain(g: THREE.Group, def: ItemDef) {
  for (const b of def.shape.map(dims)) piece(g, b.r ? rbox(b.w, b.h, b.d, b.r) : new THREE.BoxGeometry(b.w, b.h, b.d), mat(C.cardboard), b.x, b.y, b.z);
}

export class ItemView {
  group = new THREE.Group();
  /** Hijo que se aplasta un instante al golpearse, sin tocar la transformación física. */
  private inner = new THREE.Group();
  private squash = 0;
  private squashV = 0;
  /** Parches de cinta americana que aparecen al dañarse (en lo alto de su pieza más grande). */
  private patches: THREE.Mesh[] = [];

  constructor(readonly def: ItemDef) {
    this.group.add(this.inner);
    (BUILD[def.draw] ?? plain)(this.inner, def);
    // Parches de cinta (solo en lo que se puede dañar), pegados a lo alto de su pieza más grande
    if (def.fragility) {
      const big = dims(def.shape.reduce((a, b) => (b.h.x * b.h.y * b.h.z > a.h.x * a.h.y * a.h.z ? b : a)));
      const tape = mat('#c0c4cc', { rough: 0.4 });
      for (const [fx, fz, r] of [[0.25, 0.2, 0.4], [-0.3, -0.1, -0.6], [0.0, 0.25, 1.1]] as const) {
        const p = piece(this.inner, new THREE.BoxGeometry(Math.min(0.32, big.w * 0.6), 0.01, Math.min(0.08, big.d * 0.3)), tape, big.x + fx * big.w * 0.5, big.top + 0.01, big.z + fz * big.d * 0.5, 0);
        p.rotation.y = r;
        p.visible = false;
        this.patches.push(p);
      }
    }
  }

  /** Golpe: se aplasta y rebota un instante. */
  bump(strength: number) { this.squashV -= Math.min(2.2, strength * 0.3); }

  sync(body: RAPIER.RigidBody, integrity = 100, dt = 1 / 60) {
    const p = body.translation(), q = body.rotation();
    this.group.position.set(p.x, p.y, p.z);
    this.group.quaternion.set(q.x, q.y, q.z, q.w);
    dt = Math.min(dt, 0.1);
    this.squashV += (-this.squash * 140 - this.squashV * 10) * dt;
    this.squash += this.squashV * dt;
    const sq = THREE.MathUtils.clamp(this.squash, -0.12, 0.12);
    this.inner.scale.set(1 - sq * 0.25, 1 + sq, 1 - sq * 0.25);
    const hurt = Math.ceil((100 - integrity) / 34);
    this.patches.forEach((m, i) => (m.visible = i < hurt));
  }
}
