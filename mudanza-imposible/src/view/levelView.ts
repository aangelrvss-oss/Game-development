import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { LEVEL, STAIRS, FLOOR2, ZONE, DOOR, RAMP, PED_LIGHT, type Box } from '../sim/level';
import { LANES } from '../sim/traffic';
import { mat, ownMat, PALETTE } from './materials';
import { textSprite } from './text';

const KIND_COLOR: Partial<Record<Box['kind'], string>> = {
  ground: PALETTE.grassDark, grass: PALETTE.grass, sidewalk: PALETTE.sidewalk, road: PALETTE.road,
  stripe: PALETTE.stripe, crosswalk: PALETTE.stripe, wall: PALETTE.wall, facade: PALETTE.facade,
  block: PALETTE.block, floor: PALETTE.floor, ramp: PALETTE.ramp, fence: PALETTE.fence, hedge: PALETTE.hedge,
  house: PALETTE.house, truck: PALETTE.truck,
};

export interface LevelView {
  group: THREE.Group;
  /** Mallas que se pueden volver translúcidas si tapan la acción. */
  fadeables: THREE.Mesh[];
  update(t: number, light: { cars: string; ped: string; left: number }, zoneActive: boolean): void;
}

function boxMesh(b: Box, color: string, rounded = false): THREE.Mesh {
  const [hx, hy, hz] = b.h;
  const geo = rounded ? new RoundedBoxGeometry(hx * 2, hy * 2, hz * 2, 2, Math.min(0.08, hx, hy, hz)) : new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
  const m = new THREE.Mesh(geo, b.fade ? ownMat(color) : mat(color));
  m.position.set(...b.p);
  if (b.rx) m.rotation.x = b.rx;
  if (b.rz) m.rotation.z = b.rz;
  m.castShadow = b.kind !== 'ground' && b.kind !== 'road' && b.kind !== 'sidewalk' && b.kind !== 'grass';
  m.receiveShadow = true;
  return m;
}

export function buildLevel(): LevelView {
  const g = new THREE.Group();
  const fadeables: THREE.Mesh[] = [];
  for (const b of LEVEL) {
    if (b.kind === 'invisible' || b.kind === 'zone' || b.kind === 'stairs' || b.kind === 'truck') continue;
    const color = KIND_COLOR[b.kind] ?? '#ff00ff';
    const rounded = b.kind === 'hedge';
    const m = boxMesh(b, color, rounded);
    g.add(m);
    if (b.fade) {
      m.userData.fade = 1;
      if (b.kind === 'facade') m.userData.fadeRule = (_x: number, _y: number, z: number) => z < DOOR.z + 3.5 && z > DOOR.z - 8;
      if (b.kind === 'wall') m.userData.fadeRule = (_x: number, y: number) => y > 1.6;
      fadeables.push(m);
    }
    // Tejados sobre bloques y casa, para que el edificio se lea desde arriba
    if (b.kind === 'block' || b.kind === 'house') {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(b.h[0] * 2 + 0.3, 0.2, b.h[2] * 2 + 0.3), mat(PALETTE.roof));
      roof.position.set(b.p[0], b.p[1] + b.h[1] + 0.1, b.p[2]);
      roof.castShadow = true;
      g.add(roof);
    }
    if (b.kind === 'ramp') addRampStripes(g, b);
  }
  addStairs(g);
  addFacadeDetails(g, fadeables);
  addHouse(g);
  addTrees(g);
  addStreetProps(g);
  const lights = addTrafficLights(g);
  const truck = addTruck(g);
  const zone = addZone(g);

  return {
    group: g,
    fadeables,
    update(t, light, zoneActive) {
      lights.set(light.cars, light.ped);
      (zone.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.25 * Math.sin(t * 4) * (zoneActive ? 1 : 0.4);
      zone.position.y = 0.03;
      truck.rotation.y = 0;
    },
  };
}

function addStairs(g: THREE.Group) {
  const n = 14;
  const run = (STAIRS.z0 - STAIRS.z1) / n, rise = STAIRS.top / n;
  for (let i = 0; i < n; i++) {
    const h = rise * (i + 1);
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.8, h, run), mat(i % 2 ? PALETTE.stairs : '#d49a63'));
    step.position.set(0, h / 2, STAIRS.z0 - run * (i + 0.5));
    step.castShadow = true; step.receiveShadow = true;
    g.add(step);
  }
}

