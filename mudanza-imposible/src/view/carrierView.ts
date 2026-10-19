import * as THREE from 'three';
import { CARRIER, CENTER_Y, type Carrier } from '../sim/carrier';
import { mat, PALETTE } from './materials';
import { textSprite } from './text';
import type { Fx } from './fx';

export const PLAYER_COLORS = ['#facc15', '#22d3ee', '#f472b6', '#a3e635'];
const SKIN = '#f5c9a6';
const INK = '#1f1a2e';

const outlineMat = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });
/** Contorno de dibujo animado como hija de la malla (hereda su animación). */
function inked<T extends THREE.Mesh>(m: T, thickness = 0.03): T {
  const s = m.geometry.boundingSphere ?? (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere!);
  const o = new THREE.Mesh(m.geometry, outlineMat);
  o.scale.setScalar(1 + thickness / Math.max(0.05, s.radius));
  o.userData.outline = true;
  m.add(o);
  return m;
}

function mesh(geo: THREE.BufferGeometry, color: string, parent: THREE.Object3D, x = 0, y = 0, z = 0, line = 0.03, opts: { rough?: number } = {}) {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.position.set(x, y, z);
  // Los detalles pequeños (ojos, cejas, nariz) ni proyectan sombra ni llevan contorno: ahorran dibujado
  m.castShadow = line >= 0.02;
  parent.add(m);
  if (line >= 0.02) inked(m, line);
  return m;
}

/** Punto de la superficie de una esfera de radio r en la dirección (x, y, z). */
const onSphere = (r: number, x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize().multiplyScalar(r);

interface Rig {
  /** Pivote en los pies: guiño, inclinación y caída giran alrededor del suelo. */
  pivot: THREE.Group;
  /** Cuerpo: rebote y aplastamiento. */
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  /** Hombros en coordenadas del torso. */
  shoulders: THREE.Vector3[];
  /** Boca del perro (agarra con los dientes), en coordenadas de la cabeza. */
  snout?: THREE.Vector3;
  armColor: string;
  handColor: string;
  armR: number;
  pupils: THREE.Mesh[];
  eyes: THREE.Mesh[];
  brows: THREE.Mesh[];
  smile: THREE.Mesh;
  shout: THREE.Mesh;
  wobbly: THREE.Object3D[];
  tail?: THREE.Object3D;
  quadruped: boolean;
  headR: number;
}

function face(head: THREE.Group, R: number, rig: Pick<Rig, 'pupils' | 'eyes' | 'brows'>, o: { cyclops?: boolean; eyeY?: number; glasses?: boolean } = {}) {
  const ey = o.eyeY ?? 0.12;
  const eyesX = o.cyclops ? [0] : [-0.36, 0.36];
  for (const sx of eyesX) {
    const r = o.cyclops ? 0.13 : 0.072;
    const p = onSphere(R, sx, ey, -0.93);
    const white = mesh(new THREE.SphereGeometry(r, 12, 10), '#ffffff', head, p.x, p.y, p.z, 0.012);
    white.scale.z = 0.55;
    const pupil = mesh(new THREE.SphereGeometry(r * 0.52, 10, 8), INK, white, 0, 0, -r * 0.75, 0);
    rig.eyes.push(white);
    rig.pupils.push(pupil);
    if (!o.cyclops) {
      const bp = onSphere(R + 0.01, sx * 1.05, ey + 0.32, -0.88);
      const brow = mesh(new THREE.BoxGeometry(0.11, 0.028, 0.03), INK, head, bp.x, bp.y, bp.z, 0);
      brow.userData.side = Math.sign(sx);
      rig.brows.push(brow);
    }
    if (o.glasses) {
      const ring = mesh(new THREE.TorusGeometry(r * 1.35, 0.012, 6, 16), '#111827', head, p.x, p.y, p.z - 0.03, 0);
      void ring;
    }
  }
}

function mouth(head: THREE.Group, R: number, y = -0.38) {
  const p = onSphere(R, 0, y, -0.93);
  const smile = mesh(new THREE.TorusGeometry(0.065, 0.017, 6, 12, Math.PI), '#7f1d1d', head, p.x, p.y + 0.02, p.z, 0);
  smile.rotation.z = Math.PI;
  const shout = mesh(new THREE.SphereGeometry(0.055, 10, 8), '#7f1d1d', head, p.x, p.y, p.z + 0.01, 0);
  shout.scale.set(1, 1.25, 0.45);
  shout.visible = false;
  return { smile, shout };
}

function leg(parent: THREE.Object3D, x: number, hipY: number, len: number, r: number, pants: string, shoe: string, shoeSize = 1) {
  const hip = new THREE.Group();
  hip.position.set(x, hipY, 0);
  parent.add(hip);
  mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 4, 8), pants, hip, 0, -len / 2, 0, 0.022);
  const s = mesh(new THREE.SphereGeometry(0.1 * shoeSize, 10, 8), shoe, hip, 0, -len + 0.03, -0.05, 0);
  s.scale.set(0.85, 0.6, 1.35);
  return hip;
}

