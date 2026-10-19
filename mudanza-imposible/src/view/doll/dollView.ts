import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CARRIER, CENTER_Y, type Carrier } from '../../sim/carrier';
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

/** Al caer: tiempo hasta quedar tumbado (s) y lo que dura levantarse al final del tiempo en el suelo. */
const FALL_TIME = 0.35;
const RECOVER_TIME = 0.6;
const LIE_ANGLE = 1.45;

const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
/** Desplazamiento máximo del dibujo respecto a la cápsula física (m): de pie y tumbado. */
const MAX_OFF_UP = 0.2;
const MAX_OFF_DOWN = 0.6;

/**
 * Vista de un jugador humano con el muñeco del laboratorio. Adapta el porteador del juego (cápsula de pie,
 * física cooperativa, agarre por rótula) a lo que lee el muñeco (`DollSource`). No cambia nada de la física:
 * - De pie: posición, velocidad, orientación, desequilibrio y agarre salen tal cual del porteador.
 * - En el suelo: la cápsula sigue de pie en el juego, así que el giro del cuerpo tumbado (hacia donde perdió el
 *   equilibrio, o hacia donde salió despedido por un coche) y el levantarse se sintetizan aquí.
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
  private wasStunned = false;
  private stunTotal = 1;
  private fallDir = { x: 0, z: 1 };
  private effort = 0;

  /**
   * Desplazamiento del dibujo respecto al cuerpo físico (solo horizontal). La cápsula física es algo más
   * estrecha que el muñeco (0,32 m frente a 0,36 m de tronco) y el muñeco se inclina y se tumba sin que la
   * cápsula lo haga: cuando el dibujo se mete en el sofá, se aparta lo justo, de forma suave.
   */
  private visOff = new THREE.Vector3();
  private ball = new RAPIER.Ball(0.25);

  constructor(readonly carrier: Carrier, playerIndex: number, private world: RAPIER.World, private camera: THREE.Camera, private sofaColliders: RAPIER.Collider[] = []) {
    this.rig = new CharacterRig(PLAYER_LOOKS[playerIndex % PLAYER_LOOKS.length]);
    this.group = this.rig.group;
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
      heightAt: (x, z) => self.heightAt(x, z),
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
    const stunned = c.stunned > 0;
    if (stunned && !this.wasStunned) {
      // Empieza la caída: hacia donde perdió el equilibrio, o hacia donde le lanzó el golpe (lo decide el juego)
      this.stunTotal = c.knock === 'balance' ? CARRIER.fallTime : CARRIER.stunTime;
      this.fallDir = this.freeFallDir(c.fallDir);
    }
    this.wasStunned = stunned;
    const speed = Math.hypot(v.x, v.z), want = Math.hypot(c.wantVel.x, c.wantVel.z);
    // Esfuerzo: tensión del agarre (la mano se separa del punto agarrado) y empujar sin avanzar
    let strain = 0;
    if (sofaGrab) {
      const h = c.handWorld();
      strain = Math.min(1, Math.hypot(sofaGrab.x - h.x, sofaGrab.y - h.y, sofaGrab.z - h.z) / CARRIER.gripBreak);
    }
    const effortGoal = c.holding ? Math.min(1, 0.35 + strain * 0.9 + (want > 0.3 && speed < want * 0.6 ? 0.45 : 0)) : 0;
    this.effort += (effortGoal - this.effort) * Math.min(1, dt * 4);

    let state: DollState;
    let upright = true;
    if (stunned) {
      upright = false;
      const elapsed = this.stunTotal - c.stunned;
      const recovering = c.stunned < RECOVER_TIME;
      state = recovering ? 'recovering' : 'falling';
      const a = recovering ? LIE_ANGLE * smooth(c.stunned / RECOVER_TIME) : LIE_ANGLE * smooth(elapsed / FALL_TIME);
      const d = this.fallDir, h = Math.sin(a / 2);
      // Giro alrededor del eje horizontal perpendicular a la caída: el cuerpo se va hacia `d`
      s.rotation = { x: d.z * h, y: 0, z: -d.x * h, w: Math.cos(a / 2) };
      // Gira alrededor de los pies, sin hundirse en el suelo (tumbado, el tronco queda a su grosor del suelo)
      const ground = this.heightAt(p.x, p.z);
      s.pos = { x: p.x + d.x * Math.sin(a) * CENTER_Y, y: Math.max(this.footY + Math.cos(a) * CENTER_Y, ground + 0.3), z: p.z + d.z * Math.sin(a) * CENTER_Y };
    } else {
      s.pos = p;
      s.rotation = { x: 0, y: 0, z: 0, w: 1 };
      if (c.wobbling) state = 'losingBalance';
      else if (c.holding) state = want > 0.3 || this.effort > 0.55 ? 'pulling' : 'grabbing';
      else state = speed > 0.35 || want > 0.3 ? 'walking' : 'idle';
    }
    s.state = state;
    s.upright = upright;
    s.vel = v;
    s.facing = c.facing;
    s.leanDev = c.lean;
    s.leanVel = c.leanVel;
    // Inclinación total: el desequilibrio, más colgarse hacia atrás al tirar o adelantarse al andar
    s.lean = c.holding
      ? { x: c.lean.x - c.handDir.x * 0.16 * this.effort, z: c.lean.z - c.handDir.z * 0.16 * this.effort }
      : { x: c.lean.x + c.wantVel.x * 0.02, z: c.lean.z + c.wantVel.z * 0.02 };
    s.holding = c.holding && !!sofaGrab;
    s.effort = this.effort;
    s.wantVel = c.wantVel;
    s.handDir = c.handDir;
    s.grabWorld = () => (sofaGrab ? { x: sofaGrab.x, y: sofaGrab.y, z: sofaGrab.z } : null);
    this.rig.sync(s, dt, this.camera);
    // Agarrando, las manos van al asa y el cuerpo ya no solapa (el choque físico está activo): sin desplazar.
    const offGoal = s.holding ? new THREE.Vector3() : this.pushOut(upright ? MAX_OFF_UP : MAX_OFF_DOWN);
    this.visOff.lerp(offGoal, 1 - Math.exp(-dt * 18));
    this.group.position.copy(this.visOff);

    // Aro de jugador, punto de agarre, etiqueta y estrellas de mareo
    const o = this.visOff;
    this.ring.position.set(p.x + o.x, this.footY + 0.04, p.z + o.z);
    this.grip.visible = !!sofaGrab;
    if (sofaGrab) this.grip.position.copy(sofaGrab);
    const top = upright ? p.y + 1.15 : s.pos.y + 0.7;
    if (this.label) this.label.position.set(s.pos.x + o.x, top + 0.25, s.pos.z + o.z);
    this.stars.visible = stunned && c.stunned > RECOVER_TIME;
    if (this.stars.visible) { this.stars.position.set(s.pos.x + o.x, top - 0.05, s.pos.z + o.z); this.stars.rotation.y += dt * 5; }
  }

  /** Cuánto entra la esfera en el sofá (m, positivo = dentro) y hacia dónde salir (horizontal). */
  private sofaDepth(c: THREE.Vector3, r: number): { d: number; nx: number; nz: number } {
    let best = { d: -Infinity, nx: 0, nz: 0 };
    for (const col of this.sofaColliders) {
      const pr = col.projectPoint(c, false);
      if (!pr) continue;
      let nx = c.x - pr.point.x, nz = c.z - pr.point.z;
      const dist = Math.hypot(nx, c.y - pr.point.y, nz);
      const d = pr.isInside ? r + dist : r - dist;
      if (d <= best.d) continue;
      if (pr.isInside) { nx = -nx; nz = -nz; }
      let l = Math.hypot(nx, nz);
      if (l < 1e-3) { const o = col.translation(); nx = c.x - o.x; nz = c.z - o.z; l = Math.hypot(nx, nz) || 1; }
      best = { d, nx: nx / l, nz: nz / l };
    }
    return best;
  }

  /** Desplazamiento horizontal que saca el tronco y la cabeza dibujados del sofá (hasta `max` m). */
  private pushOut(max: number) {
    const spheres = this.rig.bodySpheres();
    const off = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let it = 0; it < 4; it++) {
      let worst = { d: 0.004, nx: 0, nz: 0 };
      for (const sp of spheres) {
        const k = this.sofaDepth(c.copy(sp.c).add(off), sp.r);
        if (k.d > worst.d) worst = k;
      }
      if (worst.nx === 0 && worst.nz === 0) break;
      off.x += worst.nx * (worst.d + 0.005); off.z += worst.nz * (worst.d + 0.005);
    }
    if (off.length() > max) off.setLength(max);
    return off;
  }

  /**
   * Hacia dónde se dibuja la caída: la dirección del golpe si el cuerpo tumbado cabe ahí; si no (el sofá, una
   * pared), la libre más parecida. Se decide una vez, al empezar la caída.
   */
  private freeFallDir(d0: { x: number; z: number }) {
    const p = this.carrier.pos, feetY = p.y - CENTER_Y;
    const fits = (dx: number, dz: number) => {
      for (const h of [0.5, 0.85, 1.15]) {
        const c = new THREE.Vector3(p.x + dx * h, feetY + 0.32, p.z + dz * h);
        if (this.sofaDepth(c, 0.28).d > 0) return false;
        let hit = false;
        this.world.intersectionsWithShape(c, { x: 0, y: 0, z: 0, w: 1 }, this.ball, () => { hit = true; return false; }, RAPIER.QueryFilterFlags.ONLY_FIXED);
        if (hit) return false;
      }
      return true;
    };
    for (const a of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.6, -2.6, Math.PI]) {
      const cs = Math.cos(a), sn = Math.sin(a), dx = d0.x * cs - d0.z * sn, dz = d0.x * sn + d0.z * cs;
      if (fits(dx, dz)) return { x: dx, z: dz };
    }
    return { ...d0 };
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
