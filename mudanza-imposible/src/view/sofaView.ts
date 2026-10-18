import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import { SOFA, SLOTS } from '../sim/sofa';
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
  m.add(o);
}

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

  constructor() {
    const { half, back, arm } = SOFA;
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
    // Estructura con contorno: base, respaldo y brazos
    add(half.x * 2, half.y * 2, half.z * 2, 0.08, fabric(CREAM), 0, 0, 0, 0.035);
    add(back.h.x * 2, back.h.y * 2, back.h.z * 2 + 0.06, 0.08, fabric(CREAM), back.p.x, back.p.y, back.p.z, 0.035);
    for (const s of [-1, 1]) {
      add(arm.h.x * 2 + 0.06, arm.h.y * 2 + 0.08, arm.h.z * 2, 0.1, fabric(CREAM), s * (half.x - arm.h.x), arm.y + 0.04, 0, 0.035);
      // Vivo (ribete) acaramelado en lo alto del brazo
      const pipe = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, half.z * 2 - 0.1, 4, 8), mat(PIPING, { rough: 0.6 }));
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(s * (half.x - arm.h.x), arm.y + 0.2, 0);
      this.inner.add(pipe);
    }
    // Zócalo de madera (dentro del volumen del colisionador: sin patas que se hundan en el suelo)
    add(half.x * 2 - 0.1, 0.07, half.z * 2 + 0.02, 0.02, mat(WOOD, { rough: 0.55 }), 0, -half.y + 0.035, 0);
    // Cojines (se bambolean con las sacudidas) con botones capitoné en el respaldo
    const button = mat('#e2c99a', { rough: 0.6 });
    for (let i = -1; i <= 1; i++) {
      const seat = new THREE.Group();
      seat.position.set(i * 0.63, half.y + 0.07, 0.07);
      add(0.6, 0.16, 0.62, 0.07, fabric(CUSHION), 0, 0, 0, 0.02, seat);
      this.inner.add(seat);
      this.cushions.push(seat);
      const bc = new THREE.Group();
      bc.position.set(i * 0.63, back.p.y + 0.02, back.p.z + 0.13);
      add(0.6, 0.36, 0.14, 0.06, fabric(CUSHION), 0, 0, 0, 0.02, bc);
      for (const [bx, by] of [[-0.14, 0.07], [0.14, 0.07], [0, -0.07]] as const) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), button);
        b.position.set(bx, by, 0.07);
        bc.add(b);
      }
      this.inner.add(bc);
      this.cushions.push(bc);
    }
    // Dos cojines decorativos de color: le dan carácter y se ve hacia dónde mira el sofá
    for (const [x, c, rz] of [[-0.78, '#2bb3a3', 0.35], [0.78, '#f59e8b', -0.35]] as const) {
      const pg = new THREE.Group();
      pg.position.set(x, half.y + 0.3, -0.16);
      pg.rotation.set(-0.35, 0, rz);
      add(0.27, 0.26, 0.1, 0.05, mat(c, { rough: 0.9 }), 0, 0, 0, 0.02, pg);
      this.inner.add(pg);
      this.cushions.push(pg);
    }
    // Asas: cinchas de mudanza rojas (respaldo, local -z), azules (asiento, +z) y amarillas en los extremos
    const UP = new THREE.Vector3(0, 1, 0);
    for (const s of SLOTS) {
      const color = s.side === 'red' ? '#ef4444' : s.side === 'blue' ? '#3b82f6' : '#facc15';
      const out = new THREE.Vector3(s.out.x, s.out.y, s.out.z);
      const loop = new THREE.Group();
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 8, 14, Math.PI), mat(color, { rough: 0.6 }));
      const o = new THREE.Mesh(strap.geometry, inkMat);
      o.scale.setScalar(1.18);
      strap.add(o);
      loop.add(strap);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.16), mat(color, { rough: 0.6 }));
      loop.add(plate);
      loop.quaternion.setFromUnitVectors(UP, out);
      if (s.side === 'end') loop.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2));
      loop.position.set(s.p.x + s.out.x * 0.01, s.p.y + 0.02, s.p.z + s.out.z * 0.01);
      this.inner.add(loop);
    }
    // Parches de cinta americana que aparecen al dañarse
    const tape = mat('#c0c4cc', { rough: 0.4 });
    for (const [x, z, r] of [[0.5, 0.2, 0.4], [-0.6, -0.1, -0.6], [0.0, 0.3, 1.1], [-0.2, -0.25, 0.2]] as const) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.1), tape);
      p.position.set(x, half.y + 0.16, z);
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
    this.inner.position.y = up > 0.8 ? SOFA.half.y * sq : 0;
    const broken = Math.floor((100 - integrity) / 22);
    this.patches.forEach((m, i) => (m.visible = i < broken));
    const danger = up < 0.8 ? Math.min(1, (0.8 - up) / 0.4) : 0;
    (this.warn.material as THREE.MeshBasicMaterial).opacity = danger * (0.5 + 0.5 * Math.sin(t * 14));
    this.warn.visible = danger > 0;
    this.warn.position.set(p.x, Math.max(0.05, p.y - 0.6), p.z);
  }
}
