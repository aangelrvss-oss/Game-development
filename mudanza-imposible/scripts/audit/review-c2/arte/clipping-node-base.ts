// Revisión independiente del ciclo 2 (rol arte técnico y animación). Solo lectura: mide el clipping en Node con la
// física y el dibujo del juego (DollView, ItemView y SofaView construidos sin navegador), partidas con el piloto.
// Mide por fotograma (cada 2 pasos de física):
//  - CUERPO: vértices del tronco y la cabeza dibujados del muñeco dentro de colliders ajenos (objetos, camión, otros);
//  - MANOS: manopla (centro) frente a la superficie del objeto agarrado: distancia fuera (flota) o profundidad dentro;
//  - BOTAS: esquinas de la suela de los pies apoyados frente al suelo fijo (hundidas / flotando), por zona;
//  - OBJETO-ESCENARIO: vértices DIBUJADOS de cada objeto dentro de piezas fijas (paredes, techo y suelo del camión,
//    rampa, suelo, setos) y colliders de objeto frente a colliders fijos (contacto con distancia negativa);
//  - OBJETO-OBJETO: colliders de un objeto dentro de los de otro.
// VARIANTE PARA 657fd30 (solo «La calle» y el sofá; importa del worktree temporal de la base).
// Uso: npx vite-node scripts/audit/review-c2/arte/clipping-node-base.ts -- <nivel: pruebas|calle> <humanos> [ayudantes] [estilo] [maxSeg]
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

const ctx2d = new Proxy({}, {
  get: (_t, k) => (k === 'measureText' ? () => ({ width: 40 }) : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}),
  set: () => true,
});
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };

const { Game } = await import('/tmp/claude-0/review-c2/arte/base/mudanza-imposible/src/sim/game');
const { Autopilot } = await import('/tmp/claude-0/review-c2/arte/base/mudanza-imposible/src/sim/autopilot');
const { LEVEL } = await import('/tmp/claude-0/review-c2/arte/base/mudanza-imposible/src/sim/level');
const { DollView } = await import('/tmp/claude-0/review-c2/arte/base/mudanza-imposible/src/view/doll/dollView');
const { CarrierView } = await import('/tmp/claude-0/review-c2/arte/base/mudanza-imposible/src/view/carrierView');
const { SofaView } = await import('/tmp/claude-0/review-c2/arte/base/mudanza-imposible/src/view/sofaView');
const { sofaUp } = await import('/tmp/claude-0/review-c2/arte/base/mudanza-imposible/src/sim/sofa');

await RAPIER.init({});
const args = process.argv.slice(2).filter((a) => a !== '--');
const levelKey = args[0] ?? 'pruebas';
const humans = +(args[1] ?? 2);
const carriers = +(args[2] ?? humans);
const style = (args[3] ?? 'atentos') as 'atentos' | 'despistados';
const maxT = +(args[4] ?? 150);
const DT = 1 / 60;
const g: any = new Game(RAPIER, { humans, carriers, botStyle: style, seed: 1 });
// Adaptador: la base tiene un solo objeto (el sofá)
const sofaDef = { id: 'sofa', draw: 'sofa' };
(g as any).items = [{ def: sofaDef, index: 0, body: g.sofa, colliders: g.sofaColliders, integrity: 100 }];
(g as any).itemOf = (b: unknown) => (b === g.sofa ? (g as any).items[0] : null);
(g as any).level = { boxes: LEVEL };
const aps = Autopilot.team(g);
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 400);
camera.position.set(0, 30, 20);
const views = g.carriers.map((c) => (c.human !== null ? new DollView(c, c.human, g.world, camera) : new CarrierView(c, c.human, undefined, g.world)));
const itemViews = [new SofaView()];

// --- Colliders: quién es quién ---
const who = new Map<number, string>();
g.items.forEach((it) => it.colliders.forEach((c) => who.set(c.handle, `item:${it.def.id}#${it.index}`)));
g.carriers.forEach((c) => who.set(c.collider.handle, `carrier:${c.id}`));
const boxes = (LEVEL as any[]).filter((b) => b.solid);
g.world.forEachCollider((col) => {
  if (who.has(col.handle)) return;
  const p = col.translation(), he = (col.shape as RAPIER.Cuboid).halfExtents;
  const b = boxes.find((b) => Math.abs(b.p[0] - p.x) < 1e-3 && Math.abs(b.p[1] - p.y) < 1e-3 && Math.abs(b.p[2] - p.z) < 1e-3 && he && Math.abs(b.h[0] - he.x) < 1e-3);
  who.set(col.handle, b ? `fixed:${b.kind}` : (col.parent()?.isFixed() ? 'fixed:otro' : 'dyn:otro'));
});
const kindOf = (h: number) => who.get(h) ?? '?';

