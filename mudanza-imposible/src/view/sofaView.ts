import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { ItemDef } from '../sim/items';
import { mat, PALETTE } from './materials';
import { TEX } from './textures';

const CREAM = '#f1dfbd';
const CUSHION = '#f8ecd2';
const PIPING = '#b9844c';
const WOOD = '#7c3f1d';

const inkMat = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });
/** Contorno de dibujo animado: copia por detrás con un grosor constante en cada eje. */
function ink(m: THREE.Mesh, size: THREE.Vector3, t = 0.035) {
  const o = new THREE.Mesh(m.geometry, inkMat);
  o.scale.set(1 + (2 * t) / size.x, 1 + (2 * t) / size.y, 1 + (2 * t) / size.z);
  o.userData.ink = true;
  m.add(o);
}

/**
 * Sofá, dibujado a partir de su `ItemDef` (asiento, respaldo y brazos: las cajas de su forma; cinchas: sus asas). Lo
 * dibujado es lo que choca: la base, el respaldo y los brazos son sus cajas (a lo sumo 2–3 cm más gruesos, por el
 * tapizado), los cojines del asiento van dentro de la caja del asiento y sobresalen 2 cm por arriba, los del respaldo
 * van pegados a su cara y las cinchas, aplastadas contra la tela. Antes los cojines del asiento sobresalían 15 cm, los
 * dos cojines de colores 30 cm, los ribetes de los brazos 7 cm y las cinchas 17 cm, donde no había nada que chocara.
 */
export class SofaView {
  group = new THREE.Group();
  /** Hijo que se deforma (rebote al golpear) sin tocar la transformación física. */
  private inner = new THREE.Group();
  private cushions: THREE.Object3D[] = [];
  private patches: THREE.Mesh[] = [];
  private warn: THREE.Mesh;
  private prevVel = new THREE.Vector3();
  private jiggle = new THREE.Vector3();
  private jiggleV = new THREE.Vector3();
  private squash = 0;
  private squashV = 0;
  private primed = false;
  /** Medio alto del asiento (para que el rebote se apoye en la base). */
  private seatHalf: number;

