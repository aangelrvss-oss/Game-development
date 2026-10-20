import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TRUCK, truckBoxes, truckDir, truckToWorld } from '../levels/truck';
import type { Box, LevelDef, Scenery, TrafficDef, TruckPose } from '../levels/types';
import type { Vec3 } from '../sim/types';
import { mat, ownMat, PALETTE } from './materials';
import { textSprite } from './text';
import { addDecor } from './decor';
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
    // Camión: suelo de carga de tablas, paredes y techo blancos, rampa de chapa con tacos y bajos oscuros
    case 'truckFloor': return { color: '#f1d3a6', tex: TEX.planks(), tile: TEX.planksTile, rough: 0.7 };
    case 'truckWall': case 'truckRoof': return { color: PALETTE.truck, rough: 0.5 };
    case 'truckRamp': return { color: '#e5e7eb', tex: TEX.metal(), tile: TEX.metalTile, rough: 0.4, metal: 0.35 };
    case 'truckBase': return { color: '#374151', rough: 0.7 };
    default: return null;
  }
}

/** Una pieza del camión tal como se dibuja: su tipo y las 8 esquinas de su caja, en el mundo. */
export interface TruckPart {
  kind: Box['kind'];
  corners: Vec3[];
}

export interface LevelView {
  group: THREE.Group;
  /** Mallas que se recortan o se ocultan si tapan la acción. */
  fadeables: THREE.Mesh[];
  /**
   * Piezas del camión dibujadas (suelo, paredes y techo de la caja de carga, bajos, cabina y rampa), en el orden de
   * `truckBoxes`, medidas al construirlas (antes de fundir lo estático). `tests/view.test.ts` comprueba que coinciden
   * con sus colliders.
   */
  truckParts: TruckPart[];
  /** `main`: posición del objeto principal (el aro del siguiente objetivo se apaga cuando está cerca). */
  update(t: number, light: { cars: string; ped: string; left: number }, stage: number, main: Vec3): void;
}

type FadeRule = (x: number, y: number, z: number) => boolean;

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

/** Hace que una malla se recorte o se oculte si tapa la acción (`world.ts`). */
function makeFade(m: THREE.Mesh, b: Box, fadeables: THREE.Mesh[], rule?: FadeRule) {
  m.userData.fade = 1;
  // Las paredes que arrancan del suelo (o de un piso) se recortan; lo que cuelga (encima de la puerta, el techo del
  // camión), se oculta
  m.userData.mode = b.kind === 'wall' || b.kind === 'truckWall' || b.p[1] - b.h[1] < 0.05 ? 'cut' : 'hide';
  if (rule) m.userData.fadeRule = rule;
  fadeables.push(m);
}

