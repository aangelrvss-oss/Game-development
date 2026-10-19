import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { STAIRS, FLOOR2, DOOR } from '../sim/level';
import { PROPS, type Prop } from '../sim/props';
import { mat } from './materials';
import { signTex } from './textures';

// Decoración del escenario: los objetos de `PROPS` (con choque en la simulación) y detalles planos o fuera de
// alcance (suelo del portal, apliques, alfombra y pasamanos de la escalera, cuadros, banderines del camión).
// Geometría sencilla y materiales compartidos de una paleta corta: al construir el nivel se funde todo lo
// estático por material, así que añade pocas llamadas de dibujo.

const C = {
  kraft: '#c8a26b', kraftDark: '#b08752', tape: '#a07a46', wood: '#b7793f', woodDark: '#8a5a3c', metal: '#5f7391',
  dark: '#374151', red: '#ef4444', purple: '#7c3aed', yellow: '#facc15', green: '#16a34a', teal: '#14b8a6',
  cream: '#fdf6e7', terracotta: '#c2410c', leaf: '#4caf50', leafLight: '#7cb342', mustard: '#e0a526', blue: '#2563eb',
  orange: '#f97316', white: '#f8fafc',
};
const M = (c: string, o: Parameters<typeof mat>[1] = {}) => mat(c, o);
/** Material de dos caras (banderines, sombrilla), con caché propia para no tocar los compartidos. */
const twoSided = new Map<string, THREE.MeshStandardMaterial>();
const M2 = (c: string) => {
  let m = twoSided.get(c);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide }); twoSided.set(c, m); }
  return m;
};

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}
const rbox = (w: number, h: number, d: number, r = 0.03) => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2));

/** Caja de cartón con cinta (y a veces una pegatina de «FRÁGIL») apoyada en `y`. */
function cardboard(g: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, fragile = false, dark = false) {
  const b = new THREE.Group();
  b.add(mesh(rbox(w, h, d), M(dark ? C.kraftDark : C.kraft, { rough: 0.95 }), 0, h / 2, 0));
  b.add(mesh(new THREE.BoxGeometry(w + 0.01, 0.012, 0.11), M(C.tape, { rough: 0.6 }), 0, h + 0.002, 0, false));
  b.add(mesh(new THREE.BoxGeometry(0.11, h * 0.35, d + 0.01), M(C.tape, { rough: 0.6 }), 0, h - h * 0.175, 0, false));
  if (fragile) {
    const s = mesh(new THREE.PlaneGeometry(w * 0.55, h * 0.3), M('#ffffff', { map: signTex('FRÁGIL', { bg: '#fef2f2', color: '#dc2626', w: 256, h: 96 }), rough: 0.7 }), 0, h * 0.5, d / 2 + 0.006, false);
    b.add(s);
  }
  b.position.set(x, y, z);
  b.rotation.y = ry;
  g.add(b);
  return b;
}

