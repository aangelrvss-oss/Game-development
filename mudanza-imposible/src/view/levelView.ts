import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LEVEL, STAIRS, FLOOR2, ZONE, DOOR, RAMP, PED_LIGHT, type Box } from '../sim/level';
import { LANES } from '../sim/traffic';
import type { Vec3 } from '../sim/types';
import { mat, ownMat, PALETTE } from './materials';
import { textSprite } from './text';
import { TEX, worldUV, windowsTex, signTex, awningTex } from './textures';

/** Material de cada tipo de caja: color (que tiñe la textura) y textura con su tamaño en metros. */
function kindLook(kind: Box['kind']): { color: string; tex?: THREE.Texture; tile?: number; rough?: number; metal?: number } | null {
  switch (kind) {
    case 'ground': return { color: '#c9e2b8', tex: TEX.grass(), tile: TEX.grassTile };
    case 'grass': return { color: '#ffffff', tex: TEX.grass(), tile: TEX.grassTile };
    case 'sidewalk': return { color: '#ffffff', tex: TEX.sidewalk(), tile: TEX.sidewalkTile };
    case 'road': return { color: '#ffffff', tex: TEX.asphalt(), tile: TEX.asphaltTile, rough: 0.95 };
    case 'stripe': case 'crosswalk': return { color: PALETTE.stripe, rough: 0.7 };
    case 'wall': return { color: '#ffffff', tex: TEX.plaster(), tile: TEX.plasterTile };
    case 'facade': return { color: '#ffffff', tex: TEX.brick(), tile: TEX.brickTile };
    case 'block': return { color: '#f2c6a0', tex: TEX.plaster(), tile: TEX.plasterTile };
    case 'floor': return { color: '#ffffff', tex: TEX.planks(), tile: TEX.planksTile, rough: 0.7 };
    case 'ramp': return { color: '#ffffff', tex: TEX.metal(), tile: TEX.metalTile, rough: 0.35, metal: 0.35 };
    case 'hedge': return { color: '#ffffff', tex: TEX.hedge(), tile: TEX.hedgeTile };
    case 'house': return { color: '#ffffff', tex: windowsTex('#fde7b0', '#3f7d4e', 20), tile: 3 };
    default: return null;
  }
}

export interface LevelView {
  group: THREE.Group;
  /** Mallas que se pueden volver translúcidas si tapan la acción. */
  fadeables: THREE.Mesh[];
  update(t: number, light: { cars: string; ped: string; left: number }, zoneActive: boolean, stage: number, sofa: Vec3): void;
}

const NEAR_DOOR = (_x: number, _y: number, z: number) => z < DOOR.z + 3.5 && z > DOOR.z - 8;

function boxMesh(b: Box): THREE.Mesh | null {
  const look = kindLook(b.kind);
  if (!look) return null;
  const [hx, hy, hz] = b.h;
  const geo = b.kind === 'hedge' ? new RoundedBoxGeometry(hx * 2, hy * 2, hz * 2, 2, Math.min(0.12, hx, hy, hz)) : new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2);
  // Rampas y escaleras giradas: coordenadas locales; el resto, del mundo (las texturas casan entre cajas)
  if (look.tex) worldUV(geo, b.rx || b.rz ? new THREE.Vector3() : new THREE.Vector3(...b.p), look.tile!);
  const opts = { map: look.tex, rough: look.rough, metal: look.metal };
  const m = new THREE.Mesh(geo, b.fade ? ownMat(look.color, opts) : mat(look.color, opts));
  m.position.set(...b.p);
  if (b.rx) m.rotation.x = b.rx;
  if (b.rz) m.rotation.z = b.rz;
  m.castShadow = !['ground', 'road', 'sidewalk', 'grass', 'stripe', 'crosswalk'].includes(b.kind);
  m.receiveShadow = true;
  return m;
}

