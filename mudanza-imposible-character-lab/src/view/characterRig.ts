import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CENTER_Y } from '../sim/character';
import type { Lab } from '../sim/lab';
import { FlexTube, twoBone } from './tube';

/**
 * Muñeco de goma procedural: una sola judía de la cadera a la coronilla (camiseta clara y peto rojo abajo,
 * cabeza grande arriba), gorra roja, miembros de manguera gruesos, manoplas y botas de trabajo.
 *
 * La vista solo LEE la simulación (posición, inclinación, estado, fuerzas): nunca mueve el cuerpo físico.
 * - De pie, los pies los coloca un planificador de pasos: cada pie se apoya donde estará la cadera al aterrizar,
 *   con una zancada que depende de la velocidad real, y no se mueve mientras apoya.
 * - Al caer, tobillos y manos pasan a ser partículas con gravedad e inercia, atadas a cadera y hombros y que
 *   chocan con el suelo: cada caída deja los miembros en una postura distinta.
 * Para sustituirlo por un modelo con esqueleto basta con implementar `sync()` con los mismos datos.
 */

export const LOOK = {
  skin: '#f4b18b',
  shirt: '#f6f2ea',
  overalls: '#d93a2e',
  overallsDark: '#a92a21',
  cap: '#e4412f',
  boot: '#6a4129',
  bootToe: '#8a5a3b',
  sole: '#2f2a33',
  eye: '#17121d',
  brow: '#5a3523',
  button: '#f3c24f',
  blush: '#ee8f7f',
  hair: '#6b4128',
};

const DIM = {
  hipY: 0.41, hipX: 0.13,
  thigh: 0.165, shin: 0.165, ankleH: 0.09,
  shoulderY: 0.83, shoulderX: 0.325,
  upperArm: 0.2, foreArm: 0.2,
  neckY: 0.93, headC: 0.17, capY: 0.33,
};
const LEG = DIM.thigh + DIM.shin;

const rubber = (color: string, rough = 0.62) => new THREE.MeshPhysicalMaterial({
  color, roughness: rough, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.45, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color('#fff4ea'),
});
const cloth = (color: string) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.88, metalness: 0, sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffffff') });