/** Personaje de caricatura con primitivas. Coordenadas: y = 0 en los pies, mira hacia -z. */
function buildRig(cast: Carrier['cast']['cast']): Rig {
  const pivot = new THREE.Group();
  const body = new THREE.Group();
  pivot.add(body);
  const torso = new THREE.Group();
  const head = new THREE.Group();
  const rig: Rig = {
    pivot, body, torso, head, legs: [], shoulders: [], armColor: SKIN, handColor: SKIN, armR: 0.055,
    pupils: [], eyes: [], brows: [], smile: null!, shout: null!, wobbly: [], quadruped: false, headR: 0.27,
  };

  if (cast === 'perro') {
    // Salchicha: cuerpo largo, cuatro patas, orejas que bailan y rabo que se agita
    rig.quadruped = true;
    const brown = '#a1582b', dark = '#6b3416';
    torso.position.set(0, 0.36, 0);
    body.add(torso);
    const trunk = mesh(new THREE.CapsuleGeometry(0.2, 0.62, 6, 14), brown, torso, 0, 0, 0, 0.03);
    trunk.rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.17, 12, 8), '#e9b886', torso, 0, -0.08, -0.05, 0).scale.set(1, 0.6, 2.2);
    head.position.set(0, 0.24, -0.5);
    torso.add(head);
    rig.headR = 0.2;
    mesh(new THREE.SphereGeometry(0.2, 14, 10), brown, head, 0, 0, 0, 0.03);
    const muzzle = mesh(new THREE.CapsuleGeometry(0.1, 0.16, 4, 10), brown, head, 0, -0.06, -0.2, 0.02);
    muzzle.rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.06, 8, 6), '#1f1a2e', head, 0, -0.03, -0.38, 0);
    rig.snout = new THREE.Vector3(0, -0.1, -0.36);
    for (const s of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(s * 0.16, 0.08, 0.02);
      head.add(ear);
      const e = mesh(new THREE.CapsuleGeometry(0.07, 0.2, 4, 8), dark, ear, 0, -0.14, 0, 0.02);
      e.scale.z = 0.45;
      ear.rotation.z = s * 0.25;
      rig.wobbly.push(ear);
    }
    face(head, 0.2, rig, { eyeY: 0.3 });
    const m = mouth(head, 0.2, -0.55);
    rig.smile = m.smile; rig.shout = m.shout;
    mesh(new THREE.TorusGeometry(0.17, 0.04, 6, 14), '#ef4444', torso, 0, 0.06, -0.36, 0).rotation.x = Math.PI / 2.3;
    for (const z of [-0.3, 0.3]) for (const s of [-1, 1]) {
      const l = leg(torso, s * 0.12, -0.08, 0.26, 0.05, brown, dark, 0.7);
      l.position.z = z;
      rig.legs.push(l);
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0.06, 0.48);
    torso.add(tail);
    mesh(new THREE.CapsuleGeometry(0.035, 0.26, 4, 6), brown, tail, 0, 0.12, 0.06, 0.015).rotation.x = -0.6;
    rig.tail = tail;
    return rig;
  }

  type Spec = { hipY: number; legLen: number; legR: number; hipX: number; tr: number; tl: number; tY: number; tScale: [number, number, number]; headR: number; headY: number; sh: [number, number]; shirt: string; pants: string; shoe: string; skin: string };
  const S: Record<string, Spec> = {
    mono: { hipY: 0.38, legLen: 0.36, legR: 0.045, hipX: 0.1, tr: 0.23, tl: 0.2, tY: 0.3, tScale: [1, 1, 0.9], headR: 0.27, headY: 0.86, sh: [0.25, 0.52], shirt: '#8b5cf6', pants: SKIN, shoe: '#1f2937', skin: SKIN },
    rulos: { hipY: 0.36, legLen: 0.34, legR: 0.05, hipX: 0.11, tr: 0.26, tl: 0.16, tY: 0.3, tScale: [1, 1, 0.95], headR: 0.27, headY: 0.84, sh: [0.27, 0.5], shirt: '#ec4899', pants: SKIN, shoe: '#f9a8d4', skin: SKIN },
    gordo: { hipY: 0.3, legLen: 0.28, legR: 0.075, hipX: 0.17, tr: 0.36, tl: 0.1, tY: 0.32, tScale: [1.18, 1, 1.12], headR: 0.25, headY: 0.82, sh: [0.42, 0.52], shirt: '#f8fafc', pants: '#2563eb', shoe: '#1f2937', skin: '#eea27c' },
    alien: { hipY: 0.3, legLen: 0.28, legR: 0.05, hipX: 0.1, tr: 0.21, tl: 0.16, tY: 0.26, tScale: [1, 1, 0.9], headR: 0.34, headY: 0.86, sh: [0.22, 0.42], shirt: '#c7d2fe', pants: '#4ade80', shoe: '#64748b', skin: '#4ade80' },
    enano: { hipY: 0.24, legLen: 0.22, legR: 0.06, hipX: 0.12, tr: 0.25, tl: 0.1, tY: 0.26, tScale: [1.05, 1, 1], headR: 0.28, headY: 0.72, sh: [0.27, 0.42], shirt: '#2563eb', pants: '#1e40af', shoe: '#78350f', skin: SKIN },
  };
  const s = S[cast];
  rig.headR = s.headR;
  rig.armColor = cast === 'gordo' || cast === 'alien' ? s.skin : s.shirt;
  rig.handColor = s.skin;
  rig.armR = cast === 'gordo' ? 0.075 : 0.055;
  for (const sx of [-1, 1]) rig.legs.push(leg(body, sx * s.hipX, s.hipY, s.legLen, s.legR, s.pants, s.shoe, cast === 'rulos' ? 1.25 : 1));
  torso.position.set(0, s.hipY, 0);
  body.add(torso);
  const t = mesh(new THREE.CapsuleGeometry(s.tr, s.tl, 6, 16), s.shirt, torso, 0, s.tY, 0, 0.032);
  t.scale.set(...s.tScale);
  head.position.set(0, s.headY, 0);
  torso.add(head);
  mesh(new THREE.SphereGeometry(s.headR, 16, 12), s.skin, head, 0, 0, 0, 0.032);
  rig.shoulders = [new THREE.Vector3(-s.sh[0], s.sh[1], 0), new THREE.Vector3(s.sh[0], s.sh[1], 0)];
  const R = s.headR;
  const cap = (color: string, theta = Math.PI / 2, grow = 0.025) => mesh(new THREE.SphereGeometry(R + grow, 16, 8, 0, Math.PI * 2, 0, theta), color, head, 0, 0, 0, 0.02);

  if (cast === 'mono') {
    // Abuela con moño, gafas y falda; algo encorvada
    torso.rotation.x = -0.12;
    const skirt = mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.4, 16), '#6d28d9', torso, 0, 0.02, 0, 0.03);
    void skirt;
    const hair = cap('#f1f5f9', Math.PI / 1.7);
    hair.rotation.x = 0.35;
    const bun = mesh(new THREE.SphereGeometry(0.15, 14, 10), '#f8fafc', head, 0, R + 0.06, 0.1, 0.025);
    rig.wobbly.push(bun);
    face(head, R, rig, { glasses: true });
    mesh(new THREE.SphereGeometry(0.05, 8, 6), '#f0a98a', head, 0, -0.03, -R - 0.01, 0);
  } else if (cast === 'rulos') {
    // Abuela en bata con rulos y zapatillas de borla
    mesh(new THREE.CylinderGeometry(0.25, 0.33, 0.42, 16), '#f472b6', torso, 0, 0.02, 0, 0.03);
    const hair = cap('#c084fc', Math.PI / 1.8);
    hair.rotation.x = 0.25;
    // Rulos: cilindros pequeños siguiendo la curva del cráneo
    [[-0.5, 0.75, 0.2], [0, 0.85, 0.15], [0.5, 0.75, 0.2], [-0.35, 0.55, 0.6], [0.35, 0.55, 0.6]].forEach(([x, y, z], i) => {
      const p = onSphere(R + 0.03, x, y, z);
      const c = mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.13, 10), ['#60a5fa', '#facc15', '#34d399'][i % 3], head, p.x, p.y, p.z, 0.012);
      c.rotation.z = Math.PI / 2;
    });
    face(head, R, rig);
    mesh(new THREE.SphereGeometry(0.05, 8, 6), '#f0a98a', head, 0, -0.03, -R - 0.01, 0);
  } else if (cast === 'gordo') {
    // Grandullón en camiseta de tirantes, barriga, calvo con bigote
    mesh(new THREE.SphereGeometry(0.3, 16, 12), s.shirt, torso, 0, 0.26, -0.16, 0.03);
    mesh(new THREE.CylinderGeometry(0.42, 0.4, 0.2, 18), s.pants, torso, 0, 0.02, 0, 0.03);
    const ring = mesh(new THREE.TorusGeometry(R * 0.86, 0.09, 6, 18, Math.PI * 1.2), '#4a2c12', head, 0, 0.02, 0.02, 0);
    ring.rotation.set(Math.PI / 2, 0, -Math.PI * 0.1 - Math.PI / 2 + Math.PI);
    face(head, R, rig);
    const ms = onSphere(R, 0, -0.22, -0.97);
    mesh(new THREE.CapsuleGeometry(0.035, 0.14, 4, 8), '#4a2c12', head, ms.x, ms.y, ms.z - 0.02, 0).rotation.z = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.06, 8, 6), '#f0a98a', head, 0, -0.04, -R - 0.01, 0);
  } else if (cast === 'alien') {
    // Un solo ojo enorme, dos antenas que se bambolean; pie en el suelo
    mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 18), '#94a3b8', torso, 0, 0.12, 0, 0).rotation.x = Math.PI / 2;
    face(head, R, rig, { cyclops: true, eyeY: 0.05 });
    for (const sx of [-1, 1]) {
      const ant = new THREE.Group();
      ant.position.set(sx * 0.12, R * 0.85, 0);
      head.add(ant);
      mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 6), '#166534', ant, 0, 0.15, 0, 0);
      mesh(new THREE.SphereGeometry(0.06, 10, 8), '#bef264', ant, 0, 0.32, 0, 0.015);
      ant.rotation.z = -sx * 0.35;
      ant.userData.base = -sx * 0.35;
      rig.wobbly.push(ant);
    }
  } else if (cast === 'enano') {
    // Bajito con casco de obra, barba naranja enorme y peto
    mesh(new THREE.BoxGeometry(0.34, 0.22, 0.04), s.pants, torso, 0, 0.3, -s.tr * 0.98, 0);
    const helmet = cap('#facc15', Math.PI / 2, 0.035);
    mesh(new THREE.CylinderGeometry(R + 0.08, R + 0.08, 0.03, 20), '#eab308', head, 0, 0.02, -0.03, 0.01);
    void helmet;
    const beard = mesh(new THREE.ConeGeometry(0.24, 0.5, 12), '#f97316', head, 0, -0.32, -0.13, 0.025);
    beard.rotation.x = Math.PI + 0.25;
    rig.wobbly.push(beard);
    face(head, R, rig, { eyeY: 0.18 });
    mesh(new THREE.SphereGeometry(0.07, 8, 6), '#f0a98a', head, 0, 0.0, -R - 0.02, 0);
  }
  const m = mouth(head, R, cast === 'enano' ? -0.1 : cast === 'gordo' ? -0.45 : -0.38);
  rig.smile = m.smile; rig.shout = m.shout;
  if (cast === 'enano') { rig.smile.visible = false; rig.shout.scale.multiplyScalar(0.8); }
  return rig;
}