export function buildLevel(): LevelView {
  const g = new THREE.Group();
  const fadeables: THREE.Mesh[] = [];
  for (const b of LEVEL) {
    if (b.kind === 'fence') { addFence(g, b); continue; }
    const m = boxMesh(b);
    if (!m) continue;
    g.add(m);
    if (b.fade) {
      m.userData.fade = 1;
      // Las paredes que arrancan del suelo (o del piso de arriba) se recortan; lo que cuelga (encima de la puerta), se oculta
      m.userData.mode = b.kind === 'wall' || b.p[1] - b.h[1] < 0.05 ? 'cut' : 'hide';
      if (b.kind === 'facade') m.userData.fadeRule = NEAR_DOOR;
      if (b.kind === 'wall') m.userData.fadeRule = (_x: number, y: number) => y > 1.6;
      fadeables.push(m);
    }
    if (b.kind === 'block' || b.kind === 'house') addRoof(g, b);
    if (b.kind === 'ramp') addRampStripes(g, b);
    if (b.kind === 'wall' && b.p[1] < 2.2) addSkirting(g, b);
  }
  addCurbs(g);
  addStairs(g);
  addFacadeDetails(g, fadeables);
  addHouse(g);
  addNeighbourhood(g);
  addTrees(g, fadeables);
  addStreetProps(g);
  addRooftopProps(g);
  const lights = addTrafficLights(g);
  addTruck(g);
  const zone = addZone(g);
  const beacon = addBeacon(g);
  // Lo que no se mueve ni cambia de opacidad se funde en una malla por material: muchas menos llamadas de dibujo
  g.updateMatrixWorld(true);
  for (const m of fadeables) {
    m.userData.box = new THREE.Box3().setFromObject(m);
    m.userData.mode ??= 'hide';
  }
  const keep = new Set<THREE.Object3D>(fadeables);
  beacon.root.traverse((o) => keep.add(o));
  mergeStatic(g, keep);
  const NEXT: [number, number, number][] = [
    [0, 0, 2], [0, 0, DOOR.z - 0.5], [0, 0, STAIRS.z0], [0, FLOOR2, -30.6], [RAMP.x0, FLOOR2, (RAMP.z0 + RAMP.z1) / 2],
    [(ZONE.x0 + ZONE.x1) / 2, 0, (ZONE.z0 + ZONE.z1) / 2],
  ];

  return {
    group: g,
    fadeables,
    update(t, light, zoneActive, stage, sofa) {
      const n = NEXT[stage];
      beacon.update(t, n ?? null, sofa);
      lights.set(light.cars, light.ped);
      (zone.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.25 * Math.sin(t * 4) * (zoneActive ? 1 : 0.4);
    },
  };
}

/** Indicador del siguiente objetivo: aro en el suelo y flecha pequeña. Se apaga cuando el sofá está cerca. */
function addBeacon(g: THREE.Group) {
  const root = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: '#facc15', transparent: true, opacity: 0.8, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.3, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.32, 40), ringMat.clone());
  ring2.rotation.x = -Math.PI / 2;
  const arrowMat = new THREE.MeshStandardMaterial({ color: '#facc15', emissive: '#a16207', transparent: true, opacity: 0.9 });
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.7, 4), arrowMat);
  arrow.rotation.x = Math.PI;
  root.add(ring, ring2, arrow);
  g.add(root);
  return {
    root,
    update(t: number, n: [number, number, number] | null, sofa: Vec3) {
      root.visible = !!n;
      if (!n) return;
      root.position.set(n[0], n[1] + 0.04, n[2]);
      const d = Math.hypot(sofa.x - n[0], sofa.z - n[2]);
      const vis = THREE.MathUtils.clamp((d - 1.5) / 1.5, 0, 1);
      ringMat.opacity = 0.85 * vis;
      const k = (t * 0.8) % 1;
      ring2.scale.setScalar(1 + k * 1.2);
      (ring2.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.6 * vis;
      arrowMat.opacity = 0.9 * vis;
      arrow.visible = vis > 0.02;
      arrow.position.y = 1.7 + Math.abs(Math.sin(t * 3)) * 0.35;
      arrow.rotation.y = t * 1.5;
    },
  };
}

