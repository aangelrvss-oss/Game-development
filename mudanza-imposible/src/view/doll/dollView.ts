import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CARRIER, CENTER_Y, DOLL_HEIGHT, DOLL_SCALE, type Carrier } from '../../sim/carrier';
import { PLAYER_COLORS } from '../carrierView';
import { textSprite } from '../text';
import { CharacterRig, LOOK, type DollSource, type DollState, type Look } from './dollRig';

/**
 * Colores de cada jugador sobre el muñeco del laboratorio: J1 conserva el peto y la gorra rojos del diseño
 * original; los demás cambian peto, gorra y pelo para distinguirse de lejos (además del aro y la etiqueta).
 */
export const PLAYER_LOOKS: Look[] = [
  LOOK,
  { ...LOOK, overalls: '#1597b8', overallsDark: '#0d6f88', cap: '#1fb5d6', capBand: '#0d7f99', hair: '#2b2118', shirt: '#fbf3d9' },
  { ...LOOK, overalls: '#d0457f', overallsDark: '#9c2f5c', cap: '#ec6aa0', capBand: '#b8386e', hair: '#c9a15a' },
  { ...LOOK, overalls: '#5f9c2a', overallsDark: '#447420', cap: '#86c23c', capBand: '#4f8a22', hair: '#8a4b2b' },
];

/** Nombre de cada jugador en la interfaz (por el color de su peto). */
export const PLAYER_NAMES = ['Porteador rojo', 'Porteador turquesa', 'Porteadora rosa', 'Porteador verde'];

/** Nombre para mensajes: el del jugador si es humano, el del reparto si es un ayudante. */
export const carrierName = (c: Carrier) => (c.human !== null ? PLAYER_NAMES[c.human] ?? `J${c.human + 1}` : c.cast.name);

/** Escala del muñeco (del modelo al mundo) y su inversa. */
const S = DOLL_SCALE, IS = 1 / DOLL_SCALE;

/**
 * Vista de un jugador humano con el muñeco del laboratorio. Adapta el porteador del juego a lo que lee el muñeco
 * (`DollSource`) y no cambia nada de la física. Lo dibujado es el cuerpo físico, sin desplazarlo nunca:
 * - El muñeco se dibuja a escala `DOLL_SCALE`: su tronco tiene el radio de la cápsula y su altura, la de la cápsula.
 *   El muñeco trabaja en las unidades del modelo; aquí se pasan posiciones y velocidades del mundo a ellas.
 * - De pie, el muñeco ocupa la cápsula (misma anchura y altura, `CARRIER`). Su inclinación (el desequilibrio,
 *   colgarse hacia atrás al tirar, adelantarse al andar) es solo de dibujo: se limita a lo que cabe sin meterse en
 *   nada (`fitLean`), en vez de apartar el muñeco de lo que atraviesa.
 * - En el suelo, el muñeco se dibuja con la pose del collider tumbado (`Carrier.stepDown`): la misma dirección y el
 *   mismo ángulo que la simulación, no una caída inventada.
 * - El suelo bajo los pies se consulta con un rayo solo contra la geometría fija (ni el sofá ni otros porteadores).
 */
export class DollView {
  readonly group: THREE.Group;
  private rig: CharacterRig;
  private ring: THREE.Mesh;
  private grip: THREE.Mesh;
  private stars: THREE.Group;
  label?: THREE.Sprite;
  private src: DollSource;
  private effort = 0;
  /**
   * Parte de arriba del cuerpo dibujado (tronco y cabeza, del ombligo a la gorra) como cápsula del radio del tronco:
   * con ella se comprueba si la inclinación dibujada cabe. Sin margen: lo que sobresale del tronco (la nariz, la
   * visera) ya gasta casi todo el de las pruebas. `upperMid` es la altura de su centro sobre los pies.
   */
  private upper: RAPIER.Capsule;
  private upperMid: number;
  /** Fracción de la inclinación dibujada que cabe (baja al momento; sube suavizada) y paso del fotograma. */
  private leanFit = 1;
  private dt = 1 / 60;
  /** La cámara, en las unidades del modelo (el muñeco mira hacia ella). */
  private eye = { position: new THREE.Vector3() };

