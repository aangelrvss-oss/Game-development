import * as THREE from 'three';
import { CENTER_Y, type Carrier } from '../sim/carrier';
import { mat, outline } from './materials';
import { textSprite } from './text';

export const PLAYER_COLORS = ['#facc15', '#22d3ee', '#f472b6', '#a3e635'];
const SKIN = '#f5c9a6';

/** Cuerpo de cada personaje con primitivas. El origen es el centro de la cápsula de física. */
function buildBody(cast: Carrier['cast']['cast'], color: string): { root: THREE.Group; head: THREE.Object3D; shoulderY: number; stars: THREE.Group } {
  const root = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, c: string, x = 0, y = 0, z = 0, line = true) => {
    const m = new THREE.Mesh(geo, mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    root.add(m);
    if (line) root.add(outline(m, 0.035));
    return m;
  };
  const bottom = -CENTER_Y;
  let head: THREE.Object3D;
  let shoulderY = 0.12;
  const eyes = (y: number, z: number, spread = 0.09, r = 0.045) => {
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(r, 8, 6), '#1f2937', s * spread, y, z, false);
  };
  if (cast === 'perro') {
    // Salchicha: cuerpo largo horizontal
    const b = add(new THREE.CapsuleGeometry(0.22, 0.75, 6, 12), '#a16207', 0, bottom + 0.42, 0);
    b.rotation.x = Math.PI / 2;
    head = add(new THREE.SphereGeometry(0.22, 14, 10), '#a16207', 0, bottom + 0.6, -0.55);
    add(new THREE.SphereGeometry(0.1, 8, 6), '#3f2a0d', 0, bottom + 0.55, -0.76, false);
    for (const s of [-1, 1]) {
      const ear = add(new THREE.CapsuleGeometry(0.06, 0.18, 4, 8), '#713f12', s * 0.2, bottom + 0.55, -0.5, false);
      ear.rotation.z = s * 0.4;
      for (const z of [-0.35, 0.35]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), '#713f12', s * 0.13, bottom + 0.12, z, false);
    }
    add(new THREE.TorusGeometry(0.17, 0.04, 6, 12), '#ef4444', 0, bottom + 0.55, -0.38, false).rotation.x = Math.PI / 2.4;
    eyes(bottom + 0.68, -0.72, 0.08);
    shoulderY = bottom + 0.55;
  } else {
    const wide = cast === 'gordo' ? 1.4 : 1;
    const short = cast === 'enano' ? 0.75 : 1;
    const bodyColor = { mono: '#8b5cf6', rulos: '#ec4899', gordo: '#f8fafc', alien: '#22c55e', enano: '#2563eb' }[cast];
    const torso = add(new THREE.CapsuleGeometry(0.28, 0.42 * short, 6, 14), bodyColor, 0, bottom + 0.55 * short, 0);
    torso.scale.set(wide, 1, wide * 0.95);
    if (cast === 'gordo') add(new THREE.CylinderGeometry(0.4, 0.42, 0.22, 16), '#2563eb', 0, bottom + 0.3, 0, false);
    const headY = bottom + 1.08 * short + (cast === 'alien' ? 0.05 : 0);
    head = add(new THREE.SphereGeometry(cast === 'alien' ? 0.26 : 0.23, 16, 12), cast === 'alien' ? '#4ade80' : SKIN, 0, headY, 0);
    shoulderY = bottom + 0.82 * short;
    if (cast === 'alien') {
      add(new THREE.SphereGeometry(0.12, 12, 10), '#ffffff', 0, headY + 0.03, -0.19, false);
      add(new THREE.SphereGeometry(0.06, 8, 6), '#111827', 0, headY + 0.03, -0.29, false);
      for (const s of [-1, 1]) {
        const ant = add(new THREE.CylinderGeometry(0.015, 0.015, 0.28, 6), '#166534', s * 0.1, headY + 0.34, 0, false);
        ant.rotation.z = -s * 0.3;
        add(new THREE.SphereGeometry(0.05, 8, 6), '#bef264', s * 0.15, headY + 0.48, 0, false);
      }
    } else {
      eyes(headY + 0.03, -0.2);
    }
    if (cast === 'mono') {
      add(new THREE.SphereGeometry(0.24, 14, 10), '#f8fafc', 0, headY + 0.3, 0.04);
      for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.06, 0.012, 6, 12), '#111827', s * 0.09, headY + 0.03, -0.22, false);
    }
    if (cast === 'rulos') {
      add(new THREE.SphereGeometry(0.235, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#f9a8d4', 0, headY + 0.02, 0.01, false);
      for (const x of [-0.12, 0, 0.12]) {
        const r = add(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8), '#60a5fa', x, headY + 0.2, 0.02, false);
        r.rotation.z = Math.PI / 2;
      }
    }
    if (cast === 'gordo') add(new THREE.SphereGeometry(0.235, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), '#78350f', 0, headY + 0.03, 0.02, false);
    if (cast === 'enano') {
      const beard = add(new THREE.ConeGeometry(0.2, 0.5, 10), '#f97316', 0, headY - 0.25, -0.12);
      beard.rotation.x = Math.PI;
      add(new THREE.SphereGeometry(0.25, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#facc15', 0, headY + 0.05, 0, false);
    }
  }
  // Estrellas de mareo
  const stars = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), mat('#fde047', { emissive: '#b45309' }));
    const a = (i / 4) * Math.PI * 2;
    s.position.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
    stars.add(s);
  }
  stars.position.y = (head as THREE.Mesh).position.y + 0.4;
  stars.visible = false;
  root.add(stars);
  void color;
  return { root, head, shoulderY, stars };
}