/** Sombra de contacto blanda bajo los pies: asienta a los personajes en el suelo. */
let blobTex: THREE.Texture | null = null;
function blob() {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, 'rgba(20,15,40,0.55)'); g.addColorStop(1, 'rgba(20,15,40,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

const damp = THREE.MathUtils.damp;
const UP = new THREE.Vector3(0, 1, 0);

export class CarrierView {
  group = new THREE.Group();
  private rig: Rig;
  private arms: THREE.Mesh[] = [];
  private hands: THREE.Mesh[] = [];
  private stars: THREE.Group;
  private ring: THREE.Mesh;
  private shadow: THREE.Mesh;
  private grip: THREE.Mesh;
  private walk = 0;
  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private squash = 0;
  private squashV = 0;
  private stumbleT = 0;
  private wasStunned = false;
  private stunAge = 0;
  private getUp = 0;
  private prevVy = 0;
  private airT = 0;
  private stepSide = 0;
  private blinkAt: number;
  private sweatT = 0;
  private blinkEnd = 0;
  /** Velocidad suavizada: la cabeza reacciona a los cambios de velocidad, no a la velocidad. */
  private vS = new THREE.Vector3();
  /** Giro total de la pirueta de un atropello (siempre en el mismo sentido). */
  private spinTarget = 0;
  /** >0: el sofá tira de él (se echa atrás); <0: empuja (se echa hacia delante). */
  private along = 0;
  private stumbleDir = 1;
  label?: THREE.Sprite;

  constructor(readonly carrier: Carrier, playerIndex: number | null, private fx?: Fx) {
    this.rig = buildRig(carrier.cast.cast);
    this.group.add(this.rig.pivot);
    this.rig.pivot.position.y = -CENTER_Y;
    const nArms = this.rig.quadruped ? 1 : 2;
    for (let i = 0; i < nArms; i++) {
      // El perro no tiene brazos: muerde una cuerda atada al sofá
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(this.rig.quadruped ? 0.02 : this.rig.armR, this.rig.quadruped ? 0.02 : this.rig.armR, 1, 8), mat(this.rig.quadruped ? '#d6b98c' : this.rig.armColor));
      arm.castShadow = true;
      this.arms.push(arm);
      this.group.add(arm);
      if (!this.rig.quadruped) {
        const hand = new THREE.Mesh(new THREE.SphereGeometry(this.rig.armR * 1.6, 8, 6), mat(this.rig.handColor));
        this.hands.push(hand);
        this.group.add(hand);
      }
    }
    const color = playerIndex !== null ? PLAYER_COLORS[playerIndex] : '#ffffff';
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.52, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = playerIndex !== null;
    this.shadow = blob();
    this.grip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color }));
    this.grip.visible = false;
    if (playerIndex !== null) {
      this.label = textSprite(`J${playerIndex + 1}`, { size: 40, color: '#1f2937', bg: color, pad: 8 });
      this.label.scale.multiplyScalar(0.5);
    }
    // Estrellas de mareo
    this.stars = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), mat('#fde047', { emissive: '#b45309' }));
      const a = (i / 5) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.34, Math.sin(a * 2) * 0.04, Math.sin(a) * 0.34);
      this.stars.add(s);
    }
    this.stars.visible = false;
    this.group.add(this.stars);
    this.blinkAt = 1 + carrier.id * 0.7;
  }

  /** Objetos que viven en el mundo (no giran con el personaje). */
  worldObjects(): THREE.Object3D[] {
    return [this.shadow, this.ring, this.grip, ...(this.label ? [this.label] : [])];
  }

  /** Tirón que le arranca el asa de las manos: trastabilla hacia atrás. */
  stumble() { this.stumbleT = 0.75; this.stumbleDir = this.along >= 0 ? 1 : -1; }

  /** Libera geometrías y materiales propios (los materiales compartidos de la caché no). */
  dispose() {
    const own = new Set<THREE.Material>([this.ring.material as THREE.Material, this.grip.material as THREE.Material, this.shadow.material as THREE.Material]);
    if (this.label) { const m = this.label.material; m.map?.dispose(); own.add(m); }
    for (const root of [this.group, this.shadow, this.ring, this.grip]) root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const m of own) m.dispose();
  }

  sync(sofaGrab: THREE.Vector3 | null, t: number, dt: number) {
    const c = this.carrier, rig = this.rig;
    const p = c.pos;
    const v = c.body.linvel();
    const speed = Math.hypot(v.x, v.z);
    const sp = Math.min(1, speed / 3);
    this.group.position.set(p.x, p.y, p.z);
    dt = Math.min(dt, 0.1);

    // Orientación: hacia el agarre o hacia donde camina (el modelo mira hacia -z local)
    const target = Math.atan2(-c.facing.x, -c.facing.z);
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 12);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // Tensión del agarre: 0 = cómodo, 1 = a punto de soltarse
    // y su dirección: a lo largo de la mirada (tirón o empuje) y de lado
    let strain = 0, sideOff = 0;
    const hw = c.handWorld();
    if (sofaGrab) {
      const ox = sofaGrab.x - hw.x, oy = sofaGrab.y - hw.y, oz = sofaGrab.z - hw.z;
      strain = THREE.MathUtils.clamp(Math.hypot(ox, oy, oz) / CARRIER.gripBreak, 0, 1);
      this.along = (ox * fwd.x + oz * fwd.z) / CARRIER.gripBreak;
      sideOff = THREE.MathUtils.clamp((ox * right.x + oz * right.z) / CARRIER.gripBreak, -1, 1);
    }
    const stunned = c.stunned > 0;
    if (stunned && !this.wasStunned) {
      // Atropello: pirueta en un solo sentido y cae de espaldas en la dirección en la que sale despedido
      this.stunAge = 0;
      let dy = speed > 2 ? Math.atan2(v.x, v.z) - this.yaw : 0;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      // Por equilibrio no hay pirueta: se va al suelo hacia donde se caía
      this.spinTarget = c.knock === 'balance' ? 0 : dy + Math.PI * 2 * (dy >= 0 ? 1 : -1);
    }
    if (!stunned && this.wasStunned) {
      // Se levanta de un salto; el cuerpo vuelve a mirar al frente girando, sin saltos de orientación
      this.getUp = 1; this.squashV += 4.5;
      this.yaw += this.spinTarget;
      this.spinTarget = 0;
    }
    this.wasStunned = stunned;
    this.stunAge += dt;
    this.stumbleT = Math.max(0, this.stumbleT - dt);
    this.getUp = Math.max(0, this.getUp - dt * 2.2);

    // En el aire y aterrizaje
    const vy = v.y;
    if (!c.grounded) this.airT += dt; else {
      if (this.airT > 0.12 && this.prevVy < -2.5) {
        this.squashV -= Math.min(6, -this.prevVy * 1.2);
        this.fx?.dust({ x: p.x, y: p.y - CENTER_Y + 0.25, z: p.z }, 4, 0.5);
      }
      this.airT = 0;
    }
    this.prevVy = vy;
    const airborne = this.airT > 0.15;

    // Ciclo de paso. Si quiere andar y no avanza (empuja contra algo), patalea en el sitio
    const want = Math.hypot(c.wantVel.x, c.wantVel.z);
    const scrabble = c.grounded && !stunned && want > 1 && speed < 0.6;
    const prevWalk = this.walk;
    this.walk += (scrabble ? want * 2.2 : speed) * dt * (rig.quadruped ? 5 : 3.6);
    // De lado: los que agarran por los costados avanzan en paso lateral
    const vSide = speed > 0.3 ? (v.x * right.x + v.z * right.z) / speed : 0;
    const side = Math.abs(vSide);
    if (c.grounded && (speed > 3.2 || scrabble) && Math.floor(prevWalk / Math.PI) !== Math.floor(this.walk / Math.PI)) {
      this.stepSide ^= 1;
      if (this.stepSide) this.fx?.puff({ x: p.x - fwd.x * 0.2, y: p.y - CENTER_Y + 0.08, z: p.z - fwd.z * 0.2 });
    }

    // Inclinación del cuerpo: hacia delante al andar, hacia atrás al tirar del sofá, tumbado si está mareado
    let wantPitch = -0.12 * sp, wantRoll = Math.sin(this.walk) * 0.06 * sp;
    if (sofaGrab) {
      // Si el sofá tira de él, se echa atrás; si empuja, se inclina hacia él (poco: la cabeza no debe meterse en el sofá).
      // Un tirón de lado le hace ladearse en contra.
      wantPitch = this.along >= 0 ? 0.08 + strain * 0.42 - 0.05 * sp : -Math.min(0.15, 0.3 * strain);
      wantRoll += sideOff * 0.35;
      if (strain > 0.55) wantRoll += Math.sin(t * 26 + c.id) * 0.1 * strain;
    }
    wantRoll += side * Math.sin(this.walk) * 0.08 * sp;
    if (scrabble) wantPitch -= 0.12;
    if (this.stumbleT > 0) {
      const k = this.stumbleT / 0.75;
      wantPitch = 0.55 * this.stumbleDir * Math.sin(k * Math.PI);
      wantRoll = Math.sin(t * 18) * 0.25 * k;
    }
    if (c.wobbling && !stunned) {
      // Trastabilla: el cuerpo se va hacia donde lo lleva el desequilibrio (exagerado), con temblor
      const lf = c.lean.x * fwd.x + c.lean.z * fwd.z, lr = c.lean.x * right.x + c.lean.z * right.z;
      wantPitch = THREE.MathUtils.clamp(-lf * 1.4, -0.7, 0.7) + Math.sin(t * 17) * 0.05;
      wantRoll = THREE.MathUtils.clamp(-lr * 1.4, -0.7, 0.7) + Math.sin(t * 13) * 0.08;
    }
    if (airborne) { wantPitch = -0.25; wantRoll = Math.sin(t * 14) * 0.15; }
    let spin = 0;
    if (stunned) {
      // Pirueta al salir despedido; la caída la da el collider tumbado (ver abajo), no una pose inventada
      spin = this.spinTarget * THREE.MathUtils.smoothstep(this.stunAge, 0, 0.5);
      wantPitch = 0;
      wantRoll = 0;
    }
    // Al levantarse, salta de golpe (más rápido que al caer)
    this.pitch = damp(this.pitch, wantPitch, this.getUp > 0 ? 16 : 10, dt);
    this.roll = damp(this.roll, wantRoll, 10, dt);
    // Muelle de aplastamiento (aterrizajes y levantarse)
    this.squashV += (-this.squash * 120 - this.squashV * 9) * dt;
    this.squash += this.squashV * dt;
    const sq = THREE.MathUtils.clamp(this.squash, -0.35, 0.35);
    if (c.down) {
      // En el suelo, el cuerpo va con la pose del collider tumbado: los pies en el extremo de abajo de su eje
      const q = c.collider.rotation(), k = c.collider.translation();
      const qt = new THREE.Quaternion(q.x, q.y, q.z, q.w);
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(qt);
      this.group.position.set(k.x, k.y + CENTER_Y, k.z).addScaledVector(axis, -CENTER_Y);
      rig.pivot.quaternion.copy(qt).multiply(new THREE.Quaternion().setFromAxisAngle(UP, this.yaw + spin));
      this.pitch = 0;
      this.roll = 0;
    } else rig.pivot.rotation.set(this.pitch, this.yaw + spin, this.roll, 'YXZ');
    const bob = c.grounded && !stunned ? Math.abs(Math.sin(this.walk)) * 0.07 * sp : 0;
    const breathe = Math.sin(t * 2.2 + c.id) * 0.015;
    rig.body.position.y = bob + (airborne ? 0.1 : 0);
    rig.body.scale.set(1 - sq * 0.5, 1 + sq + breathe, 1 - sq * 0.5);

    // Piernas
    const legAmp = (rig.quadruped ? 0.7 : 0.75) * (scrabble ? 0.5 : sp);
    rig.legs.forEach((l, i) => {
      let a: number, z = 0;
      const ph = this.walk + i * Math.PI;
      if (stunned) a = Math.sin(t * 20 + i * 2) * 0.6 * (this.stunAge > 0.5 ? 1 : 0);
      else if (airborne) a = Math.sin(t * 16 + i * Math.PI) * 0.5;
      else if (rig.quadruped) a = Math.sin(this.walk + (i === 0 || i === 3 ? 0 : Math.PI)) * legAmp;
      else if (sofaGrab && strain > 0.3 && speed < 0.8 && !scrabble) a = (i ? -1 : 1) * 0.35 * strain - 0.25 * strain; // pies clavados, abiertos
      else {
        // Paso hacia delante o lateral según hacia dónde se mueve respecto a donde mira
        a = Math.sin(ph) * legAmp * (1 - side);
        z = side * Math.sin(ph) * 0.35 * sp * Math.sign(vSide);
      }
      if (sofaGrab && !rig.quadruped) z += (i ? -1 : 1) * -0.12 * strain;
      l.rotation.x = damp(l.rotation.x, a, 18, dt);
      l.rotation.z = damp(l.rotation.z, z, 14, dt);
    });

    // Cabeza con retraso (se bambolea con los cambios de velocidad), adornos que se agitan
    this.vS.x = damp(this.vS.x, v.x, 5, dt);
    this.vS.z = damp(this.vS.z, v.z, 5, dt);
    const lx = (this.vS.x - v.x) * 0.06, lz = (this.vS.z - v.z) * 0.06;
    const lagLocalX = THREE.MathUtils.clamp(lx * right.x + lz * right.z, -0.15, 0.15);
    const lagLocalZ = THREE.MathUtils.clamp(lx * fwd.x + lz * fwd.z, -0.15, 0.15);
    // Mira a cámara cuando sufre (tirón fuerte, traspié, en el aire): así se le ve la cara
    const lookCam = stunned ? 0 : strain > 0.6 || this.stumbleT > 0 || c.wobbling || airborne ? 1 : sofaGrab ? 0.35 : 0.25;
    let toCam = Math.PI - (this.yaw + spin);
    toCam = THREE.MathUtils.clamp(Math.atan2(Math.sin(toCam), Math.cos(toCam)), -1.1, 1.1) * lookCam;
    const headYaw = damp(rig.head.rotation.y, toCam + Math.sin(t * 0.7 + c.id * 2) * 0.15 * (1 - sp), 8, dt);
    rig.head.rotation.set(-lagLocalZ * 2 + 0.2 * lookCam, headYaw, lagLocalX * -2 + (stunned ? Math.sin(t * 9) * 0.3 : 0));
    for (const w of rig.wobbly) {
      const base = (w.userData.base as number) ?? 0;
      w.rotation.z = base + Math.sin(t * 9 + c.id) * (0.08 + 0.25 * sp) + lagLocalX * 4;
      w.rotation.x = Math.sin(t * 7 + c.id * 3) * 0.1 * sp - lagLocalZ * 3;
    }
    if (rig.tail) { rig.tail.rotation.y = Math.sin(t * (sofaGrab ? 22 : 12)) * 0.6; rig.tail.rotation.x = sofaGrab ? -0.4 : 0; }

    // Sudor cuando tira con fuerza
    this.sweatT -= dt;
    if (sofaGrab && strain > 0.6 && this.sweatT <= 0 && this.fx) {
      this.sweatT = 0.6;
      this.group.updateMatrixWorld(true);
      const hp = rig.head.localToWorld(new THREE.Vector3(0, rig.headR, 0));
      this.fx.sweat(hp);
    }
    // Cara: cejas, boca, pupilas y parpadeo
    const effort = sofaGrab ? strain : 0;
    const scared = stunned || airborne || this.stumbleT > 0 || c.wobbling;
    for (const b of rig.brows) b.rotation.z = (b.userData.side as number) * (scared ? -0.35 : effort * 0.5);
    rig.smile.visible = !scared && effort < 0.45 && c.cast.cast !== 'enano';
    rig.shout.visible = !rig.smile.visible;
    rig.shout.scale.y = 1.25 * (scared ? 1.4 : 0.6 + effort);
    if (t > this.blinkAt) { this.blinkEnd = t + 0.12; this.blinkAt = t + 2.2 + ((c.id * 1.37 + t) % 2); }
    const blink = t < this.blinkEnd ? 0.12 : 1;
    rig.eyes.forEach((e) => (e.scale.y = blink));
    rig.pupils.forEach((pu, i) => {
      if (stunned) pu.position.set(Math.cos(t * 12 + i * Math.PI) * 0.025, Math.sin(t * 12 + i * Math.PI) * 0.025, pu.position.z);
      else pu.position.set(THREE.MathUtils.clamp(lagLocalX * -0.8, -0.02, 0.02), 0, pu.position.z);
    });

    // Brazos (o cuerda del perro): hacia el agarre, colgando, agitándose o tirados en el suelo
    this.group.updateMatrixWorld(true);
    const toLocal = (o: THREE.Object3D, v3: THREE.Vector3) => this.group.worldToLocal(o.localToWorld(v3.clone()));
    if (rig.quadruped) {
      const arm = this.arms[0];
      arm.visible = !!sofaGrab;
      if (sofaGrab) {
        const a = toLocal(rig.head, rig.snout!);
        this.stretch(arm, a, sofaGrab.clone().sub(this.group.position));
      }
    } else {
      for (let i = 0; i < 2; i++) {
        const s = i === 0 ? -1 : 1;
        const shoulder = toLocal(rig.torso, rig.shoulders[i]);
        let hand: THREE.Vector3;
        if (sofaGrab) {
          // La mano se apoya en la superficie (no se hunde en el sofá)
          hand = sofaGrab.clone().sub(this.group.position).addScaledVector(fwd, -this.rig.armR * 1.4).addScaledVector(right, s * 0.13);
        } else if (stunned || airborne || this.stumbleT > 0 || c.wobbling) {
          // Molinillo de brazos
          const a = t * 14 + i * Math.PI;
          hand = toLocal(rig.torso, rig.shoulders[i].clone().add(new THREE.Vector3(s * 0.3, 0.28 + Math.sin(a) * 0.15, Math.cos(a) * 0.2)));
        } else {
          const swing = Math.sin(this.walk + i * Math.PI) * sp * 0.28;
          hand = toLocal(rig.torso, rig.shoulders[i].clone().add(new THREE.Vector3(s * 0.08, -0.36, -swing)));
        }
        this.stretch(this.arms[i], shoulder, hand);
        this.hands[i].position.copy(hand);
      }
    }

    // Sombra, anillo de jugador, punto de agarre, etiqueta y estrellas
    const footY = p.y - CENTER_Y;
    // Bajo el cuerpo, de pie o tumbado
    const under = c.down ? c.collider.translation() : p;
    this.shadow.position.set(under.x, footY + 0.03 - Math.min(0.5, this.airT), under.z);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = airborne ? 0.4 : 1;
    this.shadow.scale.setScalar(rig.quadruped ? 1.1 : 1);
    this.ring.position.set(under.x, footY + 0.04, under.z);
    this.grip.visible = !!sofaGrab;
    if (sofaGrab) this.grip.position.copy(sofaGrab);
    if (this.label) this.label.position.set(p.x, p.y + 1.2, p.z);
    this.stars.visible = stunned;
    if (stunned) {
      const hp = toLocal(rig.head, new THREE.Vector3(0, rig.headR + 0.1, 0));
      this.stars.position.copy(hp);
      this.stars.rotation.y = t * 5;
    }
  }

  /** Coloca un cilindro de longitud 1 entre dos puntos (coordenadas del grupo). */
  private stretch(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
    const dir = b.clone().sub(a);
    const len = Math.max(0.05, dir.length());
    m.position.copy(a).add(dir.multiplyScalar(0.5));
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
  }
}