function mergeStatic(root: THREE.Group, keep: Set<THREE.Object3D>) {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const done: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || keep.has(m)) return;
    let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.getAttribute('uv') || !geo.getAttribute('normal')) return;
    geo = geo.applyMatrix4(m.matrixWorld);
    const key = `${m.material.uuid}|${m.castShadow ? 1 : 0}`;
    let b = buckets.get(key);
    if (!b) { b = { mat: m.material, cast: m.castShadow, geos: [] }; buckets.set(key, b); }
    b.geos.push(geo);
    done.push(m);
  });
  for (const m of done) m.removeFromParent();
  for (const b of buckets.values()) {
    const merged = new THREE.Mesh(mergeGeometries(b.geos, false)!, b.mat);
    merged.castShadow = b.cast;
    merged.receiveShadow = true;
    root.add(merged);
  }
}

function addRoof(g: THREE.Group, b: Box) {
  const w = b.h[0] * 2 + 0.3, d = b.h[2] * 2 + 0.3;
  const geo = worldUV(new THREE.BoxGeometry(w, 0.2, d), new THREE.Vector3(b.p[0], 0, b.p[2]), TEX.roofTilesTile);
  const roof = new THREE.Mesh(geo, mat('#ffffff', { map: TEX.roofTiles() }));
  roof.position.set(b.p[0], b.p[1] + b.h[1] + 0.1, b.p[2]);
  roof.castShadow = true; roof.receiveShadow = true;
  g.add(roof);
  // Pretil claro alrededor
  const y = b.p[1] + b.h[1] + 0.26;
  const pm = mat('#f5e6cc');
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.18), pm);
    a.position.set(b.p[0], y, b.p[2] + s * (d / 2 - 0.09));
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, d), pm);
    c.position.set(b.p[0] + s * (w / 2 - 0.09), y, b.p[2]);
    g.add(a, c);
  }
}

function addSkirting(g: THREE.Group, b: Box) {
  // Rodapié oscuro en las paredes del pasillo: marca dónde acaba el suelo
  const m = new THREE.Mesh(new THREE.BoxGeometry(b.h[0] * 2 + 0.02, 0.14, b.h[2] * 2 + 0.02), mat('#8a5a3c'));
  m.position.set(b.p[0], 0.07, b.p[2]);
  g.add(m);
}

function addCurbs(g: THREE.Group) {
  const cm = mat('#efece6', { rough: 0.8 });
  for (const z of [1, -9]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(36, 0.04, 0.22), cm);
    c.position.set(0, 0.02, z);
    c.receiveShadow = true;
    g.add(c);
  }
  // Tapas de alcantarilla
  const lid = mat('#3a3f4a', { rough: 0.6, metal: 0.3 });
  for (const [x, z] of [[-7, -2.2], [9, -6.3], [-13, -6.1]] as const) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 20), lid);
    m.position.set(x, 0.012, z);
    g.add(m);
  }
}

function addFence(g: THREE.Group, b: Box) {
  // Valla de estacas blanca (la colisión es la caja del nivel)
  const [x, , z] = b.p, len = b.h[2] * 2;
  const n = Math.floor(len / 0.32);
  const pick = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.95, 0.16), mat(PALETTE.fence, { rough: 0.6 }), n);
  const tip = new THREE.InstancedMesh(new THREE.ConeGeometry(0.1, 0.16, 4), mat(PALETTE.fence, { rough: 0.6 }), n);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const zz = z - len / 2 + (i + 0.5) * (len / n);
    pick.setMatrixAt(i, m4.makeTranslation(x, 0.47, zz));
    tip.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 1.02, zz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)), new THREE.Vector3(0.8, 1, 1.6)));
  }
  pick.castShadow = tip.castShadow = true;
  g.add(pick, tip);
  for (const y of [0.3, 0.75]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, len), mat('#e7e5e4'));
    rail.position.set(x + (x > 0 ? 0.06 : -0.06), y, z);
    g.add(rail);
  }
}