// --- Utilidades ---
function meshPoints(root: THREE.Object3D, every: number, skipInk = true): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  root.traverse((o) => {
    if (skipInk && (o.userData.ink || o.parent?.userData.ink)) return;
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    if ((m.material as THREE.Material).side === THREE.BackSide) return; // contorno de dibujo animado
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += every) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  });
  return pts;
}
type Rig = { torso: THREE.Object3D; hands: THREE.Object3D[]; boots: THREE.Object3D[]; group: THREE.Object3D; debug: { feet: { swinging: boolean; sole: number[][] }[] } | null };
const rigOf = (v: unknown) => (v as { rig?: Rig }).rig;
function torsoPoints(rig: Rig) {
  rig.group.updateMatrixWorld(true);
  const out: THREE.Vector3[] = [];
  rig.torso.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i += 3) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)); } });
  return out;
}
/** Profundidad (m) de los puntos dentro de colliders cercanos que no sean `skip`; agrupado por clase. */
function depthByKind(pts: THREE.Vector3[], center: RAPIER.Vector, radius: number, skip: Set<number>) {
  const near: RAPIER.Collider[] = [];
  g.world.intersectionsWithShape(center, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(radius), (o) => { if (!skip.has(o.handle)) near.push(o); return true; });
  const res: Record<string, number> = {};
  for (const col of near) {
    let worst = 0;
    for (const p of pts) { const pr = col.projectPoint(p, false); if (pr?.isInside) worst = Math.max(worst, Math.hypot(pr.point.x - p.x, pr.point.y - p.y, pr.point.z - p.z)); }
    if (worst > 0) { const k = kindOf(col.handle); res[k] = Math.max(res[k] ?? 0, worst); }
  }
  return res;
}
/** Distancia con signo de un punto a un conjunto de colliders (negativa = dentro). */
function signedDist(p: THREE.Vector3, cols: RAPIER.Collider[]) {
  let best = Infinity;
  for (const col of cols) {
    const pr = col.projectPoint(p, false);
    if (!pr) continue;
    const d = Math.hypot(pr.point.x - p.x, pr.point.y - p.y, pr.point.z - p.z);
    best = Math.min(best, pr.isInside ? -d : d);
  }
  return best;
}
const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
function groundAt(x: number, z: number, from: number) {
  ray.origin = { x, y: from + 1.2, z };
  const hit = g.world.castRay(ray, 4, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
  if (!hit) return { y: from, kind: 'nada' };
  return { y: from + 1.2 - hit.timeOfImpact, kind: kindOf(hit.collider.handle) };
}

// --- Acumuladores ---
type Stat = { max: number; n: number; over3: number; over6: number; frames: number };
const stats = new Map<string, Stat>();
const add = (key: string, v: number, counted = true) => {
  const s = stats.get(key) ?? { max: 0, n: 0, over3: 0, over6: 0, frames: 0 };
  s.frames++; if (counted) { s.n++; s.max = Math.max(s.max, v); if (v > 0.03) s.over3++; if (v > 0.06) s.over6++; }
  stats.set(key, s);
};
const worstAt = new Map<string, string>();
const note = (key: string, v: number) => {
  const prev = worstAt.get(key);
  const pv = prev ? +prev.split('|')[0] : -1;
  if (v > pv) worstAt.set(key, `${v.toFixed(3)}|t=${g.time.toFixed(2)} stage=${g.stageLabel}`);
};

// Recorrido
let frame = 0, falls = 0;
const loaded: string[] = [];
for (let i = 0; i < 60 * maxT && (g.phase === 'countdown' || g.phase === 'playing'); i++) {
  const inputs = aps.map((a) => a.input(g, DT));
  g.step(DT, inputs);
  for (const e of g.out) { if (e.type === 'fall') falls++; if (e.type === 'itemLoaded') loaded.push(`${(e as { id?: string }).id}@${g.time.toFixed(1)}`); }
  if (i % 2) continue;
  frame++;
  // sincroniza el dibujo
  itemViews[0].sync(g.sofa, g.integrity, sofaUp(g.sofa), g.time, 2 * DT);
  views.forEach((v) => { const gw = v.carrier.grabWorld(); v.sync(gw ? new THREE.Vector3(gw.x, gw.y, gw.z) : null, g.time, 2 * DT); });
  if (g.phase !== 'playing') continue;
  // Muñecos (solo los de jugador: DollView)
  views.forEach((v, ci) => {
    if (!(v instanceof DollView)) return;
    const rig = rigOf(v);
    if (!rig) return;
    const c = g.carriers[ci];
    const state = c.down ? `caido-${c.down}` : c.heldBody ? 'agarrando' : 'libre';
    const zone = (() => { const gr = groundAt(c.pos.x, c.pos.z, c.pos.y - 0.69); return gr.kind.replace('fixed:', ''); })();
    // cuerpo
    const d = depthByKind(torsoPoints(rig), c.collider.translation(), 1.4, new Set([c.collider.handle]));
    for (const [k, val] of Object.entries(d)) {
      const cls = k.startsWith('item:') ? 'objeto' : k.startsWith('carrier') ? 'muñeco' : k.replace('fixed:', '');
      const key = `CUERPO ${state} vs ${cls}`;
      add(key, val); note(key, val);
    }
    // manos
    if (c.heldBody) {
      const it = g.itemOf(c.heldBody);
      if (it) {
        const hs = rig.hands.map((h) => h.getWorldPosition(new THREE.Vector3()));
        for (const hp of hs) {
          const sd = signedDist(hp, it.colliders); // centro de la manopla
          const palmR = 0.09 * 0.891;
          const gap = sd - palmR; // >0: la manopla no toca el objeto; <-palmR: el centro está dentro
          const key = `MANO ${it.def.id} hueco (centro-superficie menos radio)`;
          add(key, Math.max(0, gap)); note(key, Math.max(0, gap));
          if (gap > 0.15 && process.env.DETALLE) console.log(`  mano lejos: J${ci + 1} ${it.def.id} hueco ${(gap * 100).toFixed(1)} cm t=${g.time.toFixed(2)} down=${c.down} estado=${(v as unknown as { src: { state: string } }).src?.state} grab=${JSON.stringify(c.grabWorld())} mano=${hp.toArray().map((x) => x.toFixed(2))}`);
          const k2 = `MANO ${it.def.id} centro dentro`;
          add(k2, Math.max(0, -sd)); note(k2, Math.max(0, -sd));
        }
      }
    }
    // botas (apoyadas, de pie)
    if (!c.down && rig.debug) {
      rig.debug.feet.forEach((f) => {
        if (f.swinging) return;
        let sink = 0, flo = Infinity, kind = '';
        for (const s of f.sole) {
          const gr = groundAt(s[0], s[2], s[1] - 0.9);
          kind = gr.kind.replace('fixed:', '');
          sink = Math.max(sink, gr.y - s[1]);
          flo = Math.min(flo, s[1] - gr.y);
        }
        add(`BOTA hundida en ${kind}`, Math.max(0, sink)); note(`BOTA hundida en ${kind}`, sink);
        add(`BOTA flota sobre ${kind} (esquina más baja)`, Math.max(0, flo)); note(`BOTA flota sobre ${kind} (esquina más baja)`, flo);
      });
    }
    void zone;
  });
  // Objetos frente a escenario y frente a otros objetos (cada 5 fotogramas: es caro)
  if (frame % 5 === 0) {
    g.items.forEach((it, k) => {
      const pts = meshPoints(itemViews[k].group, 4);
      const own = new Set(it.colliders.map((c) => c.handle));
      g.carriers.forEach((c) => own.add(c.collider.handle));
      const d = depthByKind(pts, it.body.translation(), 2.5, own);
      for (const [kk, val] of Object.entries(d)) {
        const cls = kk.startsWith('item:') ? 'otro objeto' : kk.replace('fixed:', '');
        const key = `DIBUJO ${it.def.id} dentro de ${cls}`;
        add(key, val); note(key, val);
      }
      // colliders: contacto negativo
      for (const col of it.colliders) {
        g.world.intersectionsWithShape(col.translation(), col.rotation(), col.shape, (o) => {
          if (own.has(o.handle)) return true;
          const kc = col.contactCollider(o, 0);
          if (kc && kc.distance < 0) {
            const kk = kindOf(o.handle); const cls = kk.startsWith('item:') ? 'otro objeto' : kk.replace('fixed:', '');
            const key = `COLLIDER ${it.def.id} solapa ${cls}`;
            add(key, -kc.distance); note(key, -kc.distance);
          }
          return true;
        });
      }
    });
  }
}
console.log(`# ${levelKey} humanos=${humans} porteadores=${carriers} ${style}: fase ${g.phase} t=${g.time.toFixed(2)} caídas=${falls} integridad=${g.integrity} cargados: ${loaded.join(' ')}`);
const rows = [...stats.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [k, s] of rows) {
  if (s.max < 0.005 && !k.startsWith('MANO')) continue;
  console.log(`${k.padEnd(62)} max ${(s.max * 100).toFixed(1).padStart(6)} cm | >3cm ${((100 * s.over3) / Math.max(1, s.n)).toFixed(1).padStart(5)} % | >6cm ${((100 * s.over6) / Math.max(1, s.n)).toFixed(1).padStart(5)} % | n=${s.n} | peor ${worstAt.get(k)?.split('|')[1] ?? ''}`);
}
g.dispose();