/** Escenario de un nivel: sus cajas, el camión, la decoración, los semáforos y el aro del siguiente objetivo. */
export function buildLevel(level: LevelDef): LevelView {
  const g = new THREE.Group();
  const fadeables: THREE.Mesh[] = [];
  const sc = level.scenery, door = sc.facade?.door;
  // La fachada se recorta con el objeto principal cerca de su puerta
  const nearDoor: FadeRule | undefined = door ? (_x, _y, z) => z < door.z + 3.5 && z > door.z - 8 : undefined;
  for (const b of level.boxes) {
    if (b.kind === 'fence') { addFence(g, b); continue; }
    const m = boxMesh(b);
    if (!m) continue;
    g.add(m);
    if (b.fade) makeFade(m, b, fadeables, b.kind === 'facade' ? nearDoor : b.kind === 'wall' ? (_x, y) => y > 1.6 : undefined);
    if (b.kind === 'block' || b.kind === 'house') addRoof(g, b);
    if (b.kind === 'ramp') addRampStripes(g, b);
    if (b.kind === 'wall' && b.p[1] < 2.2) addSkirting(g, b);
  }
  const truckParts = addTruck(g, fadeables, level.truck);
  if (sc.street) addCurbs(g, sc.street);
  if (sc.stairs) addStairs(g, sc.stairs);
  if (sc.facade && nearDoor) addFacadeDetails(g, fadeables, sc.facade, nearDoor);
  addSigns(g, sc.signs ?? []);
  if (sc.house) addHouse(g, sc.house);
  addNeighbourhood(g, sc.buildings ?? []);
  addTrees(g, fadeables, sc.trees ?? [], sc.flowerBeds ?? []);
  if (level.traffic) addStopLines(g, level.traffic);
  addDecor(g, level);
  addLabels(g, sc.labels ?? []);
  const lights = addTrafficLights(g, level.traffic?.lights ?? []);
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
  // Siguiente objetivo de cada etapa (el aro amarillo)
  const next = level.stages.map((s) => s.next ?? null);

  return {
    group: g,
    fadeables,
    truckParts,
    update(t, light, stage, main) {
      beacon.update(t, next[stage] ?? null, main);
      lights.set(light.cars, light.ped);
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
    update(t: number, n: Vec3 | null, main: Vec3) {
      root.visible = !!n;
      if (!n) return;
      root.position.set(n.x, n.y + 0.04, n.z);
      const d = Math.hypot(main.x - n.x, main.z - n.z);
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

function addCurbs(g: THREE.Group, street: NonNullable<Scenery['street']>) {
  const cm = mat('#efece6', { rough: 0.8 });
  for (const k of street.curbs) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(k.w, 0.04, 0.22), cm);
    c.position.set(k.x, 0.02, k.z);
    c.receiveShadow = true;
    g.add(c);
  }
  // Tapas de alcantarilla
  const lid = mat('#3a3f4a', { rough: 0.6, metal: 0.3 });
  for (const [x, z] of street.manholes) {
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

function addStairs(g: THREE.Group, st: NonNullable<Scenery['stairs']>) {
  const n = st.steps, w = st.x1 - st.x0, cx = (st.x0 + st.x1) / 2;
  const run = (st.z0 - st.z1) / n, rise = st.top / n;
  const wood = mat('#ffffff', { map: TEX.planks(), rough: 0.7 });
  const nose = mat('#fbe9c9');
  for (let i = 0; i < n; i++) {
    const h = rise * (i + 1);
    const geo = worldUV(new THREE.BoxGeometry(w, h, run), new THREE.Vector3(cx, h / 2, st.z0 - run * (i + 0.5)), TEX.planksTile);
    const step = new THREE.Mesh(geo, wood);
    step.position.set(cx, h / 2, st.z0 - run * (i + 0.5));
    step.castShadow = true; step.receiveShadow = true;
    // Canto oscuro de cada peldaño: se lee la escalera desde arriba
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, 0.1), nose);
    edge.position.set(cx, h + 0.005, st.z0 - run * i - 0.05);
    g.add(step, edge);
  }
}

/** Bordes amarillos y negros: señal de peligro en los lados de una rampa (que sube en x, `rz`, o en z, `rx`). */
function addRampStripes(g: THREE.Group, b: Box) {
  const alongX = !b.rx, len = (alongX ? b.h[0] : b.h[2]) * 2, half = alongX ? b.h[2] : b.h[0];
  const rot = new THREE.Euler(b.rx ?? 0, 0, b.rz ?? 0);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      const geo = alongX ? new THREE.BoxGeometry(len / 10, 0.03, 0.18) : new THREE.BoxGeometry(0.18, 0.03, len / 10);
      const seg = new THREE.Mesh(geo, mat(i % 2 ? '#111827' : '#facc15'));
      const u = ((i + 0.5) / 10 - 0.5) * len, o = side * (half - 0.09);
      const local = alongX ? new THREE.Vector3(u, b.h[1] + 0.016, o) : new THREE.Vector3(o, b.h[1] + 0.016, u);
      local.applyEuler(rot);
      seg.position.set(b.p[0] + local.x, b.p[1] + local.y, b.p[2] + local.z);
      seg.rotation.copy(rot);
      g.add(seg);
    }
  }
}