function addStairs(g: THREE.Group) {
  const n = 14;
  const run = (STAIRS.z0 - STAIRS.z1) / n, rise = STAIRS.top / n;
  const wood = mat('#ffffff', { map: TEX.planks(), rough: 0.7 });
  const nose = mat('#fbe9c9');
  for (let i = 0; i < n; i++) {
    const h = rise * (i + 1);
    const geo = worldUV(new THREE.BoxGeometry(2.8, h, run), new THREE.Vector3(0, h / 2, STAIRS.z0 - run * (i + 0.5)), TEX.planksTile);
    const step = new THREE.Mesh(geo, wood);
    step.position.set(0, h / 2, STAIRS.z0 - run * (i + 0.5));
    step.castShadow = true; step.receiveShadow = true;
    // Canto oscuro de cada peldaño: se lee la escalera desde arriba
    const edge = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.03, 0.1), nose);
    edge.position.set(0, h + 0.005, STAIRS.z0 - run * i - 0.05);
    g.add(step, edge);
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
  const fadeWith = (m: THREE.Mesh) => {
    m.material = (m.material as THREE.MeshStandardMaterial).clone();
    m.userData.fade = 1;
    m.userData.fadeRule = NEAR_DOOR;
    fadeables.push(m);
    g.add(m);
  };
  // Marco de la puerta
  const frameMat = mat('#7c3f1d');
  for (const x of [DOOR.x0 - 0.08, DOOR.x1 + 0.08]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, DOOR.top, 0.5), frameMat);
    post.position.set(x, DOOR.top / 2, DOOR.z);
    g.add(post);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(DOOR.x1 - DOOR.x0 + 0.32, 0.16, 0.5), frameMat);
  top.position.set(0, DOOR.top, DOOR.z);
  fadeWith(top);
  // Jambas claras con contorno: marcan bien el hueco estrecho aunque la fachada esté recortada
  for (const x of [DOOR.x0 - 0.08, DOOR.x1 + 0.08]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.2, DOOR.top, 0.04), mat('#fde68a'));
    trim.position.set(x, DOOR.top / 2, DOOR.z + 0.27);
    trim.castShadow = true;
    g.add(trim);
  }
  // Felpudo
  const mat1 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 0.6), mat('#b45309'));
  mat1.position.set(0, 0.02, DOOR.z + 0.7);
  g.add(mat1);
  // Escaparates con toldo a rayas y ventanas con persianas
  const awnColors: [string, string][] = [['#ef4444', '#fff7ed'], ['#16a34a', '#fff7ed'], ['#2563eb', '#fff7ed'], ['#f59e0b', '#fff7ed']];
  let k = 0;
  for (let x = -16; x <= 16; x += 3.2) {
    if (Math.abs(x) < 2) continue;
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 0.06), ownMat('#5aa9e6', { rough: 0.25 }));
    w.position.set(x, 1.6, DOOR.z + 0.23);
    fadeWith(w);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.04), ownMat('#fdf6e7'));
    frame.position.set(x, 1.6, DOOR.z + 0.21);
    fadeWith(frame);
    const [a, b] = awnColors[k++ % awnColors.length];
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.8), ownMat('#ffffff', { map: awningTex(a, b) }));
    awn.material.side = THREE.DoubleSide;
    awn.position.set(x, 2.55, DOOR.z + 0.55);
    awn.rotation.x = -0.9;
    awn.castShadow = true;
    fadeWith(awn);
  }
  // Cornisa
  const corn = new THREE.Mesh(new THREE.BoxGeometry(36.4, 0.22, 0.7), ownMat('#f5e6cc'));
  corn.position.set(0, 3.25, DOOR.z + 0.05);
  fadeWith(corn);
  const sign = textSprite('Nº 13', { size: 40, color: '#ffffff', bg: '#c8553d', pad: 10 });
  sign.position.set(2.2, 2.7, DOOR.z + 0.5);
  sign.scale.multiplyScalar(0.6);
  g.add(sign);
  // Cartel pintado de la terraza (sobre su muro, sin tapar la rampa)
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.55), mat('#ffffff', { map: signTex('¡SIN BARANDILLA!', { bg: '#facc15', color: '#111827', stripes: true }), rough: 0.6 }));
  warn.position.set(13.1, FLOOR2 + 1.45, -32.38);
  g.add(warn);
  for (const x of [12.25, 13.95]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), mat('#374151'));
    post.position.set(x, FLOOR2 + 1.2, -32.42);
    g.add(post);
  }
}