export class CarrierView {
  group = new THREE.Group();
  private body: THREE.Group;
  private arms: THREE.Mesh[] = [];
  private stars: THREE.Group;
  private shoulderY: number;
  private ring: THREE.Mesh;
  private grip: THREE.Mesh;
  private walk = 0;
  private yaw = 0;
  label?: THREE.Sprite;

  constructor(readonly carrier: Carrier, playerIndex: number | null) {
    const b = buildBody(carrier.cast.cast, carrier.cast.color);
    this.body = b.root;
    this.stars = b.stars;
    this.shoulderY = b.shoulderY;
    this.group.add(this.body);
    const armColor = carrier.cast.cast === 'alien' ? '#4ade80' : carrier.cast.cast === 'perro' ? '#a16207' : SKIN;
    for (let i = 0; i < 2; i++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), mat(armColor));
      arm.castShadow = true;
      this.arms.push(arm);
      this.group.add(arm);
    }
    const color = playerIndex !== null ? PLAYER_COLORS[playerIndex] : '#e5e7eb';
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.36, playerIndex !== null ? 0.5 : 0.42, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: playerIndex !== null ? 0.95 : 0.5, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.grip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color }));
    this.grip.visible = false;
    if (playerIndex !== null) {
      this.label = textSprite(`J${playerIndex + 1}`, { size: 40, color: '#1f2937', bg: color, pad: 8 });
      this.label.scale.multiplyScalar(0.55);
    }
  }

  /** Objetos que viven en el mundo (no giran con el personaje). */
  worldObjects(): THREE.Object3D[] {
    return [this.ring, this.grip, ...(this.label ? [this.label] : [])];
  }

  sync(sofaGrab: THREE.Vector3 | null, t: number, dt: number) {
    const c = this.carrier;
    const p = c.pos;
    const v = c.body.linvel();
    const speed = Math.hypot(v.x, v.z);
    this.group.position.set(p.x, p.y, p.z);
    // Orientación: hacia el agarre o hacia donde camina (el modelo mira hacia -z local)
    const fx = c.facing.x, fz = c.facing.z;
    const target = Math.atan2(-fx, -fz);
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 12);
    this.walk += speed * dt * 3.2;
    const bob = Math.abs(Math.sin(this.walk)) * Math.min(1, speed / 2) * 0.08;
    this.body.rotation.set(0, this.yaw, Math.sin(this.walk) * Math.min(1, speed / 3) * 0.12);
    this.body.position.y = bob;
    if (c.stunned > 0) {
      this.body.rotation.z = Math.sin(t * 9) * 0.35;
      this.body.rotation.x = 0.4;
      this.stars.visible = true;
      this.stars.rotation.y = t * 5;
    } else {
      this.stars.visible = false;
    }
    // Brazos: hacia el punto agarrado, o colgando y balanceándose
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      const shoulder = new THREE.Vector3().copy(right).multiplyScalar(s * 0.27).add(new THREE.Vector3(0, this.shoulderY + bob, 0));
      let hand: THREE.Vector3;
      if (sofaGrab) {
        hand = sofaGrab.clone().sub(this.group.position).add(right.clone().multiplyScalar(s * 0.12));
      } else {
        const swing = Math.sin(this.walk + i * Math.PI) * Math.min(1, speed / 3) * 0.25;
        hand = shoulder.clone().add(new THREE.Vector3(0, -0.42, 0)).add(fwd.clone().multiplyScalar(swing + 0.05)).add(right.clone().multiplyScalar(s * 0.05));
        if (c.stunned > 0) hand.y += 0.6;
      }
      const dir = hand.clone().sub(shoulder);
      const len = Math.max(0.05, dir.length());
      const arm = this.arms[i];
      arm.position.copy(shoulder).add(dir.clone().multiplyScalar(0.5));
      arm.scale.set(1, len, 1);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    }
    // Anillo en el suelo y punto de agarre
    this.ring.position.set(p.x, p.y - CENTER_Y + 0.04, p.z);
    this.grip.visible = !!sofaGrab;
    if (sofaGrab) this.grip.position.copy(sofaGrab);
    if (this.label) this.label.position.set(p.x, p.y + 1.25, p.z);
  }
}
