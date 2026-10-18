import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import { SOFA, SLOTS } from '../sim/sofa';
import { mat } from './materials';

const CREAM = '#f3e3c3';
const CUSHION = '#f8ecd2';

export class SofaView {
  group = new THREE.Group();
  private patches: THREE.Mesh[] = [];
  private warn: THREE.Mesh;
  constructor() {
    const { half, back, arm } = SOFA;
    const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat(color));
      m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    add(new RoundedBoxGeometry(half.x * 2, half.y * 2, half.z * 2, 3, 0.08), CREAM, 0, 0, 0);
    add(new RoundedBoxGeometry(back.h.x * 2, back.h.y * 2, back.h.z * 2 + 0.06, 3, 0.08), CREAM, back.p.x, back.p.y, back.p.z);
    for (const s of [-1, 1]) add(new RoundedBoxGeometry(arm.h.x * 2 + 0.04, arm.h.y * 2 + 0.06, arm.h.z * 2, 3, 0.09), CREAM, s * (half.x - arm.h.x), arm.y + 0.03, 0);
    // Tres cojines de asiento y tres de respaldo
    for (let i = -1; i <= 1; i++) {
      add(new RoundedBoxGeometry(0.6, 0.16, 0.62, 3, 0.07), CUSHION, i * 0.63, half.y + 0.07, 0.07);
      add(new RoundedBoxGeometry(0.6, 0.36, 0.14, 3, 0.06), CUSHION, i * 0.63, back.p.y + 0.02, back.p.z + 0.13);
    }
    // Patas de madera
    for (const x of [-0.95, 0.95]) for (const z of [-0.35, 0.35]) add(new THREE.CylinderGeometry(0.04, 0.03, 0.14, 8), '#7c3f1d', x, -half.y - 0.04, z);
    // Asas: rojas en el lado del respaldo (local -z), azules en el lado del asiento (+z); amarillas en los extremos
    for (const s of SLOTS) {
      const color = s.side === 'red' ? '#ef4444' : s.side === 'blue' ? '#3b82f6' : '#facc15';
      const geo = s.side === 'end' ? new THREE.BoxGeometry(0.06, 0.12, 0.42) : new THREE.BoxGeometry(0.4, 0.12, 0.06);
      add(geo, color, s.p.x + s.out.x * 0.03, s.p.y, s.p.z + s.out.z * 0.03);
    }
    // Parches de cinta que aparecen al dañarse
    const tape = mat('#c0c4cc', { rough: 0.4 });
    for (const [x, z, r] of [[0.5, 0.2, 0.4], [-0.6, -0.1, -0.6], [0.0, 0.3, 1.1], [-0.2, -0.25, 0.2]] as const) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.1), tape);
      p.position.set(x, half.y + 0.16, z);
      p.rotation.y = r;
      p.visible = false;
      this.group.add(p);
      this.patches.push(p);
    }
    // Aviso de vuelco: aro rojo bajo el sofá
    this.warn = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0 }));
    this.warn.rotation.x = Math.PI / 2;
  }

  /** Aro de aviso, en el mundo (no gira con el sofá). */
  get warning() { return this.warn; }

  sync(body: RAPIER.RigidBody, integrity: number, up: number, t: number) {
    const p = body.translation(), q = body.rotation();
    this.group.position.set(p.x, p.y, p.z);
    this.group.quaternion.set(q.x, q.y, q.z, q.w);
    const broken = Math.floor((100 - integrity) / 22);
    this.patches.forEach((m, i) => (m.visible = i < broken));
    const danger = up < 0.8 ? Math.min(1, (0.8 - up) / 0.4) : 0;
    (this.warn.material as THREE.MeshBasicMaterial).opacity = danger * (0.5 + 0.5 * Math.sin(t * 14));
    this.warn.position.set(p.x, Math.max(0.05, p.y - 0.6), p.z);
  }
}