function addHouse(g: THREE.Group) {
  // Puerta, toldo y cartel de la casa de salida
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.1), mat('#7c3f1d'));
  door.position.set(0, 1.05, 16.95);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat('#facc15', { metal: 0.6, rough: 0.3 }));
  knob.position.set(0.4, 1.0, 16.88);
  g.add(door, knob);
  const sign = textSprite('SALIDA', { size: 40, color: '#ffffff', bg: '#7c3aed', pad: 14 });
  sign.position.set(0, 3, 16.6);
  sign.scale.multiplyScalar(0.7);
  g.add(sign);
  // Camino de losas del patio hasta la acera
  const stone = mat('#d6cfc4', { rough: 0.9 });
  for (let z = 15.8; z > 4.5; z -= 1.1) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 9), stone);
    s.position.set(((z * 7) % 3) * 0.12 - 0.12, 0.02, z);
    s.receiveShadow = true;
    g.add(s);
  }
  // Gnomo de jardín (vigila la mudanza)
  const gnome = new THREE.Group();
  const gb = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 10), mat('#2563eb'));
  gb.position.y = 0.22;
  const gh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat('#f5c9a6'));
  gh.position.y = 0.5;
  const gbeard = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 8), mat('#ffffff'));
  gbeard.position.set(0, 0.42, 0.07); gbeard.rotation.x = Math.PI;
  const ghat = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 10), mat('#ef4444'));
  ghat.position.y = 0.76;
  for (const m of [gb, gh, gbeard, ghat]) { m.castShadow = true; gnome.add(m); }
  gnome.position.set(-5.6, 0, 12.5);
  gnome.rotation.y = 0.5;
  g.add(gnome);
}

/** Casas y bloques de fondo, sin colisión, para que la calle parezca un barrio. */
function addNeighbourhood(g: THREE.Group) {
  const styles: [string, string][] = [['#f6c89f', '#2f6f4f'], ['#fde7b0', '#b45309'], ['#cfe3f2', '#1e3a8a'], ['#f4b6b6', '#7c2d12'], ['#e9d5ff', '#4c1d95']];
  const building = (x0: number, x1: number, z0: number, z1: number, h: number, style: number) => {
    const [wall, shutter] = styles[style % styles.length];
    const w = x1 - x0, d = z1 - z0, c = new THREE.Vector3((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    const geo = worldUV(new THREE.BoxGeometry(w, h, d), c, 3);
    const m = new THREE.Mesh(geo, [
      mat('#ffffff', { map: windowsTex(wall, shutter, style + 30) }), mat('#ffffff', { map: windowsTex(wall, shutter, style + 30) }),
      mat(wall), mat(wall),
      mat('#ffffff', { map: windowsTex(wall, shutter, style + 30) }), mat('#ffffff', { map: windowsTex(wall, shutter, style + 30) }),
    ]);
    m.position.copy(c);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    addRoof(g, { p: [c.x, c.y, c.z], h: [w / 2, h / 2, d / 2], kind: 'block', solid: false });
  };
  // Junto al patio de salida
  building(-17.5, -10, 7, 16, 4.5, 0);
  building(10, 17.5, 7, 16, 4.5, 1);
  // Al otro lado de la calle, siguiendo la fachada
  building(-34, -18.4, -24, -13.6, 6.2, 2);
  building(18.4, 32, -22, -13.6, 4.2, 3);
  // Fondo, detrás del patio trasero
  building(8, 22, -56, -44, 7, 4);
  building(23, 40, -56, -44, 9, 2);
  building(-20, -6, -48, -34, 6.5, 1);
  // Al final de la calle
  building(-44, -36, -13, 0, 5, 3);
  building(36, 44, -13, 0, 5, 0);
}

function tree(x: number, z: number, s = 1, hue = 0) {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.3 * s, 8), mat('#8b5a2b'));
  trunk.position.y = 0.65 * s;
  trunk.castShadow = true;
  t.add(trunk);
  const greens = [['#4caf50', '#66bb6a', '#3d9a44'], ['#7cb342', '#9ccc65', '#689f38']][hue % 2];
  for (const [dx, dy, dz, r, c] of [[0, 1.75, 0, 0.85, 0], [0.45, 1.5, 0.2, 0.55, 1], [-0.4, 1.55, -0.15, 0.6, 2], [0.05, 2.25, -0.1, 0.55, 1]] as const) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), mat(greens[c]));
    crown.position.set(dx * s, dy * s, dz * s);
    crown.castShadow = true;
    t.add(crown);
  }
  t.position.set(x, 0, z);
  t.rotation.y = x * 1.7 + z;
  return t;
}

