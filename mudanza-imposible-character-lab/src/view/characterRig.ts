import * as THREE from 'three';
import { CENTER_Y } from '../sim/character';
import type { Lab } from '../sim/lab';
import { FlexTube, twoBone } from './tube';

/**
 * Muñeco de goma procedural: cuerpo de judía con cabeza grande, gorra roja, camiseta clara y peto rojo,
 * brazos y piernas de manguera, manoplas y botas grandes.
 *
 * La vista solo LEE la simulación (posición, inclinación, estado, fuerzas): nunca mueve el cuerpo físico.
 * Todo lo que hace (pasos, brazos, cabeza, caras) sale de esos datos. Para sustituirlo por un modelo con
 * esqueleto basta con implementar `sync()` moviendo sus huesos con los mismos datos.
 */

export const LOOK = {
  skin: '#f2b08a',
  shirt: '#f5f1e8',
  overalls: '#d7392d',
  cap: '#e3402f',
  boot: '#5a3826',
  sole: '#2b2730',
  eye: '#15111c',
  button: '#f3c24f',
  blush: '#ee8f7f',
  hair: '#6b4128',
};

const DIM = {
  hipY: 0.36, hipX: 0.13,
  thigh: 0.2, shin: 0.19, ankle: 0.07,
  shoulderY: 0.84, shoulderX: 0.33,
  upperArm: 0.22, foreArm: 0.21,
  neckY: 0.93, headY: 0.27, headR: 0.31,
};

const softMat = (color: string, rough = 0.78) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.6, sheen: 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffffff') });