function addFacadeDetails(g: THREE.Group, fadeables: THREE.Mesh[], facade: NonNullable<Scenery['facade']>, nearDoor: FadeRule) {
  const door = facade.door, doorX = (door.x0 + door.x1) / 2;
  const fadeWith = (m: THREE.Mesh) => {
    m.material = (m.material as THREE.MeshStandardMaterial).clone();
    m.userData.fade = 1;
    m.userData.fadeRule = nearDoor;
    fadeables.push(m);
    g.add(m);
  };
  // Marco de la puerta
  const frameMat = mat('#7c3f1d');
  for (const x of [door.x0 - 0.08, door.x1 + 0.08]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, door.top, 0.5), frameMat);
    post.position.set(x, door.top / 2, door.z);
    g.add(post);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(door.x1 - door.x0 + 0.32, 0.16, 0.5), frameMat);
  top.position.set(doorX, door.top, door.z);
  fadeWith(top);
  // Jambas claras con contorno: marcan bien el hueco estrecho aunque la fachada esté recortada
  for (const x of [door.x0 - 0.08, door.x1 + 0.08]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.2, door.top, 0.04), mat('#fde68a'));
    trim.position.set(x, door.top / 2, door.z + 0.27);
    trim.castShadow = true;
    g.add(trim);
  }
  // Felpudo
  const mat1 = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 0.6), mat('#b45309'));
  mat1.position.set(doorX, 0.02, door.z + 0.7);
  g.add(mat1);
  // Escaparates con toldo a rayas y ventanas con persianas
  const awnColors: [string, string][] = [['#ef4444', '#fff7ed'], ['#16a34a', '#fff7ed'], ['#2563eb', '#fff7ed'], ['#f59e0b', '#fff7ed']];
  let k = 0;
  const win = facade.windows;
  for (let x = win.x0; x <= win.x1; x += win.step) {
    if (Math.abs(x - doorX) < 2) continue;
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 0.06), ownMat('#5aa9e6', { rough: 0.25 }));
    w.position.set(x, 1.6, door.z + 0.23);
    fadeWith(w);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.04), ownMat('#fdf6e7'));
    frame.position.set(x, 1.6, door.z + 0.21);
    fadeWith(frame);
    const [a, b] = awnColors[k++ % awnColors.length];
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.8), ownMat('#ffffff', { map: awningTex(a, b) }));
    awn.material.side = THREE.DoubleSide;
    awn.position.set(x, 2.55, door.z + 0.55);
    awn.rotation.x = -0.9;
    awn.castShadow = true;
    fadeWith(awn);
  }
  // Cornisa, de punta a punta de la fachada
  const corn = new THREE.Mesh(new THREE.BoxGeometry(facade.x1 - facade.x0 + 0.4, 0.22, 0.7), ownMat('#f5e6cc'));
  corn.position.set((facade.x0 + facade.x1) / 2, facade.top + 0.05, door.z + 0.05);
  fadeWith(corn);
  const sign = textSprite(facade.number, { size: 40, color: '#ffffff', bg: '#c8553d', pad: 10 });
  sign.position.set(facade.numberX, 2.7, door.z + 0.5);
  sign.scale.multiplyScalar(0.6);
  g.add(sign);
}

/** Carteles pintados en una pared (p. ej. el de la terraza, sobre su muro, sin tapar la rampa), con dos postes. */
function addSigns(g: THREE.Group, signs: NonNullable<Scenery['signs']>) {
  for (const s of signs) {
    const warn = new THREE.Mesh(new THREE.PlaneGeometry(s.w, 0.55), mat('#ffffff', { map: signTex(s.text, { bg: '#facc15', color: '#111827', stripes: true }), rough: 0.6 }));
    warn.position.set(s.x, s.y, s.z);
    g.add(warn);
    for (const x of s.posts) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), mat('#374151'));
      post.position.set(x, s.y - 0.25, s.z - 0.04);
      g.add(post);
    }
  }
}

/** Rótulos flotantes con el nombre del sitio. */
function addLabels(g: THREE.Group, labels: NonNullable<Scenery['labels']>) {
  for (const l of labels) {
    const sign = textSprite(l.text, { size: 40, color: '#ffffff', bg: '#7c3aed', pad: 14 });
    sign.position.set(l.x, l.y, l.z);
    sign.scale.multiplyScalar(0.7);
    g.add(sign);
  }
}

function addHouse(g: THREE.Group, house: NonNullable<Scenery['house']>) {
  // Puerta, toldo y cartel de la casa de salida (delante de su fachada, en `front`)
  const f = house.front;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.1, 0.1), mat('#7c3f1d'));
  door.position.set(house.x, 1.05, f - 0.05);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat('#facc15', { metal: 0.6, rough: 0.3 }));
  knob.position.set(house.x + 0.4, 1.0, f - 0.12);
  g.add(door, knob);
  const sign = textSprite('SALIDA', { size: 40, color: '#ffffff', bg: '#7c3aed', pad: 14 });
  sign.position.set(house.x, 3, f - 0.4);
  sign.scale.multiplyScalar(0.7);
  g.add(sign);
  // Camino de losas del patio hasta la acera
  const stone = mat('#d6cfc4', { rough: 0.9 });
  for (let z = f - 1.2; z > house.pathTo; z -= 1.1) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 9), stone);
    s.position.set(house.x + ((z * 7) % 3) * 0.12 - 0.12, 0.02, z);
    s.receiveShadow = true;
    g.add(s);
  }
}