  constructor(def: ItemDef) {
    // Las cajas de la forma: asiento, respaldo y los dos brazos
    const [seat, back, arm] = def.shape;
    const half = seat.h;
    this.seatHalf = half.y;
    this.group.add(this.inner);
    const fabric = (c: string) => mat(c, { map: TEX.fabric(), rough: 0.95 });
    const add = (w: number, h: number, d: number, r: number, m: THREE.Material, x: number, y: number, z: number, line = 0, parent: THREE.Object3D = this.inner) => {
      const geo = new RoundedBoxGeometry(w, h, d, 3, r);
      const mm = new THREE.Mesh(geo, m);
      mm.position.set(x, y, z);
      mm.castShadow = true; mm.receiveShadow = true;
      if (line) ink(mm, new THREE.Vector3(w, h, d), line);
      parent.add(mm);
      return mm;
    };
    // Cojines del asiento: de lo alto del asiento hacia abajo `cushionH`, sobresaliendo 2 cm; la base, lo de debajo
    const cushionH = 0.16, seatTop = seat.p.y + half.y, rise = 0.02;
    const baseH = half.y * 2 - (cushionH - rise);
    add(half.x * 2, baseH, half.z * 2, 0.06, fabric(CREAM), seat.p.x, seat.p.y - half.y + baseH / 2, seat.p.z, 0.035);
    // Respaldo y brazos (el tapizado, 2–3 cm más grueso que su caja)
    add(back.h.x * 2, back.h.y * 2, back.h.z * 2 + 0.02, 0.06, fabric(CREAM), back.p.x, back.p.y, back.p.z, 0.035);
    const armX = Math.abs(arm.p.x), armTop = arm.p.y + arm.h.y;
    for (const s of [-1, 1]) {
      add(arm.h.x * 2 + 0.04, arm.h.y * 2 + 0.02, arm.h.z * 2, 0.08, fabric(CREAM), s * armX, arm.p.y + 0.01, arm.p.z, 0.035);
      // Vivo (ribete) acaramelado a lo largo de lo alto del brazo, medio hundido en él
      const pipe = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, arm.h.z * 2 - 0.1, 4, 8), mat(PIPING, { rough: 0.6 }));
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(s * armX, armTop + 0.002, arm.p.z);
      this.inner.add(pipe);
    }
    // Zócalo de madera (dentro del volumen del asiento: sin patas que se hundan en el suelo)
    add(half.x * 2 - 0.1, 0.07, half.z * 2 + 0.02, 0.02, mat(WOOD, { rough: 0.55 }), seat.p.x, seat.p.y - half.y + 0.035, seat.p.z);
    // Cojines (se bambolean con las sacudidas): tres en el asiento, delante del respaldo, y tres contra el respaldo con
    // botones capitoné; los de los lados, de colores (le dan carácter y se ve hacia dónde mira el sofá)
    const inner = armX - arm.h.x, w = (inner * 2) / 3 - 0.03;
    const front = seat.p.z + half.z, backFace = back.p.z + back.h.z, depth = front - backFace - 0.02;
    const button = mat('#e2c99a', { rough: 0.6 });
    for (let i = -1; i <= 1; i++) {
      const cx = i * (inner * 2) / 3;
      const sc = new THREE.Group();
      sc.position.set(cx, seatTop + rise - cushionH / 2, backFace + 0.01 + depth / 2);
      add(w, cushionH, depth, 0.06, fabric(CUSHION), 0, 0, 0, 0.02, sc);
      this.inner.add(sc);
      this.cushions.push(sc);
      const bc = new THREE.Group();
      const bh = Math.min(0.36, back.p.y + back.h.y - seatTop - 0.06);
      bc.position.set(cx, seatTop + rise + 0.02 + bh / 2, backFace + 0.004);
      add(w, bh, 0.04, 0.015, i === 0 ? fabric(CUSHION) : mat(i < 0 ? '#2bb3a3' : '#f59e8b', { rough: 0.9 }), 0, 0, 0, 0.012, bc);
      for (const [bx, by] of [[-0.14, 0.07], [0.14, 0.07], [0, -0.07]] as const) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.004, 10), button);
        b.rotation.x = Math.PI / 2;
        b.position.set(bx, by, 0.021);
        bc.add(b);
      }
      this.inner.add(bc);
      this.cushions.push(bc);
    }
    // Asas: cinchas de mudanza aplastadas contra la tela, rojas en el respaldo (local −z), azules en el asiento (+z) y
    // amarillas en los extremos (x)
    const UP = new THREE.Vector3(0, 1, 0);
    for (const h of def.handles) {
      const color = Math.abs(h.out.x) > 0.5 ? '#facc15' : h.out.z < 0 ? '#ef4444' : '#3b82f6';
      const out = new THREE.Vector3(h.out.x, h.out.y, h.out.z);
      const loop = new THREE.Group();
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 14, Math.PI), mat(color, { rough: 0.6 }));
      const o = new THREE.Mesh(strap.geometry, inkMat);
      o.scale.setScalar(1.12);
      o.userData.ink = true;
      strap.add(o);
      loop.add(strap);
      loop.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.02, 0.14), mat(color, { rough: 0.6 })));
      // Aplastada: el lazo sobresale menos de 3 cm de la tela
      loop.scale.set(1, 0.2, 1);
      loop.quaternion.setFromUnitVectors(UP, out);
      if (Math.abs(h.out.x) > 0.5) loop.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2));
      loop.position.set(h.p.x + h.out.x * 0.002, h.p.y, h.p.z + h.out.z * 0.002);
      this.inner.add(loop);
    }
    // Parches de cinta americana que aparecen al dañarse (sobre los cojines del asiento)
    const tape = mat('#c0c4cc', { rough: 0.4 });
    for (const [x, z, r] of [[0.5, 0.15, 0.4], [-0.6, 0.0, -0.6], [0.0, 0.12, 1.1], [-0.2, -0.05, 0.2]] as const) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.012, 0.1), tape);
      p.position.set(x, seatTop + rise + 0.002, z);
      p.rotation.y = r;
      p.visible = false;
      this.inner.add(p);
      this.patches.push(p);
    }
    // Aviso de vuelco: aro rojo bajo el sofá
    this.warn = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0 }));
    this.warn.rotation.x = Math.PI / 2;
  }

  /** Aro de aviso, en el mundo (no gira con el sofá). */
  get warning() { return this.warn; }

  /** Golpe: el sofá se aplasta y rebota un instante. */
  bump(strength: number) { this.squashV -= Math.min(2.2, strength * 0.3); }

  /** Partida nueva: sin inercias heredadas de la anterior. */
  reset() {
    this.prevVel.set(0, 0, 0); this.jiggle.set(0, 0, 0); this.jiggleV.set(0, 0, 0);
    this.squash = this.squashV = 0;
    this.primed = false;
  }

  sync(body: RAPIER.RigidBody, integrity: number, up: number, t: number, dt = 1 / 60) {
    const p = body.translation(), q = body.rotation();
    this.group.position.set(p.x, p.y, p.z);
    this.group.quaternion.set(q.x, q.y, q.z, q.w);
    dt = Math.min(dt, 0.1);
    // Inercia de los cojines: se desplazan al revés que la aceleración del sofá
    // (solo cuando la física ha dado un paso: en pantallas de 120 Hz hay fotogramas sin paso)
    const v = body.linvel();
    const vel = new THREE.Vector3(v.x, v.y, v.z);
    const changed = !this.primed || !vel.equals(this.prevVel);
    const acc = changed && this.primed ? vel.clone().sub(this.prevVel).divideScalar(Math.max(dt, 1e-3)) : new THREE.Vector3();
    if (changed) this.prevVel.copy(vel);
    this.primed = true;
    acc.applyQuaternion(this.group.quaternion.clone().invert());
    acc.clampLength(0, 40);
    const target = acc.multiplyScalar(-0.0025);
    this.jiggleV.addScaledVector(target.sub(this.jiggle), 260 * dt).multiplyScalar(Math.max(0, 1 - 14 * dt));
    this.jiggle.addScaledVector(this.jiggleV, dt);
    this.jiggle.clampLength(0, 0.07);
    this.cushions.forEach((c, i) => {
      const k = 1 + (i % 3) * 0.25;
      c.userData.base ??= c.position.clone();
      c.position.copy(c.userData.base as THREE.Vector3).addScaledVector(this.jiggle, k);
    });
    // Rebote de aplastamiento
    this.squashV += (-this.squash * 140 - this.squashV * 10) * dt;
    this.squash += this.squashV * dt;
    // Poca deformación lateral y apoyada en la base, para no salirse del colisionador ni flotar
    const sq = THREE.MathUtils.clamp(this.squash, -0.18, 0.18);
    this.inner.scale.set(1 - sq * 0.25, 1 + sq, 1 - sq * 0.25);
    this.inner.position.y = up > 0.8 ? this.seatHalf * sq : 0;
    const broken = Math.floor((100 - integrity) / 22);
    this.patches.forEach((m, i) => (m.visible = i < broken));
    const danger = up < 0.8 ? Math.min(1, (0.8 - up) / 0.4) : 0;
    (this.warn.material as THREE.MeshBasicMaterial).opacity = danger * (0.5 + 0.5 * Math.sin(t * 14));
    this.warn.visible = danger > 0;
    this.warn.position.set(p.x, Math.max(0.05, p.y - 0.6), p.z);
  }
}