function addRampStripes(g: THREE.Group, b: Box) {
  // Bordes amarillos y negros: señal de peligro en los lados sin barandilla
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(b.h[0] * 2 / 10, 0.03, 0.18), mat(i % 2 ? '#111827' : '#facc15'));
      const u = (i + 0.5) / 10 - 0.5;
      const local = new THREE.Vector3(u * b.h[0] * 2, b.h[1] + 0.016, side * (b.h[2] - 0.09));
      local.applyEuler(new THREE.Euler(0, 0, b.rz ?? 0));
      seg.position.set(b.p[0] + local.x, b.p[1] + local.y, b.p[2] + local.z);
      seg.rotation.z = b.rz ?? 0;
      g.add(seg);
    }
  }
}

function addFacadeDetails(g: THREE.Group, fadeables: THREE.Mesh[]) {
  // Marco de la puerta y ventanas en la fachada
  const frameMat = mat('#7c3f1d');
  for (const x of [DOOR.x0 - 0.08, DOOR.x1 + 0.08]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, DOOR.top, 0.5), frameMat);
    post.position.set(x, DOOR.top / 2, DOOR.z);
    g.add(post);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(DOOR.x1 - DOOR.x0 + 0.32, 0.16, 0.5), frameMat);
  top.position.set(0, DOOR.top, DOOR.z);
  g.add(top);
  const winMat = ownMat('#5aa9e6', { rough: 0.3 });
  for (let x = -16; x <= 16; x += 3.2) {
    if (Math.abs(x) < 2) continue;
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 0.06), winMat);
    w.position.set(x, 1.7, DOOR.z + 0.23);
    w.userData.fade = 1;
    w.userData.fadeRule = (_x: number, _y: number, z: number) => z < DOOR.z + 3.5 && z > DOOR.z - 8;
    fadeables.push(w);
    g.add(w);
  }
  const sign = textSprite('Nº 13', { size: 40, color: '#ffffff', bg: '#c8553d', pad: 10 });
  sign.position.set(2.6, 2.7, DOOR.z + 0.5);
  sign.scale.multiplyScalar(0.7);
  g.add(sign);
  // Barandilla de la terraza (solo al norte; el resto queda abierto a propósito)
  const label = textSprite('¡Cuidado! Sin barandilla', { size: 34, color: '#111827', bg: '#facc15', pad: 12 });
  label.position.set(RAMP.x0 + 1.2, FLOOR2 + 1.6, RAMP.z0 - 0.9);
  label.scale.multiplyScalar(0.7);
  g.add(label);
}

function addHouse(g: THREE.Group) {
  // Puerta y ventanas de la casa de salida
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.1), mat('#7c3f1d'));
  door.position.set(0, 1.05, 16.95);
  g.add(door);
  for (const x of [-5, -2.6, 2.6, 5]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.08), mat('#5aa9e6', { rough: 0.3 }));
    w.position.set(x, 2.1, 16.95);
    g.add(w);
  }
  const sign = textSprite('SALIDA', { size: 40, color: '#ffffff', bg: '#7c3aed', pad: 14 });
  sign.position.set(0, 3, 16.6);
  sign.scale.multiplyScalar(0.8);
  g.add(sign);
}

function tree(x: number, z: number, s = 1) {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 1.2 * s, 8), mat('#8b5a2b'));
  trunk.position.y = 0.6 * s;
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 * s, 1), mat('#4caf50'));
  crown.position.y = 1.7 * s;
  crown.scale.y = 1.1;
  for (const m of [trunk, crown]) { m.castShadow = true; t.add(m); }
  t.position.set(x, 0, z);
  return t;
}

function addTrees(g: THREE.Group) {
  for (const [x, z, s] of [[-6, 7, 1.1], [6, 13, 1], [-6, 14, 0.9], [6.2, 6, 0.8], [-14, 6, 1.2], [14, 7, 1.1], [-15, -11, 1], [15, -11.5, 1], [18, -38, 1.2], [30, -26, 1], [16, -40, 0.9]] as const) {
    g.add(tree(x, z, s));
  }
  // Macetas con flores en el patio
  for (const [x, z] of [[-3.5, 15.6], [3.5, 15.6]] as const) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.5, 10), mat('#c2410c'));
    pot.position.set(x, 0.25, z);
    const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), mat('#f472b6'));
    fl.position.set(x, 0.7, z);
    g.add(pot, fl);
  }
}

function addStreetProps(g: THREE.Group) {
  for (const x of [-12, -6, 6, 12]) {
    for (const z of [1.3, -9.4]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8), mat('#374151'));
      pole.position.set(x, 1.6, z);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat('#fff7cc', { emissive: '#fff1a8' }));
      lamp.position.set(x, 3.25, z);
      g.add(pole, lamp);
    }
  }
  // Líneas de detención de los coches
  for (const l of LANES) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 2.2), mat('#f8f5ec'));
    line.position.set(l.stopX, 0.02, l.z);
    g.add(line);
  }
}