function addTrees(g: THREE.Group, fadeables: THREE.Mesh[]) {
  const list: [number, number, number][] = [[-6, 7, 1.1], [6, 13, 1], [-6, 14.5, 0.9], [6.2, 6, 0.8], [-14, 5.5, 1.2], [14, 5.6, 1.1], [-15, -11, 1], [15, -11.5, 1], [18, -38, 1.2], [30, -26, 1], [16, -40, 0.9], [-22, 2.5, 1.1], [22, 2.5, 1.2], [-9, -11.6, 0.8], [9, -11.8, 0.8]];
  // Árboles junto al recorrido (patio, aceras y camión): su copa se oculta si tapa a un jugador o al sofá.
  // En el patio los jugadores pasan por debajo (los árboles no tienen colisión) y desaparecían de la vista.
  const nearRoute = new Set(['-6,7', '6,13', '-6,14.5', '6.2,6', '-9,-11.6', '9,-11.8', '30,-26']);
  list.forEach(([x, z, s], i) => {
    const t = tree(x, z, s, i);
    g.add(t);
    if (!nearRoute.has(`${x},${z}`)) return;
    for (const crown of t.children.slice(1) as THREE.Mesh[]) { crown.userData.fade = 1; crown.userData.mode = 'hide'; fadeables.push(crown); }
  });
  // Arriates con flores en el patio
  const flowers = ['#f472b6', '#facc15', '#ef4444', '#a78bfa', '#ffffff'];
  for (const sx of [-1, 1]) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 9), mat('#7a4b2a'));
    bed.position.set(sx * 7.1, 0.09, 10.5);
    g.add(bed);
    for (let i = 0; i < 14; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), mat(flowers[(i + (sx > 0 ? 2 : 0)) % flowers.length]));
      f.position.set(sx * 7.1 + ((i * 37) % 5) * 0.12 - 0.24, 0.3, 6.4 + i * 0.6);
      f.castShadow = true;
      g.add(f);
    }
  }
  for (const [x, z] of [[-3.5, 15.6], [3.5, 15.6]] as const) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.5, 10), mat('#c2410c'));
    pot.position.set(x, 0.25, z);
    const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), mat('#f472b6'));
    fl.position.set(x, 0.7, z);
    pot.castShadow = fl.castShadow = true;
    g.add(pot, fl);
  }
}

