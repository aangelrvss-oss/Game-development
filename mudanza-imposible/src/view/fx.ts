import * as THREE from 'three';
import { textSprite } from './text';

interface Particle { mesh: THREE.Object3D; vel: THREE.Vector3; life: number; max: number; spin?: number; grow?: number }

/** Efectos breves: nubes de polvo, chispas y textos flotantes. Pocas partículas para no tapar la acción. */
export class Fx {
  group = new THREE.Group();
  private parts: Particle[] = [];
  private dustGeo = new THREE.IcosahedronGeometry(0.18, 0);
  private dustMat = new THREE.MeshBasicMaterial({ color: '#f5efe3', transparent: true, opacity: 0.85 });
  shake = 0;

  dust(p: { x: number; y: number; z: number }, n = 6, strength = 1) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.dustGeo, this.dustMat.clone());
      m.position.set(p.x + (Math.random() - 0.5) * 0.8, Math.max(0.1, p.y - 0.2), p.z + (Math.random() - 0.5) * 0.8);
      const a = Math.random() * Math.PI * 2;
      const vel = new THREE.Vector3(Math.cos(a), 0.6 + Math.random(), Math.sin(a)).multiplyScalar(1.4 * strength);
      this.add({ mesh: m, vel, life: 0, max: 0.6 + Math.random() * 0.3, grow: 1.6 });
    }
  }

  stars(p: { x: number; y: number; z: number }, n = 6) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true }));
      m.position.set(p.x, p.y + 0.4, p.z);
      const a = (i / n) * Math.PI * 2;
      this.add({ mesh: m, vel: new THREE.Vector3(Math.cos(a) * 2.5, 2.5 + Math.random() * 1.5, Math.sin(a) * 2.5), life: 0, max: 0.7, spin: 8 });
    }
  }

  text(p: { x: number; y: number; z: number }, s: string, color = '#ffffff', size = 46) {
    const sp = textSprite(s, { size, color });
    sp.scale.multiplyScalar(0.8);
    sp.position.set(p.x, p.y + 1.2, p.z);
    this.add({ mesh: sp, vel: new THREE.Vector3(0, 1.2, 0), life: 0, max: 1.2 });
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
      p.vel.y -= (p.spin ? 9 : 1.5) * dt;
      p.vel.multiplyScalar(1 - dt * 1.5);
      if (p.spin) p.mesh.rotation.y += p.spin * dt;
      if (p.grow) p.mesh.scale.setScalar(1 + k * p.grow);
      const m = (p.mesh as THREE.Mesh).material as THREE.Material & { opacity: number };
      if (m && 'opacity' in m) m.opacity = 1 - k;
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
  mat?.dispose?.();
  if (o instanceof THREE.Sprite) return;
}