const lathe = (pts: [number, number][], seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

interface Foot {
  pos: THREE.Vector3; // apoyo: punto del suelo bajo el tobillo
  from: THREE.Vector3; to: THREE.Vector3;
  t: number; dur: number; swinging: boolean;
  yaw: number; yawFrom: number; yawTo: number;
  side: number; landedAt: number;
}

interface Particle { p: THREE.Vector3; prev: THREE.Vector3 }

const damp = THREE.MathUtils.damp;
/** Puntos de la suela (x, z) en el espacio de la bota: esquinas y centros de puntera y talón. */
const SOLE = [[-0.095, -0.21], [0.095, -0.21], [-0.095, 0.12], [0.095, 0.12], [0, -0.215], [0, 0.125]];
const UP = new THREE.Vector3(0, 1, 0);
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class CharacterRig {
  group = new THREE.Group();
  private root = new THREE.Group();
  private pelvis = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private cap = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private brows: THREE.Mesh[] = [];
  private mouth: THREE.Mesh;
  private legs: FlexTube[] = [];
  private arms: FlexTube[] = [];
  private boots: THREE.Group[] = [];
  private hands: THREE.Group[] = [];
  private sleeves: THREE.Mesh[] = [];
  private shadow: THREE.Mesh;
  private feet: Foot[] = [];
  private limbs: Particle[] = []; // tobillo izq., tobillo dcho., mano izq., mano dcha. (solo en el suelo)
  private poles: THREE.Vector3[] = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1)];
  private vS = new THREE.Vector3();
  private yaw = 0;
  private yawFall = 0;
  private squash = 0; private squashV = 0;
  private headYaw = 0; private headPitch = 0;
  private capWob = 0; private capWobV = 0; private capPrev = 0;
  private prevRootY = 0; private prevRootVy = 0;
  private scrabbleT = 0;
  private t = 0;
  private blinkAt = 2;
  private lastState = '';
  private stateT = 0;
  private needSnap = true;
  private standUp = false;
  private standBlend = 0;
  private wasDown = false;
  private lastKnees: THREE.Vector3[] = [];
  private lastHips: THREE.Vector3[] = [];
  private lastAnkles: THREE.Vector3[] = [];
  /** Diagnóstico del último fotograma (pruebas de apoyo de los pies). */
  debug: { upright: boolean; yaw: number; root: number[]; feet: { swinging: boolean; sole: number[][]; knee: number[]; hip: number[]; ankle?: number[] }[] } | null = null;

  constructor() {
    const skin = rubber(LOOK.skin, 0.55), shirt = cloth(LOOK.shirt), over = cloth(LOOK.overalls), overDark = cloth(LOOK.overallsDark);
    const cap = rubber(LOOK.cap, 0.5), boot = rubber(LOOK.boot, 0.55), toe = rubber(LOOK.bootToe, 0.5), sole = rubber(LOOK.sole, 0.8);
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

    // Tronco: judía continua hasta el cuello (sin pico), camiseta arriba y peto abajo
    add(this.torso, lathe([[0, 0.355], [0.2, 0.36], [0.3, 0.405], [0.346, 0.49], [0.352, 0.6], [0.338, 0.7], [0.31, 0.8], [0.27, 0.88], [0.23, 0.94], [0.215, 0.97]]), shirt);
    add(this.torso, lathe([[0, 0.348], [0.205, 0.353], [0.307, 0.4], [0.355, 0.49], [0.359, 0.6], [0.352, 0.655], [0.345, 0.662]]), over);
    // Babero, bolsillo, tirantes y botones
    const bib = add(this.torso, new THREE.CylinderGeometry(0.318, 0.352, 0.2, 24, 1, true, Math.PI - 0.5, 1.0), over, 0, 0.75, 0);
    (bib.material as THREE.Material).side = THREE.DoubleSide;
    add(this.torso, new THREE.BoxGeometry(0.13, 0.075, 0.018), overDark, 0, 0.74, -0.348);
    for (const s of [-1, 1]) {
      const strap = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.13, 0.84, -0.3), new THREE.Vector3(s * 0.165, 0.92, -0.21), new THREE.Vector3(s * 0.19, 0.965, 0.0), new THREE.Vector3(s * 0.17, 0.9, 0.24), new THREE.Vector3(s * 0.12, 0.66, 0.335)]);
      add(this.torso, new THREE.TubeGeometry(strap, 20, 0.028, 8), over);
      add(this.torso, new THREE.SphereGeometry(0.034, 14, 10), rubber(LOOK.button, 0.35), s * 0.12, 0.835, -0.314);
    }
    // Perneras del peto: las piernas salen de ellas
    for (const s of [-1, 1]) {
      const leg = add(this.torso, new THREE.CylinderGeometry(0.112, 0.122, 0.12, 20), over, s * DIM.hipX, 0.37, 0);
      leg.rotation.z = s * 0.08;
    }
    // Cuello de la camiseta: une tronco y cabeza
    add(this.torso, new THREE.TorusGeometry(0.212, 0.03, 10, 40), cloth('#e7e0d3'), 0, 0.955, 0).rotation.x = Math.PI / 2;

    // Cabeza grande, de la misma familia de curvas que el tronco
    this.head.position.y = DIM.neckY;
    this.torso.add(this.head);
    add(this.head, lathe([[0.2, 0.0], [0.265, 0.045], [0.31, 0.11], [0.332, 0.2], [0.33, 0.29], [0.305, 0.39], [0.25, 0.47], [0.15, 0.53], [0, 0.55]]), skin);
    // Nariz redonda, colorete, ojos ovalados con brillo, cejas y boca (solo en apuros)
    add(this.head, new THREE.SphereGeometry(0.05, 16, 12), rubber('#efa07c', 0.5), 0, DIM.headC + 0.005, -0.335);
    const eyeMat = new THREE.MeshPhysicalMaterial({ color: LOOK.eye, roughness: 0.2, clearcoat: 1 });
    const browMat = rubber(LOOK.brow, 0.7);
    for (const s of [-1, 1]) {
      const e = add(this.head, new THREE.SphereGeometry(1, 18, 14), eyeMat, s * 0.105, DIM.headC + 0.075, -0.305);
      e.scale.set(0.05, 0.075, 0.03);
      e.castShadow = false;
      this.eyes.push(e);
      const shine = add(e, new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 0.3, 0.4, -0.75);
      shine.castShadow = false;
      const brow = add(this.head, new THREE.CapsuleGeometry(0.013, 0.07, 4, 8), browMat, s * 0.11, DIM.headC + 0.14, -0.3);
      brow.rotation.z = Math.PI / 2;
      brow.castShadow = false;
      brow.userData.side = s;
      this.brows.push(brow);
      const b = add(this.head, new THREE.CircleGeometry(0.05, 18), new THREE.MeshBasicMaterial({ color: LOOK.blush, transparent: true, opacity: 0.5 }), s * 0.19, DIM.headC - 0.01, -0.268);
      b.rotation.y = Math.PI + s * 0.6;
      b.castShadow = false;
    }
    this.mouth = add(this.head, new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ color: '#3a1220', roughness: 0.5 }), 0, DIM.headC - 0.075, -0.322);
    this.mouth.scale.set(0.035, 0.03, 0.015);
    this.mouth.visible = false;
    for (const [x, y, z, r] of [[-0.19, 0.3, 0.21, 0.6], [0.17, 0.29, 0.23, -0.5], [0.0, 0.26, 0.28, 0.0]] as const) {
      const tuft = add(this.head, new THREE.ConeGeometry(0.05, 0.12, 8), cloth(LOOK.hair), x, y, z);
      tuft.rotation.set(1.9, 0, r);
    }
    // Gorra roja ladeada: casquete, visera, botón y ribete
    this.cap.position.set(0, DIM.capY, 0);
    this.cap.rotation.set(-0.1, 0.18, 0.06);
    this.head.add(this.cap);
    add(this.cap, new THREE.SphereGeometry(0.336, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, -0.01, 0).scale.y = 0.78;
    const brim = add(this.cap, new THREE.CylinderGeometry(0.21, 0.21, 0.024, 32, 1, false, Math.PI - 1.2, 2.4), cap, 0, 0.0, -0.2);
    brim.rotation.x = 0.16;
    add(this.cap, new THREE.SphereGeometry(0.034, 12, 8), cap, 0, 0.255, 0);
    add(this.cap, new THREE.TorusGeometry(0.332, 0.016, 8, 48), rubber('#b92a1e', 0.6), 0, 0.0, 0).rotation.x = Math.PI / 2;

    // Miembros de manguera, gruesos y de grosor variable
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      const leg = new FlexTube(16, 12, (t) => 0.098 - 0.02 * t + 0.008 * Math.sin(Math.PI * t));
      const lm = new THREE.Mesh(leg.geometry, over);
      lm.castShadow = true; lm.receiveShadow = true; lm.frustumCulled = false;
      this.group.add(lm);
      this.legs.push(leg);
      const arm = new FlexTube(16, 12, (t) => 0.072 - 0.012 * t);
      const am = new THREE.Mesh(arm.geometry, skin);
      am.castShadow = true; am.frustumCulled = false;
      this.group.add(am);
      this.arms.push(arm);
      // Manga corta abombada
      const sl = add(this.group, new THREE.SphereGeometry(1, 18, 12), shirt);
      sl.scale.set(0.105, 0.12, 0.105);
      this.sleeves.push(sl);
      // Manopla grande: palma y pulgar
      const hand = new THREE.Group();
      const palm = add(hand, new THREE.SphereGeometry(1, 18, 14), skin);
      palm.scale.set(0.1, 0.082, 0.12);
      const thumb = add(hand, new THREE.SphereGeometry(1, 12, 10), skin, -s * 0.075, 0.025, 0.0);
      thumb.scale.set(0.042, 0.038, 0.06);
      thumb.rotation.y = -s * 0.5;
      this.group.add(hand);
      this.hands.push(hand);
      // Bota de trabajo: suela, empeine, puntera más clara, caña y vuelta del pantalón
      const b = new THREE.Group();
      add(b, new RoundedBoxGeometry(0.19, 0.036, 0.33, 2, 0.016), sole, 0, 0.018, -0.045);
      add(b, new RoundedBoxGeometry(0.18, 0.1, 0.27, 3, 0.048), boot, 0, 0.078, -0.03);
      const tc = add(b, new THREE.SphereGeometry(1, 18, 12), toe, 0, 0.07, -0.145);
      tc.scale.set(0.092, 0.06, 0.088);
      add(b, new THREE.CylinderGeometry(0.086, 0.09, 0.08, 18), boot, 0, 0.125, 0.025);
      this.group.add(b);
      this.boots.push(b);
      this.feet.push({ pos: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 0.3, swinging: false, yaw: 0, yawFrom: 0, yawTo: 0, side: s, landedAt: -1 });
    }
    for (let i = 0; i < 4; i++) this.limbs.push({ p: new THREE.Vector3(), prev: new THREE.Vector3() });

    // Sombra de contacto blanda
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(40,30,50,0.42)'); g.addColorStop(1, 'rgba(40,30,50,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.shadow);
  }

  /** Coloca de golpe los pies (al reiniciar una prueba). */
  snap() { this.needSnap = true; }

  /** Altura del suelo bajo la suela entera (la esquina más alta manda: así nunca se hunde) e inclinación de la suela. */
  private ground(lab: Lab, x: number, z: number, yaw: number) {
    const f = { x: -Math.sin(yaw), z: -Math.cos(yaw) }, r = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const at = (a: number, b: number) => lab.heightAt(x + f.x * a + r.x * b, z + f.z * a + r.z * b);
    const toe = Math.max(at(0.2, -0.08), at(0.2, 0.08)), heel = Math.max(at(-0.12, -0.08), at(-0.12, 0.08));
    const left = Math.max(at(0.2, -0.09), at(-0.12, -0.09)), rightH = Math.max(at(0.2, 0.09), at(-0.12, 0.09));
    const mid = lab.heightAt(x, z);
    const pitch = THREE.MathUtils.clamp(Math.atan2(toe - heel, 0.32), -0.3, 0.3);
    const roll = THREE.MathUtils.clamp(Math.atan2(rightH - left, 0.18), -0.3, 0.3);
    // Si un borde (bordillo) deja la suela a dos alturas, no se inclina: se apoya plana sobre lo más alto
    const flat = Math.abs(toe - heel) > 0.1 || Math.abs(rightH - left) > 0.1;
    // Inclinada, la suela sigue el plano (el centro a su altura); plana, se apoya sobre lo más alto
    return { y: flat ? Math.max(toe, heel, left, rightH, mid) : Math.max(mid, (toe + heel) / 2), pitch: flat ? 0 : pitch, roll: flat ? 0 : roll };
  }

  sync(lab: Lab, dt: number, camera: THREE.Camera) {
    const c = lab.char;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    if (c.state !== this.lastState) { this.lastState = c.state; this.stateT = 0; } else this.stateT += dt;
    const p = c.pos, v = c.body.linvel();
    const upright = c.upright;
    this.vS.x = damp(this.vS.x, v.x, 14, dt);
    this.vS.z = damp(this.vS.z, v.z, 14, dt);
    const speed = Math.hypot(this.vS.x, this.vS.z);

    // --- Raíz: en los pies, con la orientación y la inclinación del tronco que calcula la física ---
    const yawTarget = Math.atan2(-c.facing.x, -c.facing.z);
    const dyaw = wrap(yawTarget - this.yaw);
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
    const stumbling = c.state === 'losingBalance';
    const pulling = c.holding && c.effort > 0.5;
    const scrabble = pulling && speed < 0.35 && Math.hypot(c.wantVel.x, c.wantVel.z) > 0.3;

    // --- Pies de pie: planificador de pasos ---
    if (upright && this.wasDown) this.standUp = true;
    if (upright) this.planSteps(lab, dt, rootPos, fwd, right, speed, stumbling, scrabble, c.holding);

    // --- Pelvis: baja en el doble apoyo, se mece hacia el pie que apoya ---
    let bob = 0, sway = 0;
    if (upright) {
      for (const f of this.feet) if (f.swinging) { bob += Math.sin(Math.PI * f.t) * (0.03 + 0.01 * Math.min(2, speed)); sway += f.side * -Math.sin(Math.PI * f.t) * 0.07; }
      bob -= 0.012 * Math.min(1, speed / 2);
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
    const breathe = Math.sin(this.t * 2.4) * 0.01;
    this.torso.scale.set(1 - sq * 0.5, 1 + sq + breathe, 1 - sq * 0.5);
    // Contrarrotación del tronco con los pasos
    const fo = this.feet.map((f) => (upright ? f.pos.clone().sub(rootPos).dot(fwd) : 0));
    this.torso.rotation.y = damp(this.torso.rotation.y, THREE.MathUtils.clamp((fo[0] - fo[1]) * 0.5, -0.25, 0.25), 8, dt);

    this.group.updateMatrixWorld(true);
    const toWorld = (o: THREE.Object3D, x: number, y: number, z: number) => o.localToWorld(new THREE.Vector3(x, y, z));
    const hips = [toWorld(this.torso, -DIM.hipX, DIM.hipY - 0.03, 0), toWorld(this.torso, DIM.hipX, DIM.hipY - 0.03, 0)];
    const shoulders = [toWorld(this.torso, -DIM.shoulderX, DIM.shoulderY, 0), toWorld(this.torso, DIM.shoulderX, DIM.shoulderY, 0)];

    // --- En el suelo: tobillos y manos son partículas (gravedad, inercia, suelo) ---
    const down = !upright;
    const rec = c.state === 'recovering' ? Math.min(1, this.stateT / 0.85) : 0;
    if (down) {
      if (!this.wasDown) this.startLimbs(new THREE.Vector3(v.x, v.y, v.z), dt);
      this.stepLimbs(lab, dt, hips, shoulders, c.state === 'falling' && this.stateT < 0.9, rootPos, right, fwd, rec);
    }
    this.wasDown = down;

    // --- Piernas: cadera → rodilla (hacia la punta del pie) → tobillo ---
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i], b = this.boots[i];
      let ankle: THREE.Vector3;
      if (!down) {
        // Posición del pie en el suelo (o en el aire durante el paso) y orientación según el suelo
        let gx: number, gz: number, yaw: number, lift = 0, toePitch = 0;
        if (f.swinging) {
          const e = smooth(f.t);
          gx = f.from.x + (f.to.x - f.from.x) * e; gz = f.from.z + (f.to.z - f.from.z) * e;
          yaw = f.yawFrom + wrap(f.yawTo - f.yawFrom) * e;
          lift = Math.sin(Math.PI * Math.min(1, f.t * 1.1)) * (stumbling ? 0.14 : scrabble ? 0.05 : 0.055 + 0.025 * Math.min(2.5, speed));
          // Despega con el talón, aterriza con la punta levantada
          toePitch = (f.t < 0.35 ? -0.45 * Math.sin((f.t / 0.35) * Math.PI) : 0.3 * Math.sin(((f.t - 0.35) / 0.65) * Math.PI)) * (stumbling ? 1.3 : 1);
        } else { gx = f.pos.x; gz = f.pos.z; yaw = f.yaw; }
        const g = this.ground(lab, gx, gz, yaw);
        const gy = f.swinging ? Math.max(g.y, f.from.y + (f.to.y - f.from.y) * smooth(f.t)) : g.y;
        b.position.set(gx, gy + lift, gz);
        b.quaternion.setFromEuler(new THREE.Euler(g.pitch * (f.swinging ? 1 - Math.sin(Math.PI * f.t) : 1) + toePitch, yaw, g.roll, 'YXZ'));
        b.updateMatrixWorld(true);
        let dig = 0;
        for (const [sx, sz] of SOLE) {
          const q = b.localToWorld(new THREE.Vector3(sx, 0, sz));
          dig = Math.max(dig, lab.heightAt(q.x, q.z) - q.y);
        }
        if (dig > 0) { b.position.y += dig; b.updateMatrixWorld(true); }
        ankle = b.localToWorld(new THREE.Vector3(0, DIM.ankleH, 0.02));
        // Recién levantado: el tobillo llega desde donde estaba (sin saltos de un fotograma)
        if (this.standBlend > 0 && this.lastAnkles[i]) {
          const off = this.lastAnkles[i].clone().sub(ankle).multiplyScalar(this.standBlend * 0.8);
          ankle.add(off); b.position.add(off); b.updateMatrixWorld(true);
        }
      } else {
        ankle = this.limbs[i].p.clone();
        // Bota orientada con la espinilla (perpendicular a ella), sin postura fija
        const kneeGuess = hips[i].clone().lerp(ankle, 0.5).add(new THREE.Vector3(0, 0.06, 0));
        const shinUp = kneeGuess.clone().sub(ankle).normalize();
        const toeDir = fwd.clone().sub(shinUp.clone().multiplyScalar(fwd.dot(shinUp)));
        if (toeDir.lengthSq() < 1e-4) toeDir.copy(new THREE.Vector3(0, 1, 0).cross(shinUp));
        toeDir.normalize();
        const m = new THREE.Matrix4().makeBasis(toeDir.clone().cross(shinUp).negate().normalize(), shinUp, toeDir.clone().negate());
        b.quaternion.setFromRotationMatrix(m);
        b.position.copy(ankle).addScaledVector(shinUp, -DIM.ankleH);
        b.updateMatrixWorld(true);
      }
      // Rodilla: hacia donde apunta el pie (suavizado), un poco hacia fuera; nunca salta de lado
      const footFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(b.quaternion);
      footFwd.y = Math.max(footFwd.y, 0);
      const poleGoal = footFwd.normalize().multiplyScalar(0.8).addScaledVector(right, f.side * 0.15).add(new THREE.Vector3(0, 0.15, 0));
      // La rodilla gira alrededor de la pierna con velocidad limitada y, si tiene que dar media vuelta,
      // pasa por fuera: nunca atraviesa el eje de la pierna (eso la haría saltar de lado en un fotograma)
      const pole = this.poles[i];
      const ah = Math.atan2(pole.x, pole.z), ag = Math.atan2(poleGoal.x, poleGoal.z);
      let da = wrap(ag - ah);
      if (Math.abs(da) > 2.6) {
        const out = Math.sign(wrap(Math.atan2(right.x * f.side, right.z * f.side) - ah)) || 1;
        if (out !== Math.sign(da)) da = out * (2 * Math.PI - Math.abs(da));
      }
      const an = ah + Math.sign(da) * Math.min(Math.abs(da), dt * 14);
      const hl = Math.max(0.5, damp(Math.hypot(pole.x, pole.z), Math.hypot(poleGoal.x, poleGoal.z), 12, dt));
      pole.set(Math.sin(an) * hl, damp(pole.y, poleGoal.y, 12, dt), Math.cos(an) * hl);
      const knee = twoBone(hips[i], ankle, DIM.thigh, DIM.shin, pole);
      this.lastKnees[i] = knee; this.lastHips[i] = hips[i]; this.lastAnkles[i] = ankle;
      this.legs[i].update(hips[i], knee, ankle);
    }

    this.standBlend = Math.max(0, this.standBlend - dt / 0.15);

    // --- Brazos: hombro → codo → manopla ---
    const grab = c.grabWorld();
    const dev = Math.hypot(c.leanDev.x, c.leanDev.z);
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      let hand: THREE.Vector3;
      if (down) hand = this.limbs[2 + i].p.clone();
      else if (grab && !stumbling) {
        const side = new THREE.Vector3(-c.handDir.z, 0, c.handDir.x);
        hand = new THREE.Vector3(grab.x, grab.y, grab.z).addScaledVector(side, s * 0.14).add(new THREE.Vector3(0, 0.05, 0));
        if (c.effort > 0.6) hand.y += Math.sin(this.t * 41 + i * 2) * 0.012 * c.effort; // temblor de esfuerzo
      } else if (stumbling) {
        // Molinillo: brazos en círculo, más grandes cuanto mayor el desequilibrio
        const a = this.t * 13 + i * Math.PI, amp = 0.25 + Math.min(0.35, dev);
        hand = toWorld(this.torso, s * (DIM.shoulderX + 0.3), DIM.shoulderY + 0.1 + Math.sin(a) * amp, Math.cos(a) * amp);
      } else {
        // Andando: cada brazo va con la pierna contraria; quieto, cuelgan con un leve balanceo
        const swing = THREE.MathUtils.clamp(fo[i ? 0 : 1] * 0.7, -0.22, 0.22);
        hand = toWorld(this.torso, s * (DIM.shoulderX + 0.15), DIM.shoulderY - 0.38 + Math.abs(swing) * 0.25, -swing + Math.sin(this.t * 1.7 + i) * 0.012);
      }
      const pole = toWorld(this.torso, s * 0.7, DIM.shoulderY - 0.3, 0.5).sub(shoulders[i]);
      const elbow = twoBone(shoulders[i], hand, DIM.upperArm, DIM.foreArm, pole);
      this.arms[i].update(shoulders[i], elbow, hand);
      const dir = elbow.clone().sub(shoulders[i]).normalize();
      this.sleeves[i].position.copy(shoulders[i]).addScaledVector(dir, 0.035);
      this.sleeves[i].quaternion.setFromUnitVectors(UP, dir);
      const hd = hand.clone().sub(elbow).normalize();
      this.hands[i].position.copy(hand).addScaledVector(hd, 0.06);
      this.hands[i].quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), hd);
    }

    // --- Cabeza: anticipa los giros, se retrasa con los tirones, mira a cámara cuando sufre ---
    const camDir = new THREE.Vector3().subVectors(camera.position, this.root.position);
    const camYaw = Math.atan2(-camDir.x, -camDir.z) + Math.PI;
    let lookYaw = THREE.MathUtils.clamp(dyaw, -0.8, 0.8) * 0.6;
    if ((c.holding && c.effort > 0.75) || stumbling) lookYaw = THREE.MathUtils.clamp(wrap(camYaw - this.yaw), -1.0, 1.0) * (stumbling ? 0.5 : 0.8);
    this.headYaw = damp(this.headYaw, upright ? lookYaw : 0, 6, dt);
    const leanVel = new THREE.Vector3(c.leanVel.x, 0, c.leanVel.z);
    const lagPitch = upright ? THREE.MathUtils.clamp(leanVel.dot(fwd) * 0.25, -0.35, 0.35) : 0;
    this.headPitch = damp(this.headPitch, lagPitch + (c.holding ? -0.18 * c.effort : 0) + (stumbling ? -0.2 : 0), 8, dt);
    this.head.rotation.set(this.headPitch, this.headYaw, upright ? THREE.MathUtils.clamp(leanVel.dot(right) * -0.2, -0.3, 0.3) : Math.sin(this.t * 5) * 0.12 * (c.state === 'falling' ? 1 : 0));
    this.capWobV += (-this.capWob * 220 - this.capWobV * 9 + (this.headPitch - this.capPrev) * 900) * dt;
    this.capPrev = this.headPitch;
    this.capWob += this.capWobV * dt;
    this.cap.rotation.x = -0.12 + THREE.MathUtils.clamp(this.capWob, -0.25, 0.25);

    // --- Cara: parpadeo, ojos apretados y cejas fruncidas al tirar, susto al caer ---
    if (this.t > this.blinkAt) this.blinkAt = this.t + 2.4 + ((this.t * 7.13) % 1.6);
    const blink = this.blinkAt - this.t < 0.11 ? 0.12 : 1;
    const surprised = stumbling || c.state === 'falling';
    const effort = c.holding && c.effort > 0.6;
    let ex = 1, ey = 1;
    if (effort) { ey = 0.42; ex = 1.1; }
    if (surprised) { ey = 1.3; ex = 1.12; }
    if (c.state === 'falling' && this.stateT > 0.6) ey = 0.15; // aturdido en el suelo
    for (const e of this.eyes) {
      e.scale.x = damp(e.scale.x, 0.05 * ex, 20, dt);
      e.scale.y = damp(e.scale.y, 0.08 * ey * blink, 25, dt);
    }
    for (const br of this.brows) {
      const sd = br.userData.side as number;
      br.rotation.z = damp(br.rotation.z, Math.PI / 2 + sd * (effort ? -0.4 : surprised ? 0.25 : 0.05), 12, dt);
      br.position.y = damp(br.position.y, DIM.headC + (surprised ? 0.165 : effort ? 0.125 : 0.14), 12, dt);
    }
    this.mouth.visible = surprised || (c.holding && c.effort > 0.7);
    this.mouth.scale.set(surprised ? 0.035 : 0.06, surprised ? 0.035 + dev * 0.05 : 0.012, 0.015);

    // Diagnóstico (solo lectura): esquinas de la suela, rodillas y fase de cada pie
    this.debug = {
      upright, yaw: this.yaw, root: rootPos.toArray(),
      feet: this.boots.map((bt, i) => ({
        swinging: this.feet[i].swinging,
        sole: SOLE.slice(0, 4).map(([x, z]) => bt.localToWorld(new THREE.Vector3(x, 0, z)).toArray()),
        knee: this.lastKnees[i].toArray(), hip: this.lastHips[i].toArray(), ankle: this.lastAnkles[i].toArray(),
      })),
    };
    const gy = lab.heightAt(p.x, p.z);
    this.shadow.position.set(p.x, gy + 0.012, p.z);
    this.shadow.scale.setScalar(down ? 1.5 : 1);
  }

  /**
   * Planificador de pasos. Cada pie apoyado se queda quieto. Da un paso cuando:
   * se ha quedado media zancada por detrás de la cadera, la pierna se estira de más, ha quedado en el lado
   * equivocado (cruce) o el cuerpo ha girado mucho. Aterriza donde estará la cadera al aterrizar, más media
   * zancada, y el destino se corrige durante el vuelo si el cuerpo acelera o frena.
   */
  private planSteps(lab: Lab, dt: number, root: THREE.Vector3, fwd: THREE.Vector3, right: THREE.Vector3, speed: number, stumbling: boolean, scrabble: boolean, holding: boolean) {
    const W = 0.13;
    const moving = speed > 0.25;
    const dirV = moving ? new THREE.Vector3(this.vS.x, 0, this.vS.z).normalize() : fwd.clone();
    const L = stumbling ? 0.3 + 0.15 * speed : scrabble ? 0.12 : THREE.MathUtils.clamp(0.16 + 0.17 * speed, 0.16, 0.72);
    const T = stumbling ? 0.13 : scrabble ? 0.15 : THREE.MathUtils.clamp(0.3 - 0.035 * speed, 0.15, 0.3);
    const neutral = (f: Foot) => root.clone().addScaledVector(right, f.side * W).addScaledVector(fwd, holding ? 0.06 : 0);
    const landing = (f: Foot, tLeft: number) => {
      const target = neutral(f).addScaledVector(new THREE.Vector3(this.vS.x, 0, this.vS.z), tLeft);
      if (moving) target.addScaledVector(dirV, L / 2);
      // Nunca al otro lado del cuerpo: separación mínima respecto al centro
      const lat = target.clone().sub(root).dot(right);
      if (lat * f.side < 0.07) target.addScaledVector(right, f.side * 0.07 - lat);
      target.y = 0;
      return target;
    };
    if (this.needSnap) {
      for (const f of this.feet) {
        f.pos.copy(neutral(f)); f.pos.y = this.ground(lab, f.pos.x, f.pos.z, this.yaw).y;
        f.swinging = false; f.yaw = f.yawTo = this.yaw + f.side * 0.08;
      }
      this.needSnap = false;
    }
    if (this.standUp) {
      // Al quedar de pie, cada pie sale de donde está dibujado (sin saltos), siempre en su lado del cuerpo;
      // los pasos normales lo recogen bajo la cadera
      for (const [i, f] of this.feet.entries()) {
        f.pos.copy(this.boots[i].position);
        const lat = f.pos.clone().sub(root).dot(right);
        if (lat * f.side < 0.07) f.pos.addScaledVector(right, f.side * 0.07 - lat);
        f.pos.y = this.ground(lab, f.pos.x, f.pos.z, this.yaw).y;
        f.swinging = false; f.yaw = f.yawTo = this.yaw + f.side * 0.08; f.landedAt = this.t - 1;
      }
      this.standUp = false;
      this.standBlend = 1;
    }
    this.scrabbleT -= dt;
    // Pies en el aire: avanzan y corrigen el destino
    for (const f of this.feet) {
      if (!f.swinging) continue;
      f.t += dt / f.dur;
      const want = landing(f, Math.max(0, 1 - f.t) * f.dur);
      if (scrabble) want.addScaledVector(fwd, -0.05);
      f.to.x += (want.x - f.to.x) * Math.min(1, dt * 10);
      f.to.z += (want.z - f.to.z) * Math.min(1, dt * 10);
      f.to.y = this.ground(lab, f.to.x, f.to.z, f.yawTo).y;
      if (f.t >= 1) {
        f.swinging = false; f.pos.copy(f.to); f.yaw = f.yawTo; f.landedAt = this.t;
        this.squashV -= stumbling ? 1.3 : 0.45;
      }
    }
    // Pies apoyados: ¿hace falta un paso?
    let best: Foot | null = null, bestErr = 0;
    for (const f of this.feet) {
      if (f.swinging || this.t - f.landedAt < 0.04) continue;
      const other = this.feet[f === this.feet[0] ? 1 : 0];
      const otherOk = !other.swinging || other.t > (stumbling || speed > 2.5 ? 0.5 : 0.85);
      if (!otherOk) continue;
      const rel = f.pos.clone().sub(neutral(f)); rel.y = 0;
      const behind = -rel.dot(dirV);
      const err = rel.length();
      const lat = f.pos.clone().sub(root).dot(right) * f.side;
      const hipToFoot = Math.hypot(f.pos.x - root.x - right.x * f.side * W, f.pos.z - root.z - right.z * f.side * W);
      const yawOff = Math.abs(wrap(this.yaw - f.yaw));
      let need = moving ? behind > L * 0.5 || err > L * 0.9 : err > 0.085;
      need ||= lat < 0.02 || hipToFoot > LEG * 0.95 || yawOff > 0.7;
      if (scrabble && this.scrabbleT <= 0) need = true;
      if (need && err + (lat < 0.02 ? 1 : 0) >= bestErr) { best = f; bestErr = err + (lat < 0.02 ? 1 : 0); }
    }
    if (best) {
      const f = best;
      f.swinging = true; f.t = 0; f.dur = T;
      f.from.copy(f.pos);
      f.to.copy(landing(f, T));
      if (scrabble) { f.to.addScaledVector(fwd, -0.05); this.scrabbleT = 0.18; }
      // Torpeza: cada pie cae un poco donde quiere (sin cruzar)
      f.to.addScaledVector(fwd, Math.cos(this.t * 13.1 + f.side) * 0.02).addScaledVector(right, f.side * Math.abs(Math.sin(this.t * 17.3 + f.side * 5)) * 0.025);
      f.to.y = this.ground(lab, f.to.x, f.to.z, this.yaw).y;
      f.yawFrom = f.yaw;
      f.yawTo = this.yaw + f.side * 0.08 + (stumbling ? Math.sin(this.t * 9 + f.side) * 0.3 : 0);
    }
    // Al tirar sin avanzar, el pie que empuja resbala un poco hacia atrás (patina en la alfombra)
    if (scrabble) for (const f of this.feet) if (!f.swinging) f.pos.addScaledVector(fwd, -0.03 * dt);
  }

  /** Al caer: los tobillos y las manos sueltan su postura y heredan la velocidad del cuerpo. */
  private startLimbs(vel: THREE.Vector3, dt: number) {
    const pts = [...this.boots.map((b) => b.localToWorld(new THREE.Vector3(0, DIM.ankleH, 0.02))), ...this.hands.map((h) => h.position.clone())];
    this.limbs.forEach((l, i) => { l.p.copy(pts[i]); l.prev.copy(pts[i]).addScaledVector(vel, -dt); });
  }

  /**
   * Miembros sueltos: Verlet con gravedad, atados a cadera u hombro (longitud máxima) y chocando con el suelo.
   * Mientras cae, los pies y las manos patalean; en el suelo se quedan donde caen. Al levantarse se recogen
   * hacia la postura de apoyo (manos delante, pies bajo la cadera).
   */
  private stepLimbs(lab: Lab, dt: number, hips: THREE.Vector3[], shoulders: THREE.Vector3[], flail: boolean, root: THREE.Vector3, right: THREE.Vector3, fwd: THREE.Vector3, rec: number) {
    const sub = 2, h = dt / sub;
    const anchors = [hips[0], hips[1], shoulders[0], shoulders[1]];
    const maxLen = [LEG + DIM.ankleH + 0.06, LEG + DIM.ankleH + 0.06, DIM.upperArm + DIM.foreArm + 0.08, DIM.upperArm + DIM.foreArm + 0.08];
    const radius = [0.06, 0.06, 0.07, 0.07];
    for (let k = 0; k < sub; k++) {
      this.limbs.forEach((l, i) => {
        const acc = new THREE.Vector3(0, -9.8, 0);
        if (flail) acc.add(new THREE.Vector3(Math.sin(this.t * (11 + i) + i * 2), Math.cos(this.t * (13 + i * 2)), Math.sin(this.t * (9 + i * 3) + 1)).multiplyScalar(i < 2 ? 14 : 18));
        const next = l.p.clone().add(l.p.clone().sub(l.prev).multiplyScalar(0.985)).addScaledVector(acc, h * h);
        l.prev.copy(l.p); l.p.copy(next);
        // Atado a la cadera o al hombro
        const d = l.p.clone().sub(anchors[i]), len = d.length();
        if (len > maxLen[i]) l.p.copy(anchors[i]).addScaledVector(d, maxLen[i] / len);
        else if (len < 0.14) l.p.copy(anchors[i]).addScaledVector(d.normalize(), 0.14);
        // Suelo (con rozamiento al tocarlo)
        const gy = lab.heightAt(l.p.x, l.p.z) + radius[i];
        if (l.p.y < gy) {
          l.p.y = gy;
          l.prev.x += (l.p.x - l.prev.x) * 0.5; l.prev.z += (l.p.z - l.prev.z) * 0.5;
          if (l.prev.y < l.p.y) l.prev.y = l.p.y;
        }
      });
    }
    if (rec > 0) {
      // Levantarse: manos apoyadas delante y pies que vuelven bajo la cadera (de pie, donde los dejará el planificador)
      const e = smooth(rec);
      const handT = (s: number) => root.clone().addScaledVector(right, s * 0.32).addScaledVector(fwd, -0.38).setY(lab.heightAt(root.x, root.z) + 0.07);
      const targets = [
        root.clone().addScaledVector(right, -0.13).setY(lab.heightAt(root.x, root.z) + DIM.ankleH),
        root.clone().addScaledVector(right, 0.13).setY(lab.heightAt(root.x, root.z) + DIM.ankleH),
        handT(-1), handT(1),
      ];
      // Las manos empujan el suelo la primera mitad y luego vuelven a colgar
      const handW = rec < 0.6 ? smooth(rec / 0.6) : 1 - smooth((rec - 0.6) / 0.4);
      this.limbs.forEach((l, i) => {
        const w = i < 2 ? e : handW;
        const goal = i < 2 ? targets[i] : targets[i].clone().lerp(shoulders[i - 2].clone().add(new THREE.Vector3(0, -0.38, 0)), rec > 0.6 ? 1 - handW : 0);
        l.p.lerp(goal, Math.min(1, w));
        l.prev.copy(l.p);
      });
    }
  }
}