/** Casas y bloques de fondo, sin colisión, para que la calle parezca un barrio. */
function addNeighbourhood(g: THREE.Group, buildings: NonNullable<Scenery['buildings']>) {
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
  for (const b of buildings) building(b.x0, b.x1, b.z0, b.z1, b.h, b.style);
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

function addTrees(g: THREE.Group, fadeables: THREE.Mesh[], trees: NonNullable<Scenery['trees']>, beds: NonNullable<Scenery['flowerBeds']>) {
  // Árboles junto al recorrido (`fade`): su copa se oculta si tapa a un jugador o al sofá. En el patio los jugadores
  // pasan por debajo (los árboles no tienen colisión) y desaparecían de la vista.
  for (const k of trees) {
    const t = tree(k.x, k.z, k.s, k.hue);
    g.add(t);
    if (!k.fade) continue;
    for (const crown of t.children.slice(1) as THREE.Mesh[]) { crown.userData.fade = 1; crown.userData.mode = 'hide'; fadeables.push(crown); }
  }
  // Arriates con flores (los colores empiezan distinto a cada lado)
  const flowers = ['#f472b6', '#facc15', '#ef4444', '#a78bfa', '#ffffff'];
  for (const b of beds) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, b.len), mat('#7a4b2a'));
    bed.position.set(b.x, 0.09, b.z);
    g.add(bed);
    const n = Math.round((b.len - 0.6) / 0.6);
    for (let i = 0; i < n; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), mat(flowers[(i + (b.x > 0 ? 2 : 0)) % flowers.length]));
      f.position.set(b.x + ((i * 37) % 5) * 0.12 - 0.24, 0.3, b.z - b.len / 2 + 0.4 + i * 0.6);
      f.castShadow = true;
      g.add(f);
    }
  }
}

/** Líneas de detención de los coches, una por carril. */
function addStopLines(g: THREE.Group, traffic: TrafficDef) {
  for (const l of traffic.lanes) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 2.2), mat('#f8f5ec'));
    line.position.set(l.stopX, 0.02, l.z);
    g.add(line);
  }
}