const build: Record<Prop['type'], (g: THREE.Group) => void> = {
  boxes(g) {
    cardboard(g, 0.62, 0.45, 0.5, -0.33, 0, 0, 0.05, true);
    cardboard(g, 0.6, 0.42, 0.5, 0.34, 0, 0.02, -0.08, false, true);
    cardboard(g, 0.5, 0.38, 0.42, -0.05, 0.45, 0, 0.3);
  },
  boxesTall(g) {
    cardboard(g, 0.7, 0.5, 0.5, -0.38, 0, -0.2, 0, false, true);
    cardboard(g, 0.68, 0.48, 0.5, 0.36, 0, -0.22, 0.06, true);
    cardboard(g, 0.55, 0.4, 0.45, -0.4, 0, 0.28, -0.12);
    cardboard(g, 0.66, 0.42, 0.48, -0.32, 0.5, -0.18, 0.1);
    cardboard(g, 0.55, 0.4, 0.45, 0.32, 0.48, -0.2, -0.15, false, true);
    cardboard(g, 0.5, 0.36, 0.42, -0.25, 0.92, -0.15, 0.25, true);
  },
  armchair(g) {
    const fab = M(C.mustard, { rough: 0.9 });
    g.add(mesh(rbox(0.9, 0.3, 0.8, 0.08), fab, 0, 0.3, 0));
    g.add(mesh(rbox(0.9, 0.55, 0.2, 0.08), fab, 0, 0.62, -0.32));
    for (const s of [-1, 1]) g.add(mesh(rbox(0.16, 0.42, 0.78, 0.07), fab, s * 0.42, 0.45, 0));
    g.add(mesh(rbox(0.6, 0.12, 0.55, 0.05), M('#f1c35d', { rough: 0.9 }), 0, 0.5, 0.06));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.16, 6), M(C.woodDark), sx * 0.36, 0.08, sz * 0.3));
    // Etiqueta de mudanza colgada del brazo
    const tag = mesh(new THREE.PlaneGeometry(0.22, 0.12), M('#ffffff', { map: signTex('SALÓN', { bg: '#ede9fe', color: C.purple, w: 256, h: 128 }) }), 0.51, 0.55, 0.2, false);
    tag.rotation.y = Math.PI / 2;
    g.add(tag);
  },
  floorLamp(g) {
    g.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.05, 14), M(C.dark), 0, 0.025, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.35, 6), M(C.dark), 0, 0.7, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.27, 0.32, 14, 1, true), M(C.cream, { rough: 0.8 }), 0, 1.45, 0));
  },
  rug(g) {
    const r = mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.9, 12), M('#b91c1c', { rough: 0.95 }), 0, 0.18, 0);
    r.rotation.x = Math.PI / 2;
    g.add(r);
    for (const s of [-1, 1]) {
      const e = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.01, 12), M('#fcd34d', { rough: 0.95 }), 0, 0.18, s * 0.951, false);
      e.rotation.x = Math.PI / 2;
      g.add(e);
    }
    for (const z of [-0.45, 0.45]) {
      const band = mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.06, 12), M(C.tape), 0, 0.18, z, false);
      band.rotation.x = Math.PI / 2;
      g.add(band);
    }
  },
  handTruck(g) {
    const m = M(C.red, { rough: 0.5 });
    for (const s of [-1, 1]) {
      const rail = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.15, 6), m, s * 0.2, 0.65, -0.05);
      rail.rotation.x = -0.12;
      g.add(rail);
      const w = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12), M('#111827'), s * 0.24, 0.12, -0.12);
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
    g.add(mesh(new THREE.BoxGeometry(0.46, 0.03, 0.22), M(C.metal, { metal: 0.4, rough: 0.4 }), 0, 0.03, 0.06));
    const bar = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.44, 6), m, 0, 1.2, -0.12);
    bar.rotation.z = Math.PI / 2;
    g.add(bar);
    cardboard(g, 0.42, 0.4, 0.34, 0, 0.05, 0.08, 0, true);
  },
  wheelbarrow(g) {
    const tray = mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.3, 4, 1), M(C.green, { rough: 0.5 }), 0, 0.42, 0.05);
    tray.rotation.y = Math.PI / 4;
    tray.scale.set(1, 1, 1.35);
    g.add(tray);
    g.add(mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M('#6b4423', { rough: 1 }), 0, 0.5, 0.05, false));
    const w = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 12), M('#111827'), 0, 0.17, 0.62);
    w.rotation.z = Math.PI / 2;
    g.add(w);
    for (const s of [-1, 1]) {
      const h = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), M(C.metal), s * 0.24, 0.42, -0.3);
      h.rotation.x = Math.PI / 2 - 0.25;
      g.add(h);
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), M(C.metal), s * 0.2, 0.15, -0.2));
    }
    for (const [x, z, c] of [[-0.1, 0.0, '#f472b6'], [0.12, 0.12, '#facc15'], [0.0, -0.12, C.leafLight]] as const) g.add(mesh(new THREE.IcosahedronGeometry(0.13, 0), M(c), x, 0.68, z));
  },
  wateringCan(g) {
    const m = M(C.teal, { rough: 0.45, metal: 0.2 });
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.28, 12), m, 0, 0.14, 0));
    const sp = mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.32, 6), m, 0.18, 0.24, 0);
    sp.rotation.z = -0.9;
    g.add(sp);
    const h = mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 12, Math.PI), m, -0.02, 0.3, 0);
    g.add(h);
  },
  rake(g) {
    const r = new THREE.Group();
    r.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6), M(C.wood), 0, 0.75, 0));
    r.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.45), M(C.metal), 0, 0.03, 0));
    r.rotation.z = 0.28;
    r.position.x = -0.18;
    g.add(r);
  },
  hoseReel(g) {
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.05, 0.36), M(C.dark), 0, 0.025, 0));
    for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.04, 0.5, 0.06), M(C.dark), s * 0.22, 0.27, 0));
    for (let i = 0; i < 3; i++) {
      const t = mesh(new THREE.TorusGeometry(0.17 - i * 0.03, 0.035, 6, 16), M(C.green, { rough: 0.5 }), 0, 0.33, 0);
      t.rotation.y = Math.PI / 2;
      t.scale.z = 1 + i * 0.4;
      g.add(t);
    }
  },
  mailbox(g) {
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.95, 6), M(C.woodDark), 0, 0.47, 0));
    g.add(mesh(rbox(0.26, 0.28, 0.46, 0.1), M(C.blue, { rough: 0.45 }), 0, 1.08, 0));
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.2, 0.08), M(C.red), 0.15, 1.2, 0.08));
  },
  saleSign(g) {
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.95, 0.06), M(C.wood), 0, 0.47, 0));
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.42, 0.04), M('#ffffff', { map: signTex('¡NOS MUDAMOS!', { bg: '#ffffff', color: C.purple, w: 512, h: 256 }), rough: 0.7 }), 0, 0.82, 0.04));
  },
  containers(g) {
    const cols: [string, string][] = [['#15803d', '#166534'], ['#1d4ed8', '#1e40af'], ['#eab308', '#ca8a04']];
    cols.forEach(([body, lid], i) => {
      const x = (i - 1) * 1.17;
      g.add(mesh(rbox(1.05, 1.1, 0.85, 0.08), M(body, { rough: 0.55 }), x, 0.6, 0));
      g.add(mesh(rbox(1.1, 0.1, 0.9, 0.04), M(lid, { rough: 0.5 }), x, 1.19, 0));
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.08, 0.01), M('#f8fafc'), x, 0.85, 0.43, false));
      for (const s of [-1, 1]) {
        const w = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), M('#111827'), x + s * 0.38, 0.06, 0.3);
        w.rotation.z = Math.PI / 2;
        g.add(w);
      }
    });
  },
  bikeRack(g) {
    const steel = M('#9ca3af', { rough: 0.35, metal: 0.5 });
    for (const x of [-0.6, 0, 0.6]) g.add(mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 14, Math.PI), steel, x, 0.02, 0));
    // Bicicleta apoyada
    const bike = new THREE.Group();
    const tyre = M('#111827');
    for (const s of [-1, 1]) {
      const w = mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 18), tyre, s * 0.5, 0.33, 0);
      bike.add(w);
    }
    const frame = M('#06b6d4', { rough: 0.4 });
    const tube = (x0: number, y0: number, x1: number, y1: number) => {
      const l = Math.hypot(x1 - x0, y1 - y0);
      const t = mesh(new THREE.CylinderGeometry(0.022, 0.022, l, 6), frame, (x0 + x1) / 2, (y0 + y1) / 2, 0);
      t.rotation.z = Math.atan2(x0 - x1, y1 - y0);
      bike.add(t);
    };
    tube(-0.5, 0.33, -0.05, 0.36); tube(-0.05, 0.36, 0.3, 0.72); tube(-0.5, 0.33, -0.15, 0.72); tube(-0.15, 0.72, 0.3, 0.72); tube(0.5, 0.33, 0.33, 0.85); tube(-0.05, 0.36, -0.18, 0.78);
    bike.add(mesh(rbox(0.22, 0.05, 0.1, 0.02), M('#111827'), -0.18, 0.8, 0));
    const bar = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), M('#111827'), 0.33, 0.87, 0);
    bar.rotation.x = Math.PI / 2;
    bike.add(bar);
    bike.position.set(0.05, 0, 0.12);
    g.add(bike);
  },
  streetSign(g) {
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 8), M(C.metal, { rough: 0.5 }), 0, 1.2, 0));
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.3, 0.04), M('#ffffff', { map: signTex('C/ DEL SOFÁ', { bg: '#1e3a8a', color: '#ffffff', w: 512, h: 140 }), rough: 0.5 }), 0.4, 2.2, 0));
  },
  planter(g) {
    g.add(mesh(rbox(1.0, 0.5, 0.5, 0.04), M(C.wood, { rough: 0.8 }), 0, 0.25, 0));
    for (const [x, s, c] of [[-0.3, 0.26, C.leaf], [0.05, 0.3, C.leafLight], [0.32, 0.24, C.leaf]] as const) g.add(mesh(new THREE.IcosahedronGeometry(s, 1), M(c), x, 0.62, 0));
    for (const [x, c] of [[-0.12, '#f472b6'], [0.2, '#facc15'], [0.42, '#ffffff']] as const) g.add(mesh(new THREE.IcosahedronGeometry(0.08, 0), M(c), x, 0.85, 0.12));
  },
  cafe(g) {
    const tableM = M(C.white, { rough: 0.4 });
    g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 16), tableM, 0, 0.74, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6), M(C.dark), 0, 0.37, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.03, 12), M(C.dark), 0, 0.015, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 6), M(C.dark), 0, 1.1, 0));
    g.add(mesh(new THREE.ConeGeometry(1.0, 0.45, 8, 1, true), M2('#fb7185'), 0, 2.25, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10), M(C.cream), 0.1, 0.79, 0.05));
    for (const s of [-1, 1]) {
      const ch = new THREE.Group();
      ch.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12), M('#0ea5e9', { rough: 0.5 }), 0, 0.45, 0));
      ch.add(mesh(new THREE.BoxGeometry(0.36, 0.34, 0.04), M('#0ea5e9', { rough: 0.5 }), 0, 0.68, s * 0.18));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) ch.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 5), M(C.dark), sx * 0.13, 0.22, sz * 0.13));
      ch.position.set(0, 0, s * 0.55);
      g.add(ch);
    }
  },
  scooter(g) {
    const body = M('#5eead4', { rough: 0.4 });
    g.add(mesh(rbox(0.9, 0.3, 0.32, 0.12), body, 0, 0.45, 0));
    g.add(mesh(rbox(0.36, 0.1, 0.26, 0.05), M('#3f2a1f', { rough: 0.7 }), -0.12, 0.65, 0));
    g.add(mesh(rbox(0.12, 0.55, 0.3, 0.05), body, 0.42, 0.62, 0));
    const bar = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), M('#111827'), 0.46, 0.95, 0);
    bar.rotation.x = Math.PI / 2;
    g.add(bar);
    g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), M('#fef9c3', { emissive: '#a16207' }), 0.52, 0.85, 0, false));
    for (const x of [-0.36, 0.42]) {
      const w = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 14), M('#111827'), x, 0.17, 0);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
  },
  crossingSign(g) {
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.3, 8), M(C.metal, { rough: 0.5 }), 0, 1.15, 0));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.03), M('#1d4ed8', { rough: 0.5 }), 0, 2.15, 0.03));
    const tri = mesh(new THREE.CircleGeometry(0.2, 3), M('#ffffff'), 0, 2.13, 0.05, false);
    tri.rotation.z = Math.PI / 2;
    g.add(tri);
    g.add(mesh(new THREE.CapsuleGeometry(0.025, 0.1, 3, 6), M('#111827'), 0, 2.12, 0.055, false));
  },
  plant(g) {
    g.add(mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.42, 12), M(C.terracotta), 0, 0.21, 0));
    for (const [x, y, z, s, c] of [[0, 0.75, 0, 0.3, C.leaf], [0.15, 0.62, 0.1, 0.22, C.leafLight], [-0.14, 0.66, -0.08, 0.24, C.leaf], [0, 1.0, 0.02, 0.2, C.leafLight]] as const) g.add(mesh(new THREE.IcosahedronGeometry(s, 1), M(c), x, y, z));
  },
  pallet(g) {
    const w = M(C.wood, { rough: 0.9 });
    for (const z of [-0.5, 0, 0.5]) g.add(mesh(new THREE.BoxGeometry(1.9, 0.1, 0.12), w, 0, 0.05, z));
    for (let i = 0; i < 7; i++) g.add(mesh(new THREE.BoxGeometry(0.22, 0.03, 1.2), w, -0.86 + i * 0.287, 0.115, 0));
    cardboard(g, 0.62, 0.48, 0.55, -0.6, 0.13, -0.28, 0, true);
    cardboard(g, 0.62, 0.48, 0.55, 0.05, 0.13, -0.28, 0.04, false, true);
    cardboard(g, 0.62, 0.48, 0.55, 0.66, 0.13, -0.26, -0.03);
    cardboard(g, 0.6, 0.44, 0.5, -0.58, 0.13, 0.3, 0.05, false, true);
    cardboard(g, 0.6, 0.44, 0.5, 0.3, 0.13, 0.28, 0, true);
    cardboard(g, 0.56, 0.42, 0.5, -0.3, 0.61, -0.25, 0.2);
    cardboard(g, 0.52, 0.4, 0.45, 0.4, 0.61, -0.2, -0.1, false, true);
  },
  cone(g) {
    g.add(mesh(new THREE.BoxGeometry(0.36, 0.04, 0.36), M(C.orange, { rough: 0.6 }), 0, 0.02, 0));
    g.add(mesh(new THREE.ConeGeometry(0.15, 0.55, 12), M(C.orange, { rough: 0.6 }), 0, 0.31, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.09, 12), M('#ffffff'), 0, 0.3, 0, false));
  },
  flagPole(g) {
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 8), M(C.white, { rough: 0.5 }), 0, 1.6, 0));
    g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), M(C.yellow), 0, 3.24, 0));
  },
};