const lathe = (pts: [number, number][], seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

interface Foot {
  pos: THREE.Vector3; // apoyo (tobillo en el suelo)
  from: THREE.Vector3; to: THREE.Vector3;
  t: number; dur: number; swinging: boolean;
  yaw: number; side: number;
}

const damp = THREE.MathUtils.damp;
const UP = new THREE.Vector3(0, 1, 0);
const smooth = (t: number) => t * t * (3 - 2 * t);

export class CharacterRig {
  group = new THREE.Group();
  private root = new THREE.Group();
  private pelvis = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private cap = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private mouth: THREE.Mesh;
  private legs: FlexTube[] = [];
  private arms: FlexTube[] = [];
  private boots: THREE.Group[] = [];
  private hands: THREE.Group[] = [];
  private sleeves: THREE.Mesh[] = [];
  private shadow: THREE.Mesh;
  private feet: Foot[] = [];
  private yaw = 0;
  private yawFall = 0;
  private squash = 0; private squashV = 0;
  private headYaw = 0; private headPitch = 0;
  private capWob = 0; private capWobV = 0;
  private prevRootY = 0; private prevRootVy = 0;
  private scrabbleT = 0;
  private lyingRest = 0;
  private t = 0;
  private blinkAt = 2;
  private lastState = '';
  private stateT = 0;
  private needSnap = true;

  constructor() {
    const skin = softMat(LOOK.skin, 0.72), shirt = softMat(LOOK.shirt, 0.85), over = softMat(LOOK.overalls, 0.8);
    const cap = softMat(LOOK.cap, 0.7), boot = softMat(LOOK.boot, 0.75), sole = softMat(LOOK.sole, 0.9);
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    this.group.add(this.root);
    this.root.add(this.pelvis);
    this.pelvis.add(this.torso);

    // Cuerpo de judía: camiseta clara arriba, peto rojo abajo
    add(this.torso, lathe([[0, 0.3], [0.22, 0.305], [0.31, 0.36], [0.345, 0.47], [0.345, 0.6], [0.33, 0.72], [0.3, 0.83], [0.25, 0.92], [0.16, 0.97], [0, 0.985]]), shirt);
    add(this.torso, lathe([[0, 0.292], [0.225, 0.298], [0.316, 0.355], [0.352, 0.47], [0.352, 0.6], [0.344, 0.665]]), over);
    // Babero del peto, tirantes y botones
    const bib = add(this.torso, new THREE.CylinderGeometry(0.318, 0.347, 0.2, 18, 1, true, Math.PI - 0.5, 1.0), over, 0, 0.745, 0);
    (bib.material as THREE.Material).side = THREE.DoubleSide;
    for (const s of [-1, 1]) {
      const strap = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.13, 0.84, -0.3), new THREE.Vector3(s * 0.17, 0.93, -0.2), new THREE.Vector3(s * 0.19, 0.97, 0.0), new THREE.Vector3(s * 0.17, 0.9, 0.24), new THREE.Vector3(s * 0.12, 0.68, 0.33)]);
      add(this.torso, new THREE.TubeGeometry(strap, 16, 0.025, 6), over);
      add(this.torso, new THREE.SphereGeometry(0.032, 12, 8), softMat(LOOK.button, 0.4), s * 0.12, 0.83, -0.315);
    }
    // Bolsillo del babero
    add(this.torso, new THREE.BoxGeometry(0.13, 0.07, 0.02), softMat('#b82d23', 0.85), 0, 0.73, -0.345);

    // Cabeza grande, con articulación en el cuello
    this.head.position.y = DIM.neckY;
    this.torso.add(this.head);
    const hp: [number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const a = -Math.PI / 2 + (i / 16) * Math.PI;
      hp.push([Math.max(0, Math.cos(a) * DIM.headR * (i < 4 ? 0.9 + i * 0.025 : 1)), DIM.headY + Math.sin(a) * DIM.headR * 0.95]);
    }
    hp[0][0] = 0; hp[16][0] = 0;
    add(this.head, lathe(hp), skin);
    // Ojos ovalados negros, colorete y boca (solo aparece en momentos de apuro)
    const eyeMat = new THREE.MeshStandardMaterial({ color: LOOK.eye, roughness: 0.25 });
    for (const s of [-1, 1]) {
      const e = add(this.head, new THREE.SphereGeometry(1, 16, 12), eyeMat, s * 0.1, DIM.headY + 0.04, -0.282);
      e.scale.set(0.052, 0.086, 0.03);
      e.castShadow = false;
      this.eyes.push(e);
      const shine = add(e, new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 0.25, 0.35, -0.8);
      shine.castShadow = false;
      const b = add(this.head, new THREE.CircleGeometry(0.045, 16), new THREE.MeshBasicMaterial({ color: LOOK.blush, transparent: true, opacity: 0.55 }), s * 0.17, DIM.headY - 0.06, -0.262);
      b.rotation.y = Math.PI + s * 0.55;
      b.castShadow = false;
    }
    this.mouth = add(this.head, new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: '#3a1220', roughness: 0.5 }), 0, DIM.headY - 0.1, -0.29);
    this.mouth.scale.set(0.035, 0.03, 0.015);
    this.mouth.visible = false;
    // Mechones que asoman por detrás de la gorra
    for (const [x, y, z, r] of [[-0.18, 0.31, 0.2, 0.6], [0.16, 0.3, 0.22, -0.5], [0.0, 0.27, 0.27, 0.0]] as const) {
      const tuft = add(this.head, new THREE.ConeGeometry(0.05, 0.12, 8), softMat(LOOK.hair, 0.9), x, y, z);
      tuft.rotation.set(1.9, 0, r);
    }
    // Gorra roja: casquete, visera algo ladeada y botón
    this.cap.position.set(0, DIM.headY, 0);
    this.cap.rotation.set(-0.12, 0.18, 0.06);
    this.head.add(this.cap);
    add(this.cap, new THREE.SphereGeometry(DIM.headR + 0.018, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.15), cap, 0, 0.0, 0);
    const brim = add(this.cap, new THREE.CylinderGeometry(0.22, 0.22, 0.025, 28, 1, false, Math.PI - 1.25, 2.5), cap, 0, 0.055, -0.22);
    brim.rotation.x = -0.12;
    brim.scale.set(1, 1, 0.95);
    add(this.cap, new THREE.SphereGeometry(0.035, 10, 8), cap, 0, DIM.headR + 0.01, 0);
    add(this.cap, new THREE.TorusGeometry(DIM.headR + 0.012, 0.018, 8, 40), softMat('#b8291d', 0.8), 0, 0.02, 0).rotation.x = Math.PI / 2;

    // Miembros de manguera (se recalculan cada fotograma en coordenadas del mundo)
    for (let i = 0; i < 2; i++) {
      const leg = new FlexTube(14, 10, (t) => 0.078 - 0.012 * t);
      const lm = new THREE.Mesh(leg.geometry, over);
      lm.castShadow = true; lm.frustumCulled = false;
      this.group.add(lm);
      this.legs.push(leg);
      const arm = new FlexTube(14, 10, (t) => 0.06 - 0.008 * t);
      const am = new THREE.Mesh(arm.geometry, skin);
      am.castShadow = true; am.frustumCulled = false;
      this.group.add(am);
      this.arms.push(arm);
      // Manga corta de la camiseta
      const sl = add(this.group, new THREE.CylinderGeometry(0.085, 0.095, 0.13, 14), shirt);
      this.sleeves.push(sl);
      // Manopla: palma, pulgar y puño
      const hand = new THREE.Group();
      const palm = add(hand, new THREE.SphereGeometry(1, 16, 12), skin);
      palm.scale.set(0.085, 0.07, 0.105);
      const thumb = add(hand, new THREE.SphereGeometry(1, 10, 8), skin, (i ? -1 : 1) * 0.065, 0.02, -0.03);
      thumb.scale.set(0.035, 0.032, 0.05);
      add(hand, new THREE.CylinderGeometry(0.06, 0.065, 0.05, 12), shirt, 0, 0, 0.1).rotation.x = Math.PI / 2;
      this.group.add(hand);
      this.hands.push(hand);
      // Bota grande: caña, puntera y suela
      const b = new THREE.Group();
      const upper = add(b, new THREE.SphereGeometry(1, 16, 12), boot, 0, 0.06, -0.035);
      upper.scale.set(0.095, 0.075, 0.15);
      add(b, new THREE.CylinderGeometry(0.07, 0.08, 0.08, 14), boot, 0, 0.09, 0.03);
      const so = add(b, new THREE.BoxGeometry(0.17, 0.035, 0.29), sole, 0, 0.0175, -0.04);
      so.scale.set(1, 1, 1);
      this.group.add(b);
      this.boots.push(b);
      this.feet.push({ pos: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 0.3, swinging: false, yaw: 0, side: i ? 1 : -1 });
    }

    // Sombra de contacto blanda
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(40,30,50,0.45)'); g.addColorStop(1, 'rgba(40,30,50,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.shadow);
  }

  /** Coloca de golpe los pies (al reiniciar una prueba). */
  snap() { this.needSnap = true; }

  sync(lab: Lab, dt: number, camera: THREE.Camera) {
    const c = lab.char;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    if (c.state !== this.lastState) { this.lastState = c.state; this.stateT = 0; } else this.stateT += dt;
    const p = c.pos, v = c.body.linvel();
    const speed = Math.hypot(v.x, v.z);
    const upright = c.upright;

    // --- Raíz: en los pies, con la orientación y la inclinación del tronco que calcula la física ---
    const yawTarget = Math.atan2(-c.facing.x, -c.facing.z);
    let dyaw = Math.atan2(Math.sin(yawTarget - this.yaw), Math.cos(yawTarget - this.yaw));
    if (upright) this.yaw += Math.sign(dyaw) * Math.min(Math.abs(dyaw), dt * (c.state === 'losingBalance' ? 4 : 7.5));
    const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, this.yaw);
    const rootPos = new THREE.Vector3();
    const rootQ = new THREE.Quaternion();
    if (upright) {
      this.yawFall = this.yaw;
      const lx = c.lean.x, lz = c.lean.z, l = Math.min(1.2, Math.hypot(lx, lz));
      const tilt = l > 1e-5 ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(lz, 0, -lx).normalize(), l) : new THREE.Quaternion();
      rootQ.copy(tilt).multiply(qYaw);
      rootPos.set(p.x, p.y - CENTER_Y, p.z);
    } else {
      const bq = c.body.rotation();
      const bodyQ = new THREE.Quaternion(bq.x, bq.y, bq.z, bq.w);
      rootQ.copy(bodyQ).multiply(new THREE.Quaternion().setFromAxisAngle(UP, this.yawFall));
      rootPos.set(0, -CENTER_Y, 0).applyQuaternion(bodyQ).add(new THREE.Vector3(p.x, p.y, p.z));
    }
    this.root.position.copy(rootPos);
    this.root.quaternion.copy(rootQ);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(qYaw);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(qYaw);

    // --- Pies: apoyos fijos en el suelo; un paso cuando el cuerpo se aleja de ellos ---
    const ground = (x: number, z: number) => lab.heightAt(x, z);
    const stumbling = c.state === 'losingBalance';
    const pulling = c.holding && c.effort > 0.5;
    const scrabble = pulling && speed < 0.35 && Math.hypot(c.wantVel.x, c.wantVel.z) > 0.3;
    if (upright) {
      const homeFor = (f: Foot) => {
        const h = rootPos.clone().addScaledVector(right, f.side * (pulling ? 0.17 : 0.13)).addScaledVector(new THREE.Vector3(v.x, 0, v.z), stumbling ? 0.2 : 0.13);
        if (c.holding) h.addScaledVector(fwd, 0.06 + Math.hypot(c.lean.x, c.lean.z) * 0.25); // pies por delante al colgarse
        h.y = ground(h.x, h.z);
        return h;
      };
      if (this.needSnap || this.lastWasDown) {
        for (const f of this.feet) {
          if (this.lastWasDown) { /* conserva la pose de levantarse */ f.pos.copy(this.bootWorld(f)); }
          else f.pos.copy(homeFor(f));
          f.swinging = false; f.yaw = this.yaw;
        }
        this.needSnap = false; this.lastWasDown = false;
      }
      this.scrabbleT -= dt;
      for (const f of this.feet) {
        const other = this.feet[f === this.feet[0] ? 1 : 0];
        const home = homeFor(f);
        if (f.swinging) {
          f.t += dt / f.dur;
          if (f.t >= 1) { f.swinging = false; f.pos.copy(f.to); this.squashV -= stumbling ? 1.4 : 0.6; }
          continue;
        }
        // Al tirar sin avanzar, los pies resbalan hacia el cuerpo y patalean deprisa
        if (scrabble) f.pos.lerp(home, Math.min(1, dt * 1.5));
        const dist = Math.hypot(home.x - f.pos.x, home.z - f.pos.z);
        const thr = stumbling ? 0.05 : scrabble ? 0.02 : 0.14 + 0.04 * speed;
        const otherReady = !other.swinging || other.t > (stumbling ? 0.45 : 0.75);
        const scrabbleGo = scrabble && this.scrabbleT <= 0;
        const yawOff = Math.abs(Math.atan2(Math.sin(this.yaw - f.yaw), Math.cos(this.yaw - f.yaw)));
        if (otherReady && (dist > thr || yawOff > 0.6 || scrabbleGo) && (!scrabble || scrabbleGo)) {
          f.swinging = true; f.t = 0;
          f.from.copy(f.pos);
          f.to.copy(home);
          if (scrabble) f.to.addScaledVector(fwd, -0.07); // pasito atrás que resbala
          // Torpeza: cada pie cae un poco donde quiere
          const j = Math.sin(this.t * 17.3 + f.side * 5) * 0.035;
          f.to.addScaledVector(right, j).addScaledVector(fwd, Math.cos(this.t * 13.1 + f.side) * 0.025);
          f.to.y = ground(f.to.x, f.to.z);
          f.dur = stumbling ? 0.13 : scrabble ? 0.16 : THREE.MathUtils.clamp(0.36 - speed * 0.045, 0.17, 0.34);
          f.yaw = this.yaw + (stumbling ? Math.sin(this.t * 9 + f.side) * 0.4 : f.side * 0.1);
          if (scrabble) this.scrabbleT = 0.2;
        }
      }
    } else {
      this.lastWasDown = true;
    }

    // --- Pelvis: baja en el doble apoyo, se mece de lado a lado con los pasos ---
    let bob = 0, sway = 0;
    if (upright) {
      for (const f of this.feet) if (f.swinging) { bob += Math.sin(Math.PI * f.t) * 0.04; sway += f.side * -Math.sin(Math.PI * f.t) * 0.06; }
      bob -= 0.015 * Math.min(1, speed / 2);
    }
    this.pelvis.position.y = damp(this.pelvis.position.y, bob, 18, dt);
    this.pelvis.rotation.z = damp(this.pelvis.rotation.z, sway, 10, dt);

    // --- Aplastamiento de la judía: aterrizajes, pasos y esfuerzo ---
    const vy = (rootPos.y - this.prevRootY) / Math.max(dt, 1e-4);
    if (this.prevRootVy < -1.5 && vy > -0.3) this.squashV -= Math.min(4, -this.prevRootVy * 1.2);
    this.prevRootY = rootPos.y; this.prevRootVy = vy;
    const squashGoal = c.holding ? -0.05 * c.effort : 0;
    this.squashV += ((squashGoal - this.squash) * 160 - this.squashV * 11) * dt;
    this.squash += this.squashV * dt;
    const sq = THREE.MathUtils.clamp(this.squash, -0.2, 0.2);
    const breathe = Math.sin(this.t * 2.4) * 0.012;
    this.torso.scale.set(1 - sq * 0.5, 1 + sq + breathe, 1 - sq * 0.5);
    // Contrarrotación del tronco con los pasos
    const fo = this.feet.map((f) => (upright ? f.pos.clone().sub(rootPos).dot(fwd) : 0));
    this.torso.rotation.y = damp(this.torso.rotation.y, (fo[0] - fo[1]) * 0.6, 8, dt);

    this.group.updateMatrixWorld(true);
    const toWorld = (o: THREE.Object3D, x: number, y: number, z: number) => o.localToWorld(new THREE.Vector3(x, y, z));

    // --- Piernas: cadera → rodilla (hacia delante) → tobillo ---
    const lying = c.state === 'falling' || c.state === 'recovering';
    const pose = c.falls % 3;
    // Tumbado: los miembros se van asentando cuando el cuerpo deja de moverse
    const w = c.body.angvel();
    const still = Math.hypot(w.x, w.y, w.z) < 1.5 && speed < 1;
    this.lyingRest = lying ? damp(this.lyingRest, c.state === 'recovering' ? 1 : still ? 1 : 0, 4, dt) : 0;
    const rec = c.state === 'recovering' ? Math.min(1, this.stateT / 0.85) : 0;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i], s = f.side;
      const hip = toWorld(this.pelvis, s * DIM.hipX, DIM.hipY, 0);
      let ankle: THREE.Vector3;
      let bootYaw = f.yaw, bootPitch = 0;
      if (!lying) {
        ankle = f.pos.clone();
        if (f.swinging) {
          const e = smooth(f.t);
          ankle.lerpVectors(f.from, f.to, e);
          ankle.y += Math.sin(Math.PI * f.t) * (stumbling ? 0.16 : scrabble ? 0.06 : 0.07 + 0.025 * speed);
          bootPitch = Math.sin(Math.PI * 2 * f.t) * (stumbling ? 0.5 : 0.35);
        }
        ankle.y += DIM.ankle;
      } else {
        // Pataleo en el aire y, ya en el suelo, una postura cómica y asimétrica (cambia de una caída a otra)
        const kick = new THREE.Vector3(s * 0.15, 0.08 + Math.abs(Math.sin(this.t * 13 + i * 2)) * 0.22, Math.sin(this.t * 11 + i) * 0.22);
        const rest = [
          new THREE.Vector3(s * 0.36, 0.02, -0.04),
          i ? new THREE.Vector3(0.22, 0.2, -0.38) : new THREE.Vector3(-0.12, -0.05, 0.02),
          new THREE.Vector3(s * 0.3, 0.12, -0.3),
        ][pose];
        const up = new THREE.Vector3(s * 0.13, 0.0, -0.08);
        const local = kick.lerp(rest, this.lyingRest).lerp(up, smooth(Math.max(0, (rec - 0.35) / 0.65)));
        ankle = toWorld(this.root, local.x, local.y + DIM.ankle, local.z);
        bootYaw = this.yawFall;
        bootPitch = (1 - rec) * (0.5 + Math.sin(this.t * 9 + i) * 0.3 * (1 - this.lyingRest));
      }
      const pole = toWorld(this.root, s * 0.06, DIM.hipY * 0.5, -0.6).sub(hip);
      const knee = twoBone(hip, ankle, DIM.thigh, DIM.shin + 0.02, pole);
      this.legs[i].update(hip, knee, ankle);
      const b = this.boots[i];
      b.position.copy(ankle).add(new THREE.Vector3(0, -DIM.ankle, 0));
      if (lying) {
        const up = UP.clone().applyQuaternion(this.root.quaternion);
        b.position.copy(ankle).addScaledVector(up, -DIM.ankle);
        b.quaternion.copy(this.root.quaternion);
        b.rotateX(-bootPitch);
      } else {
        b.quaternion.setFromAxisAngle(UP, bootYaw);
        b.rotateX(bootPitch);
      }
    }

    // --- Brazos: hombro → codo → mano ---
    const sh = [toWorld(this.torso, -DIM.shoulderX, DIM.shoulderY, 0), toWorld(this.torso, DIM.shoulderX, DIM.shoulderY, 0)];
    const grab = c.grabWorld();
    const dev = Math.hypot(c.leanDev.x, c.leanDev.z);
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      let hand: THREE.Vector3;
      if (grab && upright && !stumbling) {
        const side = new THREE.Vector3(-c.handDir.z, 0, c.handDir.x);
        hand = new THREE.Vector3(grab.x, grab.y, grab.z).addScaledVector(side, s * 0.13).add(new THREE.Vector3(0, 0.04, 0));
        // Temblor de esfuerzo
        if (c.effort > 0.6) hand.y += Math.sin(this.t * 41 + i * 2) * 0.012 * c.effort;
      } else if (stumbling) {
        // Molinillo: brazos en círculo, más grandes cuanto mayor el desequilibrio
        const a = this.t * 13 + i * Math.PI;
        const amp = 0.25 + Math.min(0.35, dev);
        hand = toWorld(this.torso, s * (DIM.shoulderX + 0.3), DIM.shoulderY + 0.1 + Math.sin(a) * amp, Math.cos(a) * amp);
      } else if (lying) {
        const flail = new THREE.Vector3(s * 0.62, DIM.shoulderY + 0.25 + Math.sin(this.t * 15 + i) * 0.25, Math.cos(this.t * 12 + i * 2) * 0.3);
        const rest = [
          new THREE.Vector3(s * 0.78, DIM.shoulderY + 0.3, -0.05),
          i ? new THREE.Vector3(0.12, 0.55, -0.42) : new THREE.Vector3(-0.25, 1.5, -0.1),
          new THREE.Vector3(s * 0.55, 0.5, -0.25),
        ][pose];
        // Al levantarse se apoya con las manos delante de la cadera y empuja
        const push = new THREE.Vector3(s * 0.32, 0.38, -0.32);
        const r = rec < 0.6 ? smooth(rec / 0.6) : 1 - smooth((rec - 0.6) / 0.4) * 0.6;
        const local = flail.lerp(rest, this.lyingRest).lerp(push, r);
        hand = toWorld(this.torso, local.x, local.y, local.z);
      } else {
        // Andando: los brazos van al revés que las piernas; quieto, cuelgan con un leve balanceo
        const swing = upright ? THREE.MathUtils.clamp(fo[i ? 0 : 1] * 0.7, -0.22, 0.22) : 0;
        hand = toWorld(this.torso, s * (DIM.shoulderX + 0.07), DIM.shoulderY - 0.4 + Math.abs(swing) * 0.25, -swing + Math.sin(this.t * 1.7 + i) * 0.015);
      }
      const pole = toWorld(this.torso, s * 0.7, DIM.shoulderY - 0.3, 0.5).sub(sh[i]);
      const elbow = twoBone(sh[i], hand, DIM.upperArm, DIM.foreArm, pole);
      this.arms[i].update(sh[i], elbow, hand);
      // Manga orientada al brazo
      const dir = elbow.clone().sub(sh[i]).normalize();
      this.sleeves[i].position.copy(sh[i]).addScaledVector(dir, 0.04);
      this.sleeves[i].quaternion.setFromUnitVectors(UP, dir);
      // Manopla: apunta en la dirección del antebrazo
      const hd = hand.clone().sub(elbow).normalize();
      const hgrp = this.hands[i];
      hgrp.position.copy(hand).addScaledVector(hd, 0.05);
      hgrp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), hd);
    }

    // --- Cabeza: anticipa los giros, se retrasa con los tirones, mira a cámara cuando sufre ---
    const camDir = new THREE.Vector3().subVectors(camera.position, this.root.position);
    const camYaw = Math.atan2(-camDir.x, -camDir.z) + Math.PI;
    let lookYaw = THREE.MathUtils.clamp(dyaw, -0.8, 0.8) * 0.6;
    if ((c.holding && c.effort > 0.75) || stumbling) {
      const toCam = Math.atan2(Math.sin(camYaw - this.yaw), Math.cos(camYaw - this.yaw));
      lookYaw = THREE.MathUtils.clamp(toCam, -1.0, 1.0) * (stumbling ? 0.5 : 0.8);
    }
    this.headYaw = damp(this.headYaw, upright ? lookYaw : 0, 6, dt);
    const leanVel = new THREE.Vector3(c.leanVel.x, 0, c.leanVel.z);
    const lagPitch = upright ? THREE.MathUtils.clamp(leanVel.dot(fwd) * 0.25, -0.35, 0.35) : 0;
    const effortPitch = c.holding ? -0.18 * c.effort : 0;
    this.headPitch = damp(this.headPitch, lagPitch + effortPitch + (stumbling ? -0.2 : 0), 8, dt);
    this.head.rotation.set(this.headPitch, this.headYaw, upright ? THREE.MathUtils.clamp(leanVel.dot(right) * -0.2, -0.3, 0.3) : Math.sin(this.t * 5) * 0.15 * (1 - this.lyingRest));
    // La gorra se bambolea con los meneos de cabeza
    this.capWobV += (-this.capWob * 220 - this.capWobV * 9 + (this.headPitch - this.capPrev) * 900) * dt;
    this.capPrev = this.headPitch;
    this.capWob += this.capWobV * dt;
    this.cap.rotation.x = -0.12 + THREE.MathUtils.clamp(this.capWob, -0.25, 0.25);

    // --- Cara: parpadeo, ojos apretados al tirar, abiertos de susto, cerrados al caer ---
    if (this.t > this.blinkAt) this.blinkAt = this.t + 2.4 + ((this.t * 7.13) % 1.6);
    const blink = this.blinkAt - this.t < 0.11 ? 0.12 : 1;
    let ex = 1, ey = 1;
    if (c.holding && c.effort > 0.6) { ey = 0.4; ex = 1.1; }
    if (stumbling || c.state === 'falling') { ey = 1.35; ex = 1.15; }
    if (lying && this.lyingRest > 0.6 && c.state === 'falling') ey = 0.15;
    for (const e of this.eyes) {
      e.scale.x = damp(e.scale.x, 0.052 * ex, 20, dt);
      e.scale.y = damp(e.scale.y, 0.086 * ey * blink, 25, dt);
    }
    const surprised = stumbling || c.state === 'falling';
    this.mouth.visible = surprised || (c.holding && c.effort > 0.7);
    this.mouth.scale.set(surprised ? 0.035 : 0.06, surprised ? 0.035 + dev * 0.05 : 0.012, 0.015);

    // Sombra de contacto
    const gy = ground(p.x, p.z);
    this.shadow.position.set(p.x, gy + 0.012, p.z);
    this.shadow.scale.setScalar(lying ? 1.5 : 1);
  }

  private lastWasDown = false;
  private capPrev = 0;

  private bootWorld(f: Foot) {
    const b = this.boots[this.feet.indexOf(f)];
    return b ? b.position.clone() : f.pos.clone();
  }
}