function addStreetProps(g: THREE.Group) {
  const metal = mat('#5f7391', { rough: 0.55, metal: 0.2 });
  // Farolas pintadas con globo: en la acera cercana solo las de los extremos, para no cruzar la acción
  for (const x of [-12, -6, 6, 12]) {
    for (const [z, dir] of [[1.3, -1], [-9.4, 1]] as const) {
      if (z > 0 && Math.abs(x) < 10) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.4, 8), metal);
      pole.position.set(x, 1.7, z);
      const arm = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 6, 12, Math.PI / 2), metal);
      arm.position.set(x, 3.4, z + dir * 0.35);
      arm.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.12, 10), metal);
      head.position.set(x, 3.62, z + dir * 0.4);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), mat('#fff7cc', { emissive: '#fde68a' }));
      bulb.position.set(x, 3.84, z + dir * 0.4);
      pole.castShadow = head.castShadow = true;
      g.add(pole, arm, head, bulb);
    }
  }
  // Bancos, papeleras, boca de incendios y buzón: lejos del recorrido del sofá
  const wood = mat('#b7793f');
  for (const [x, z, ry] of [[-9, 2.9, 0], [9, 2.9, 0], [-9.2, -11.2, Math.PI], [12.4, -11.2, Math.PI]] as const) {
    const bench = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.45), wood);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.06), wood);
    back.position.set(0, 0.72, 0.22);
    bench.add(seat, back);
    for (const s of [-0.7, 0.7]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), metal); l.position.set(s, 0.22, 0); bench.add(l); }
    bench.traverse((o) => (o.castShadow = true));
    bench.position.set(x, 0, z);
    bench.rotation.y = ry;
    g.add(bench);
  }
  for (const [x, z] of [[-4.6, 1.6], [4.8, -9.8], [-15, 2.2]] as const) {
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.8, 12), mat('#16a34a', { rough: 0.5 }));
    bin.position.set(x, 0.4, z);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 12), mat('#15803d'));
    lid.position.set(x, 0.83, z);
    bin.castShadow = true;
    g.add(bin, lid);
  }
  const hyd = new THREE.Group();
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.6, 10), mat('#dc2626', { rough: 0.4 }));
  hb.position.y = 0.3;
  const ht = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#dc2626', { rough: 0.4 }));
  ht.position.y = 0.6;
  const hs = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), mat('#b91c1c'));
  hs.rotation.z = Math.PI / 2; hs.position.y = 0.4;
  hyd.add(hb, ht, hs);
  hyd.traverse((o) => (o.castShadow = true));
  hyd.position.set(7.4, 0, 1.7);
  g.add(hyd);
  const box = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.9, 0.4, 2, 0.08), mat('#facc15', { rough: 0.5 }));
  box.position.set(-6.8, 0.75, -10.2);
  const boxLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), metal);
  boxLeg.position.set(-6.8, 0.2, -10.2);
  box.castShadow = true;
  g.add(box, boxLeg);
  // Líneas de detención de los coches
  for (const l of LANES) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 2.2), mat('#f8f5ec'));
    line.position.set(l.stopX, 0.02, l.z);
    g.add(line);
  }
}

function addRooftopProps(g: THREE.Group) {
  // Aparatos de aire, chimeneas y un depósito: lejos del pasillo para no tapar la escalera
  const ac = mat('#e5e7eb', { rough: 0.5 });
  const grill = mat('#6b7280');
  for (const [x, z] of [[-10, -19], [-7, -27], [-12, -30], [7, -16], [10, -19.5]] as const) {
    const u = new THREE.Mesh(new RoundedBoxGeometry(1, 0.6, 0.7, 2, 0.06), ac);
    u.position.set(x, 3.75, z);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 14), grill);
    f.rotation.x = Math.PI / 2; f.position.set(x - 0.15, 3.75, z + 0.36);
    u.castShadow = true;
    g.add(u, f);
  }
  for (const [x, z] of [[-5, -15], [5, -15]] as const) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), mat('#c8553d'));
    ch.position.set(x, 3.9, z);
    ch.castShadow = true;
    g.add(ch);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 14), mat('#93c5fd', { rough: 0.4, metal: 0.3 }));
  tank.position.set(-12, 4, -23);
  tank.castShadow = true;
  g.add(tank);
}