function addTrafficLights(g: THREE.Group) {
  const bulbs: { car: THREE.Mesh[]; ped: THREE.Mesh[] }[] = [];
  const make = (x: number, z: number, faceZ: number) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 8), mat('#1f2937'));
    pole.position.set(x, 1.5, z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 0.35), mat('#111827'));
    box.position.set(x, 2.9, z);
    g.add(pole, box);
    const car: THREE.Mesh[] = [];
    ['#ef4444', '#f59e0b', '#22c55e'].forEach((c, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), ownMat(c, { emissive: '#000000' }));
      b.position.set(x + (x > 0 ? -0.21 : 0.21), 3.25 - i * 0.33, z);
      b.userData.on = c;
      car.push(b); g.add(b);
    });
    const pbox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.75, 0.3), mat('#111827'));
    pbox.position.set(x, 1.85, z);
    g.add(pbox);
    const ped: THREE.Mesh[] = [];
    ['#ef4444', '#22c55e'].forEach((c, i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.06), ownMat(c));
      b.position.set(x, 2.02 - i * 0.33, z + faceZ * 0.17);
      b.userData.on = c;
      ped.push(b); g.add(b);
    });
    bulbs.push({ car, ped });
  };
  make(PED_LIGHT.x, PED_LIGHT.z, 1);
  make(-PED_LIGHT.x, -9.6, -1);
  const off = '#1f2937';
  return {
    set(cars: string, ped: string) {
      for (const b of bulbs) {
        const ci = cars === 'red' ? 0 : cars === 'yellow' ? 1 : 2;
        b.car.forEach((m, i) => {
          const mm = m.material as THREE.MeshStandardMaterial;
          mm.color.set(i === ci ? (m.userData.on as string) : off);
          mm.emissive.set(i === ci ? (m.userData.on as string) : '#000000');
        });
        b.ped.forEach((m, i) => {
          const on = (ped === 'red' && i === 0) || (ped === 'green' && i === 1);
          const mm = m.material as THREE.MeshStandardMaterial;
          mm.color.set(on ? (m.userData.on as string) : off);
          mm.emissive.set(on ? (m.userData.on as string) : '#000000');
        });
      }
    },
  };
}

function addTruck(g: THREE.Group) {
  const t = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(6, 3.2, 6.2, 2, 0.15), mat(PALETTE.truck));
  body.position.set(31, 1.8, -30.25);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(6.02, 0.5, 6.22), mat('#7c3aed'));
  stripe.position.set(31, 1.4, -30.25);
  const cab = new THREE.Mesh(new RoundedBoxGeometry(2.4, 2.4, 5.6, 2, 0.2), mat('#ef4444'));
  cab.position.set(35.3, 1.4, -30.25);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 4.6), mat('#93c5fd', { rough: 0.2 }));
  glass.position.set(36.5, 1.9, -30.25);
  for (const m of [body, stripe, cab, glass]) { m.castShadow = true; t.add(m); }
  for (const x of [29, 33.5, 35.5]) for (const z of [-33.3, -27.2]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 14), mat('#111827'));
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.6, z); t.add(w);
  }
  const lab = textSprite('MUDANZAS PEPE', { size: 44, color: '#7c3aed', bg: '#ffffff', pad: 10 });
  lab.position.set(31, 3.8, -30.25);
  t.add(lab);
  g.add(t);
  return t;
}

function addZone(g: THREE.Group) {
  const w = ZONE.x1 - ZONE.x0, d = ZONE.z1 - ZONE.z0;
  const cx = (ZONE.x0 + ZONE.x1) / 2, cz = (ZONE.z0 + ZONE.z1) / 2;
  // Suelo a rayas amarillas y blancas con borde: se distingue bien sobre el césped
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#facc15'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#fff7d6';
  for (let i = -256; i < 512; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 32, 0); ctx.lineTo(i + 32 + 256, 256); ctx.lineTo(i + 256, 256); ctx.fill(); }
  ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 14; ctx.strokeRect(7, 7, 242, 242);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false }));
  zone.rotation.x = -Math.PI / 2;
  zone.position.set(cx, 0.03, cz);
  g.add(zone);
  const lab = textSprite('ENTREGA', { size: 40, color: '#ffffff', bg: '#16a34a', pad: 10 });
  lab.position.set(cx, 2.2, ZONE.z0 + 0.6);
  lab.scale.multiplyScalar(0.75);
  g.add(lab);
  return zone;
}
