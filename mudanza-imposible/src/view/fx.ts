import * as THREE from 'three';
import { textSprite } from './text';

interface Particle { mesh: THREE.Object3D; vel: THREE.Vector3; life: number; max: number; spin?: number; grow?: number; gravity?: number; flat?: boolean; fade?: number }

const CONFETTI = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#f472b6', '#ffffff'];

/** Efectos breves: polvo, ondas de choque, chispas, confeti, sudor y textos flotantes. */
export class Fx {
  group = new THREE.Group();
  private parts: Particle[] = [];
  private dustGeo = new THREE.IcosahedronGeometry(0.18, 0);
  private dustMat = new THREE.MeshBasicMaterial({ color: '#f5efe3', transparent: true, opacity: 0.85, depthWrite: false });
  private ringGeo = new THREE.RingGeometry(0.85, 1, 40);
  private confGeo = new THREE.PlaneGeometry(0.12, 0.2);
  private dropGeo = new THREE.SphereGeometry(0.05, 6, 5);
  private starGeo = new THREE.OctahedronGeometry(0.1);
  shake = 0;

  dust(p: { x: number; y: number; z: number }, n = 6, strength = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.dustGeo, this.dustMat.clone());
      m.position.set(p.x + (Math.random() - 0.5) * 0.8, Math.max(0.1, p.y - 0.2), p.z + (Math.random() - 0.5) * 0.8);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      const a = Math.random() * Math.PI * 2;
      const vel = new THREE.Vector3(Math.cos(a), 0.4 + Math.random() * 0.8, Math.sin(a)).multiplyScalar(1.6 * strength);
      this.add({ mesh: m, vel, life: 0, max: 0.55 + Math.random() * 0.35, grow: 1.8, gravity: -0.5 });
    }
  }

  /** Nubecilla de un paso a la carrera. */
  puff(p: { x: number; y: number; z: number }) {
    const m = new THREE.Mesh(this.dustGeo, this.dustMat.clone());
    (m.material as THREE.MeshBasicMaterial).opacity = 0.45;
    m.scale.setScalar(0.4);
    m.position.set(p.x, p.y, p.z);
    this.add({ mesh: m, vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4), life: 0, max: 0.4, grow: 1.2, gravity: 0 });
  }

  /** Onda en el suelo: golpes y caídas. */
  ring(p: { x: number; y: number; z: number }, color = '#ffffff', size = 1.5) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, Math.max(0.05, p.y), p.z);
    m.scale.setScalar(0.4);
    this.add({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 0.45, grow: size * 2.5, gravity: 0, flat: true });
  }

  stars(p: { x: number; y: number; z: number }, n = 6) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.starGeo, new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true }));
      m.position.set(p.x, p.y + 0.4, p.z);
      const a = (i / n) * Math.PI * 2;
      this.add({ mesh: m, vel: new THREE.Vector3(Math.cos(a) * 2.5, 2.5 + Math.random() * 1.5, Math.sin(a) * 2.5), life: 0, max: 0.7, spin: 8, gravity: 9 });
    }
  }

  confetti(p: { x: number; y: number; z: number }, n = 60) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.confGeo, new THREE.MeshBasicMaterial({ color: CONFETTI[i % CONFETTI.length], transparent: true, side: THREE.DoubleSide }));
      m.position.set(p.x + (Math.random() - 0.5) * 1.5, p.y + 0.5, p.z + (Math.random() - 0.5) * 1.5);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 3;
      this.add({ mesh: m, vel: new THREE.Vector3(Math.cos(a) * r, 5 + Math.random() * 4, Math.sin(a) * r), life: 0, max: 2.2 + Math.random(), spin: 6, gravity: 7, fade: 0.8 });
    }
  }

  /** Gotas de sudor que saltan de la cabeza al hacer fuerza. */
  sweat(p: { x: number; y: number; z: number }) {
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(this.dropGeo, new THREE.MeshBasicMaterial({ color: '#7dd3fc', transparent: true }));
      m.scale.set(1, 1.5, 1);
      m.position.set(p.x, p.y, p.z);
      const a = Math.random() * Math.PI * 2;
      this.add({ mesh: m, vel: new THREE.Vector3(Math.cos(a) * 1.2, 2 + Math.random(), Math.sin(a) * 1.2), life: 0, max: 0.55, gravity: 9 });
    }
  }

  /** Texto flotante; con `bg` va sobre una placa de color (se lee bien sobre cualquier fondo). */
  text(p: { x: number; y: number; z: number }, s: string, color = '#ffffff', size = 46, bg?: string, lift = 1.3) {
    const sp = textSprite(s, { size, color, bg, pad: bg ? 12 : 10 });
    sp.scale.multiplyScalar(0.7);
    sp.position.set(p.x, p.y + lift, p.z);
    sp.userData.base = sp.scale.clone();
    this.add({ mesh: sp, vel: new THREE.Vector3(0, 1.1, 0), life: 0, max: 1.3, gravity: 0, fade: 0.6 });
  }

  private add(p: Particle) { this.parts.push(p); this.group.add(p.mesh); }

  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) { this.group.remove(p.mesh); this.parts.splice(i, 1); disposeObj(p.mesh); continue; }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= (p.gravity ?? 1.5) * dt;
      p.vel.multiplyScalar(1 - dt * (p.spin ? 0.8 : 1.5));
      if (p.spin) { p.mesh.rotation.y += p.spin * dt; p.mesh.rotation.x += p.spin * 0.7 * dt; }
      if (p.grow) p.mesh.scale.setScalar((p.flat ? 0.4 : 1) * (1 + k * p.grow));
      // Los textos aparecen con un pequeño rebote
      const base = p.mesh.userData.base as THREE.Vector3 | undefined;
      if (base) p.mesh.scale.copy(base).multiplyScalar(k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 1.5));
      const m = (p.mesh as THREE.Mesh).material as THREE.Material & { opacity: number };
      const f = p.fade ?? 0;
      if (m && 'opacity' in m) m.opacity = k < f ? 1 : 1 - (k - f) / (1 - f);
    }
  }

  clear() {
    for (const p of this.parts) { this.group.remove(p.mesh); disposeObj(p.mesh); }
    this.parts = [];
    this.shake = 0;
  }
}

function disposeObj(o: THREE.Object3D) {
  const m = o as THREE.Mesh;
  const mat = m.material as THREE.Material & { map?: THREE.Texture };
  if (mat?.map) mat.map.dispose();
  // Las geometrías son compartidas entre partículas: no se liberan aquí
  mat?.dispose?.();
}