/** Banderines de colores entre dos puntos, con algo de comba. */
function bunting(g: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, n: number) {
  const line = M('#f8fafc');
  const cols = [C.red, C.yellow, C.purple, C.teal, C.orange, '#ec4899'];
  const at = (t: number) => a.clone().lerp(b, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * 0.45, 0));
  for (let i = 0; i < n; i++) {
    const p0 = at(i / n), p1 = at((i + 1) / n);
    const seg = mesh(new THREE.CylinderGeometry(0.01, 0.01, p0.distanceTo(p1), 4), line, 0, 0, 0, false);
    seg.position.copy(p0).lerp(p1, 0.5);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
    g.add(seg);
    const f = mesh(new THREE.CircleGeometry(0.26, 3), M2(cols[i % cols.length]), 0, 0, 0, false);
    const mid = p0.clone().lerp(p1, 0.5);
    f.position.set(mid.x, mid.y - 0.2, mid.z);
    f.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2, -Math.PI / 2);
    g.add(f);
  }
}

let checker: THREE.CanvasTexture | null = null;
function checkerTex() {
  if (checker) return checker;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#2f3e46' : '#f1ece2'; ctx.fillRect(i * 32, j * 32, 32, 32); }
  checker = new THREE.CanvasTexture(c);
  checker.colorSpace = THREE.SRGBColorSpace;
  checker.wrapS = checker.wrapT = THREE.RepeatWrapping;
  checker.magFilter = THREE.NearestFilter;
  checker.anisotropy = 8;
  return checker;
}