function addTrafficLights(g: THREE.Group) {
  const bulbs: { car: THREE.Mesh[]; ped: THREE.Mesh[] }[] = [];
  const make = (x: number, z: number, faceZ: number) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3, 8), mat('#1f2937'));
    pole.position.set(x, 1.5, z);
    const box = new THREE.Mesh(new RoundedBoxGeometry(0.42, 1.12, 0.36, 2, 0.06), mat('#111827'));
    box.position.set(x, 2.9, z);
    pole.castShadow = box.castShadow = true;
    g.add(pole, box);
    const car: THREE.Mesh[] = [];
    ['#ef4444', '#f59e0b', '#22c55e'].forEach((c, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), ownMat(c, { emissive: '#000000' }));
      b.position.set(x + (x > 0 ? -0.21 : 0.21), 3.25 - i * 0.33, z);
      b.userData.on = c;
      car.push(b); g.add(b);
    });
    const pbox = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.77, 0.32, 2, 0.05), mat('#111827'));
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
  // Caja de carga x 28..34 (la colisión), abierta por detrás (hacia la zona de entrega); cabina hacia +x
  const t = new THREE.Group();
  const white = mat('#f8fafc', { rough: 0.5 });
  const cz = -30.25, dz = 6.5, top = 3.4, bottom = 1.3;
  const panel = (w: number, h: number, d: number, x: number, y: number, z: number, m = white) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    p.position.set(x, y, z);
    p.castShadow = true; p.receiveShadow = true;
    t.add(p);
    return p;
  };
  panel(6, 0.1, dz, 31, top - 0.05, cz);
  panel(6, top - bottom, 0.1, 31, (top + bottom) / 2, cz - dz / 2 + 0.05);
  panel(6, top - bottom, 0.1, 31, (top + bottom) / 2, cz + dz / 2 - 0.05);
  panel(0.1, top - bottom, dz, 33.95, (top + bottom) / 2, cz);
  panel(6, 0.15, dz, 31, bottom, cz, mat('#d9b98c'));
  // Chasis bajo la caja
  panel(5.6, 0.4, dz - 1.6, 31.2, bottom - 0.3, cz, mat('#374151'));
  // Interior de contrachapado y cajas de cartón ya cargadas
  panel(0.05, top - bottom - 0.1, dz - 0.2, 33.85, (top + bottom) / 2, cz, mat('#c69c6d'));
  const card = mat('#c8a26b');
  for (const [x, y, z, s] of [[33, 1.83, -32.4, 0.9], [33, 1.83, -31.4, 0.9], [33.1, 2.68, -32, 0.8], [32.2, 1.73, -28.3, 0.7]] as const) {
    const b = panel(s, s, s, x, y, z, card);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(s + 0.01, 0.08, 0.12), mat('#a07a46'));
    tape.position.copy(b.position).add(new THREE.Vector3(0, s / 2 - 0.03, 0));
    t.add(tape);
  }
  // Franja morada y rótulos pintados
  for (const sz of [-1, 1]) panel(6.02, 0.4, 0.04, 31, bottom + 0.35, cz + sz * (dz / 2 + 0.01), mat('#7c3aed'));
  panel(0.04, 0.4, dz + 0.02, 34.01, bottom + 0.35, cz, mat('#7c3aed'));
  const logo = signTex('MUDANZAS PEPE', { bg: '#ffffff', color: '#7c3aed', w: 512, h: 128 });
  const side = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), mat('#ffffff', { map: logo, rough: 0.5 }));
  side.position.set(31.2, 2.55, cz + dz / 2 + 0.01);
  // Techo: franja morada en el borde (sin un segundo rótulo cortado)
  panel(6.02, 0.04, 0.5, 31, top + 0.02, cz + dz / 2 - 0.25, mat('#7c3aed'));
  t.add(side);
  // Marco trasero de la caja abierta
  for (const s of [-1, 1]) panel(0.16, top - bottom, 0.16, 28.05, (top + bottom) / 2, cz + s * (dz / 2 - 0.08), mat('#d1d5db'));
  // Cabina
  const cab = new THREE.Mesh(new RoundedBoxGeometry(2.4, 2.5, 5.4, 3, 0.3), mat('#ef4444', { rough: 0.45 }));
  cab.position.set(35.3, 1.5, cz);
  cab.castShadow = true;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 4.6), mat('#93c5fd', { rough: 0.15 }));
  glass.position.set(36.5, 2.0, cz);
  t.add(cab, glass);
  for (const x of [29, 33, 35.5]) for (const z of [cz - dz / 2 + 0.1, cz + dz / 2 - 0.1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 16), mat('#111827'));
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.6, z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.42, 10), mat('#d1d5db', { metal: 0.5, rough: 0.3 }));
    hub.rotation.x = Math.PI / 2; hub.position.copy(w.position);
    t.add(w, hub);
  }
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
  lab.scale.multiplyScalar(0.7);
  g.add(lab);
  return zone;
}