function addTrafficLights(g: THREE.Group, list: TrafficDef['lights']) {
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
  for (const l of list) make(l.x, l.z, l.face);
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


/** Rótulo de los costados del camión: blanco, con franja morada abajo y el nombre de la empresa. */
let truckSide: THREE.CanvasTexture | null = null;
function truckSideTex() {
  if (truckSide) return truckSide;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 376;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PALETTE.truck; ctx.fillRect(0, 0, 1024, 376);
  ctx.fillStyle = '#7c3aed'; ctx.fillRect(0, 300, 1024, 46);
  ctx.fillStyle = '#7c3aed';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 92px system-ui, sans-serif';
  ctx.fillText('MUDANZAS PEPE', 512, 170);
  truckSide = new THREE.CanvasTexture(c);
  truckSide.colorSpace = THREE.SRGBColorSpace;
  truckSide.anisotropy = 8;
  return truckSide;
}

/**
 * Camión de mudanzas: se dibujan sus cajas de choque tal cual (`truckBoxes`: suelo, paredes, techo, rampa, bajos y
 * cabina), así que lo que se ve es lo que choca. Paredes y techo se recortan u ocultan si tapan a alguien que está
 * dentro. Encima, solo pintura a ras de sus caras: rótulo, ruedas, cristales de la cabina y franja de peligro en el borde
 * del suelo de carga.
 */
function addTruck(g: THREE.Group, fadeables: THREE.Mesh[], pose: TruckPose): TruckPart[] {
  const boxes = truckBoxes(pose);
  const parts: TruckPart[] = [];
  const { length: L, width: W, floor: F, wall: t, cab } = TRUCK;
  const sideFace = (dz: number) => {
    // Cara de la caja (orden de `BoxGeometry`: +x, −x, +y, −y, +z, −z) que mira hacia el lado local `dz` del camión
    const d = truckDir(pose, { x: 0, z: dz });
    return d.x > 0.5 ? 0 : d.x < -0.5 ? 1 : d.z > 0.5 ? 4 : 5;
  };
  boxes.forEach((b, i) => {
    let m: THREE.Mesh;
    if (b.kind === 'truckCab') {
      m = new THREE.Mesh(new RoundedBoxGeometry(b.h[0] * 2, b.h[1] * 2, b.h[2] * 2, 3, 0.25), mat('#ef4444', { rough: 0.45 }));
      m.position.set(...b.p);
      m.castShadow = true; m.receiveShadow = true;
    } else if (i === 1 || i === 2) {
      // Paredes de los costados, con el rótulo en su cara de fuera
      const face = sideFace(i === 1 ? -1 : 1);
      const plain = ownMat(PALETTE.truck, { rough: 0.5 }), logo = ownMat('#ffffff', { map: truckSideTex(), rough: 0.5 });
      m = new THREE.Mesh(new THREE.BoxGeometry(b.h[0] * 2, b.h[1] * 2, b.h[2] * 2), [0, 1, 2, 3, 4, 5].map((k) => (k === face ? logo : plain)));
      m.position.set(...b.p);
      m.castShadow = true; m.receiveShadow = true;
    } else {
      m = boxMesh(b)!;
    }
    g.add(m);
    // Esquinas de lo dibujado, en el mundo (el escenario se construye en el origen)
    m.updateMatrixWorld(true);
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox!;
    const corners: Vec3[] = [];
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(m.matrixWorld);
      corners.push({ x: v.x, y: v.y, z: v.z });
    }
    parts.push({ kind: b.kind, corners });
    if (b.fade) makeFade(m, b, fadeables);
    if (b.kind === 'truckRamp') addRampStripes(g, b);
  });
  // Pintura y detalles, a ras de las caras (a menos de 2 cm de los colliders)
  const at = (x: number, y: number, z: number) => truckToWorld(pose, { x, y, z });
  const across = truckDir(pose, { x: 0, z: 1 }), along = truckDir(pose, { x: 1, z: 0 });
  const turn = (o: THREE.Object3D, axis: { x: number; z: number }) => {
    // Gira un cilindro (eje y) para que su eje quede en la dirección horizontal `axis`
    if (Math.abs(axis.z) > 0.5) o.rotation.x = Math.PI / 2; else o.rotation.z = Math.PI / 2;
  };
  // Ruedas pintadas en los costados de los bajos
  const tyre = mat('#111827'), hub = mat('#d1d5db', { metal: 0.5, rough: 0.3 });
  for (const x of [0.9, L - 0.6]) for (const s of [-1, 1]) {
    const p = at(x, 0.4, s * (W / 2 + t + 0.01));
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.02, 18), tyre);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 12), hub);
    for (const o of [w, h]) { o.position.set(p.x, p.y, p.z); turn(o, across); g.add(o); }
  }
  // Cristales de la cabina: el parabrisas en su frente y una ventanilla a cada lado
  const glass = mat('#93c5fd', { rough: 0.15 });
  const front = L + t + cab.length, cw = W + 2 * t - 2 * cab.inset;
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, cw - 0.7), glass);
  const sp = at(front - 0.005, 1.85, 0);
  shield.position.set(sp.x, sp.y, sp.z);
  shield.rotation.y = Math.atan2(-along.z, along.x);
  g.add(shield);
  for (const s of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.03), glass);
    const wp = at(front - 0.75, 1.85, s * (cw / 2 - 0.005));
    win.position.set(wp.x, wp.y, wp.z);
    win.rotation.y = Math.atan2(-along.z, along.x);
    g.add(win);
  }
  // Franja de peligro en el borde del suelo de carga, junto a la abertura
  for (let k = 0; k < 10; k++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, W / 10), mat(k % 2 ? '#111827' : '#facc15'));
    const p = at(0.09, F + 0.005, -W / 2 + (k + 0.5) * (W / 10));
    seg.position.set(p.x, p.y, p.z);
    seg.rotation.y = Math.atan2(-along.z, along.x);
    g.add(seg);
  }
  return parts;
}