  constructor(readonly carrier: Carrier, playerIndex: number, private world: RAPIER.World, private camera: THREE.Camera) {
    this.rig = new CharacterRig(PLAYER_LOOKS[playerIndex % PLAYER_LOOKS.length]);
    this.group = this.rig.group;
    this.group.scale.setScalar(S);
    // Centros de sus esferas: a la altura del ombligo y en la de arriba de la cápsula (bajo la gorra)
    const y0 = 0.75 * S, y1 = DOLL_HEIGHT - CARRIER.radius;
    this.upper = new RAPIER.Capsule((y1 - y0) / 2, CARRIER.radius);
    this.upperMid = (y0 + y1) / 2;
    const color = PLAYER_COLORS[playerIndex] ?? '#ffffff';
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.54, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.grip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color }));
    this.grip.visible = false;
    this.label = textSprite(`J${playerIndex + 1}`, { size: 40, color: '#1f2937', bg: color, pad: 8 });
    this.label.scale.multiplyScalar(0.5);
    this.stars = new THREE.Group();
    const starMat = new THREE.MeshStandardMaterial({ color: '#fde047', emissive: '#b45309' });
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), starMat);
      const a = (i / 5) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.36, Math.sin(a * 2) * 0.04, Math.sin(a) * 0.36);
      this.stars.add(s);
    }
    this.stars.visible = false;
    const c = carrier;
    const self = this;
    this.src = {
      state: 'idle', pos: c.pos, vel: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, upright: true,
      facing: c.facing, lean: { x: 0, z: 0 }, leanDev: c.lean, leanVel: c.leanVel, holding: false, effort: 0,
      wantVel: c.wantVel, handDir: c.handDir, grabWorld: () => null,
      heightAt: (x, z) => self.heightAt(x * S, z * S) * IS,
      fitTilt: (x, z) => self.fitTilt(x, z),
    };
    this.rig.snap();
  }

  /** Objetos que viven en el mundo (no giran con el personaje). */
  worldObjects(): THREE.Object3D[] { return [this.ring, this.grip, this.stars, ...(this.label ? [this.label] : [])]; }

  /** El tirón que arranca el asa ya lo muestra el equilibrio (tambaleo o caída). */
  stumble() {}

  private footY = 0;
  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  /** Altura del suelo fijo bajo (x, z), buscando desde un poco por encima de los pies. */
  heightAt(x: number, z: number) {
    const top = this.footY + 1.2;
    this.ray.origin = { x, y: top, z };
    const hit = this.world.castRay(this.ray, 3.5, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
    return hit ? top - hit.timeOfImpact : this.footY;
  }

  sync(sofaGrab: THREE.Vector3 | null, _t: number, dt: number) {
    const c = this.carrier, s = this.src;
    const p = c.pos, v = c.body.linvel();
    this.footY = p.y - CENTER_Y;
    const speed = Math.hypot(v.x, v.z), want = Math.hypot(c.wantVel.x, c.wantVel.z);
    // Esfuerzo: lo que tira la mano (`strain`: arrastrar solo algo pesado lo pone al límite), que el punto agarrado
    // se le separe de la mano, y empujar sin avanzar
    let strain = 0;
    if (sofaGrab) {
      const h = c.handWorld();
      strain = Math.max(c.strain, Math.min(1, Math.hypot(sofaGrab.x - h.x, sofaGrab.y - h.y, sofaGrab.z - h.z) / CARRIER.gripBreak));
    }
    const effortGoal = c.holding ? Math.min(1, 0.35 + strain * 0.9 + (want > 0.3 && speed < want * 0.6 ? 0.45 : 0)) : 0;
    this.effort += (effortGoal - this.effort) * Math.min(1, dt * 4);

    let state: DollState;
    const upright = !c.down;
    // Pose de la cápsula física: tumbada (o levantándose), el muñeco va exactamente con ella
    const k = c.collider.translation(), q = c.collider.rotation();
    if (c.down) {
      state = c.down === 'rising' ? 'recovering' : 'falling';
      s.rotation = { x: q.x, y: q.y, z: q.z, w: q.w };
      s.pos = { x: k.x * IS, y: k.y * IS, z: k.z * IS };
    } else {
      s.pos = { x: p.x * IS, y: p.y * IS, z: p.z * IS };
      s.rotation = { x: 0, y: 0, z: 0, w: 1 };
      if (c.wobbling) state = 'losingBalance';
      else if (c.holding) state = want > 0.3 || this.effort > 0.55 ? 'pulling' : 'grabbing';
      else state = speed > 0.35 || want > 0.3 ? 'walking' : 'idle';
    }
    s.state = state;
    s.upright = upright;
    s.vel = { x: v.x * IS, y: v.y * IS, z: v.z * IS };
    s.facing = c.facing;
    s.leanDev = c.lean;
    s.leanVel = c.leanVel;
    // Inclinación total: el desequilibrio, más colgarse hacia atrás al tirar o adelantarse al andar (el muñeco la
    // reduce a lo que cabe con `fitTilt`)
    s.lean = c.holding
      ? { x: c.lean.x - c.handDir.x * 0.16 * this.effort, z: c.lean.z - c.handDir.z * 0.16 * this.effort }
      : { x: c.lean.x + c.wantVel.x * 0.02, z: c.lean.z + c.wantVel.z * 0.02 };
    s.holding = c.holding && !!sofaGrab;
    s.effort = this.effort;
    s.wantVel = { x: c.wantVel.x * IS, z: c.wantVel.z * IS };
    s.handDir = c.handDir;
    s.grabWorld = () => (sofaGrab ? { x: sofaGrab.x * IS, y: sofaGrab.y * IS, z: sofaGrab.z * IS } : null);
    this.eye.position.copy(this.camera.position).multiplyScalar(IS);
    this.dt = dt;
    this.rig.sync(s, dt, this.eye);

    // Aro de jugador (bajo el cuerpo, de pie o tumbado), punto de agarre, etiqueta y estrellas de mareo sobre la cabeza
    this.ring.position.set(k.x, this.footY + 0.04, k.z);
    this.grip.visible = !!sofaGrab;
    if (sofaGrab) this.grip.position.copy(sofaGrab);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    const head = new THREE.Vector3(k.x, k.y, k.z).addScaledVector(up, CARRIER.halfHeight);
    const top = upright ? p.y + DOLL_HEIGHT - CENTER_Y : head.y + CARRIER.radius;
    if (this.label) this.label.position.set(head.x, top + 0.4, head.z);
    this.stars.visible = !!c.down && c.down !== 'rising';
    if (this.stars.visible) { this.stars.position.set(head.x, top + 0.1, head.z); this.stars.rotation.y += dt * 5; }
  }

  /**
   * Fracción de la inclinación (x, z) de la parte de arriba del cuerpo que cabe (la pide el muñeco, `DollSource`). Se
   * inclina alrededor de los pies y la cápsula de pie no: se prueban el tronco y la cabeza inclinados contra todo
   * (sofá, paredes, otros porteadores) con una consulta de forma y, si no caben, se busca por bisección cuánto
   * inclinarse. Baja al momento y vuelve a subir suavizada.
   */
  private fitTilt(x: number, z: number) {
    const fit = this.tiltRoom(x, z);
    this.leanFit = fit < this.leanFit ? fit : this.leanFit + (fit - this.leanFit) * Math.min(1, this.dt * 6);
    return this.leanFit;
  }

  private tiltRoom(x: number, z: number) {
    const l = Math.min(1.2, Math.hypot(x, z)); // el muñeco no se inclina más
    if (l < 0.01) return 1;
    const d = { x: x / Math.hypot(x, z), z: z / Math.hypot(x, z) };
    const fits = (a: number) => {
      const h = Math.sin(a / 2), m = this.upperMid, p = this.carrier.pos;
      const c = { x: p.x + d.x * Math.sin(a) * m, y: p.y - CENTER_Y + Math.cos(a) * m, z: p.z + d.z * Math.sin(a) * m };
      let hit = false;
      this.world.intersectionsWithShape(c, { x: d.z * h, y: 0, z: -d.x * h, w: Math.cos(a / 2) }, this.upper, () => { hit = true; return false; }, undefined, undefined, this.carrier.collider);
      return !hit;
    };
    if (fits(l)) return 1;
    let lo = 0, hi = 1;
    for (let i = 0; i < 3; i++) { const mid = (lo + hi) / 2; if (fits(l * mid)) lo = mid; else hi = mid; }
    return lo;
  }

  dispose() {
    const mats = new Set<THREE.Material>();
    for (const root of [this.group, this.ring, this.grip, this.stars]) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mm = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mm)) mm.forEach((x) => mats.add(x)); else if (mm) mats.add(mm);
      });
    }
    if (this.label) { this.label.material.map?.dispose(); mats.add(this.label.material); }
    // Todos los materiales son propios de este muñeco (ninguno sale de la caché compartida)
    for (const m of mats) m.dispose();
  }
}