/** Aplique de pared cálido: semicilindro y bombilla que brilla (sin luz real: no cuesta sombras). */
function sconce(g: THREE.Group, x: number, y: number, z: number, nx: number, nz: number) {
  const base = mesh(new THREE.BoxGeometry(0.14, 0.24, 0.04), M('#b45309', { metal: 0.5, rough: 0.35 }), x, y, z, false);
  base.rotation.y = Math.atan2(nx, nz);
  g.add(base);
  g.add(mesh(new THREE.SphereGeometry(0.1, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#fff4cc', { emissive: '#fbbf24' }), x + nx * 0.08, y + 0.02, z + nz * 0.08, false));
}

/** Detalles sin choque: casa, portal, escalera, planta de arriba, calle y entrega. */
function addDetails(g: THREE.Group) {
  // Casa: felpudo, aplique sobre la puerta y jardineras bajo las ventanas
  g.add(mesh(new THREE.BoxGeometry(1.3, 0.02, 0.6), M('#ffffff', { map: signTex('BIENVENIDOS', { bg: '#92400e', color: '#fde68a', w: 512, h: 220 }), rough: 0.95 }), 0, 0.015, 16.45, false));
  sconce(g, 0, 2.45, 16.93, 0, -1);
  for (const x of [-6.5, -2.6, 2.6, 6.5]) {
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.18, 0.22), M(C.woodDark), x, 2.0, 16.88, false));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.IcosahedronGeometry(0.1, 0), M(['#f472b6', '#facc15', '#ef4444', '#ffffff'][(i + Math.round(x)) & 3]), x - 0.38 + i * 0.25, 2.15, 16.86, false));
  }
  // Portal del edificio: apliques a los lados de la puerta, suelo de baldosas a cuadros y buzones
  for (const x of [DOOR.x0 - 0.45, DOOR.x1 + 0.45]) sconce(g, x, 2.05, DOOR.z + 0.22, 0, 1);
  const tex = checkerTex().clone();
  tex.needsUpdate = true;
  tex.repeat.set(2.8 / 0.7, 8.2 / 0.7);
  g.add(mesh(new THREE.PlaneGeometry(2.78, 8.2), M('#ffffff', { map: tex, rough: 0.5 }), 0, 0.024, -17.8, false).rotateX(-Math.PI / 2));
  const brass = M('#b45309', { metal: 0.55, rough: 0.35 });
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const b = mesh(new THREE.BoxGeometry(0.04, 0.2, 0.26), brass, -1.38, 1.15 + j * 0.24, -15.2 - i * 0.3, false);
    g.add(b);
  }
  for (const z of [-16.6, -20.2]) for (const s of [-1, 1]) sconce(g, s * 1.38, 2.1, z, -s, 0);
  // Escalera: alfombra roja por el centro de los peldaños y pasamanos de madera en las dos paredes
  const n = 14, run = (STAIRS.z0 - STAIRS.z1) / n, rise = STAIRS.top / n;
  const carpet = M('#b91c1c', { rough: 0.95 });
  for (let i = 0; i < n; i++) g.add(mesh(new THREE.BoxGeometry(1.0, 0.012, run - 0.02), carpet, 0, rise * (i + 1) + 0.006, STAIRS.z0 - run * (i + 0.5), false));
  const len = Math.hypot(STAIRS.z0 - STAIRS.z1, STAIRS.top);
  for (const s of [-1, 1]) {
    const rail = mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 8), M(C.woodDark, { rough: 0.5 }), s * 1.37, STAIRS.top / 2 + 1.05, (STAIRS.z0 + STAIRS.z1) / 2, false);
    rail.rotation.x = Math.PI / 2 + Math.atan2(STAIRS.top, STAIRS.z0 - STAIRS.z1);
    g.add(rail);
  }
  // Planta de arriba: cuadros y apliques en la pared del pasillo (alterna colores de la paleta)
  const art: [string, string][] = [[C.teal, C.yellow], [C.purple, '#fb7185'], [C.orange, C.blue]];
  [2.6, 5.6, 8.4].forEach((x, i) => {
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.7, 0.04), M('#3f2a1f'), x, FLOOR2 + 1.2, -32.37, false));
    g.add(mesh(new THREE.BoxGeometry(0.76, 0.56, 0.02), M(art[i][0]), x, FLOOR2 + 1.2, -32.34, false));
    g.add(mesh(new THREE.CircleGeometry(0.16, 14), M(art[i][1]), x + 0.12 * (i - 1), FLOOR2 + 1.18, -32.325, false));
  });
  for (const x of [4.1, 7.0]) sconce(g, x, FLOOR2 + 1.35, -32.38, 0, 1);
  // Entrega: plataforma elevadora del camión bajada y banderines desde el mástil hasta el camión
  g.add(mesh(new THREE.BoxGeometry(0.75, 0.02, 2.6), M('#9ca3af', { metal: 0.5, rough: 0.4 }), 27.62, 0.035, -30.25));
  for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.75, 0.024, 0.12), M(C.yellow), 27.62, 0.036, -30.25 + s * 1.24, false));
  bunting(g, new THREE.Vector3(23.1, 3.1, -35.4), new THREE.Vector3(28.05, 3.3, -33.5), 9);
  // Calle: rejillas de desagüe junto al bordillo
  for (const [x, z] of [[-10.5, 0.75], [7.5, 0.75], [-8.5, -8.75], [11, -8.75]] as const) g.add(mesh(new THREE.BoxGeometry(0.6, 0.02, 0.28), M('#1f2937', { metal: 0.3, rough: 0.6 }), x, 0.014, z, false));
}

export function addDecor(g: THREE.Group) {
  for (const p of PROPS) {
    const o = new THREE.Group();
    build[p.type](o);
    o.position.set(p.x, p.y ?? 0, p.z);
    o.rotation.y = p.ry ?? 0;
    g.add(o);
  }
  addDetails(g);
}
