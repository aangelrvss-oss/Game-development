import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CAR, type Car } from '../sim/traffic';
import { mat, ownMat, PALETTE } from './materials';

const inkMat = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });

/** Utilitario de juguete: carrocería redondeada, cabina con cristales y parachoques. */
export class CarView {
  group = new THREE.Group();
  private body = new THREE.Group();
  private brake: THREE.MeshStandardMaterial;
  private wheels: THREE.Mesh[] = [];
  private prevSpeed = 0;
  private pitch = 0;
  constructor(readonly car: Car) {
    const d = car.dir;
    this.group.add(this.body);
    const add = (m: THREE.Mesh, x: number, y: number, z: number, ink = 0) => {
      m.position.set(x, y, z);
      m.castShadow = true;
      if (ink) {
        const o = new THREE.Mesh(m.geometry, inkMat);
        const s = m.geometry.boundingBox ?? (m.geometry.computeBoundingBox(), m.geometry.boundingBox!);
        const size = s.getSize(new THREE.Vector3());
        o.scale.set(1 + ink / size.x, 1 + ink / size.y, 1 + ink / size.z);
        m.add(o);
      }
      this.body.add(m);
      return m;
    };
    const paint = mat(car.color, { rough: 0.35 });
    add(new THREE.Mesh(new RoundedBoxGeometry(CAR.hx * 2, CAR.hy * 1.2, CAR.hz * 2, 3, 0.2), paint), 0, -0.12, 0, 0.08);
    // Cabina: techo del color del coche y cristales oscuros alrededor
    const cabin = add(new THREE.Mesh(new RoundedBoxGeometry(CAR.hx * 1.05, CAR.hy * 0.95, CAR.hz * 1.85, 3, 0.2), paint), -0.25 * d, CAR.hy * 0.78, 0, 0.08);
    add(new THREE.Mesh(new RoundedBoxGeometry(CAR.hx * 1.07, CAR.hy * 0.5, CAR.hz * 1.87, 2, 0.1), mat('#26324a', { rough: 0.15 })), cabin.position.x, cabin.position.y - 0.02, 0);
    // Parachoques, faros y luces de freno
    for (const s of [-1, 1]) add(new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.2, CAR.hz * 2 + 0.05, 2, 0.06), mat('#e5e7eb', { rough: 0.4, metal: 0.4 })), s * CAR.hx, -CAR.hy + 0.35, 0);
    for (const z of [-0.6, 0.6]) {
      const h = add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat('#fff7cc', { emissive: '#fff1a8' })), d * (CAR.hx - 0.02), 0.05, z);
      h.scale.set(0.5, 1, 1);
    }
    this.brake = ownMat('#7f1d1d');
    for (const z of [-0.65, 0.65]) add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.3), this.brake), -d * CAR.hx, 0.08, z);
    for (const x of [-1.3, 1.3]) for (const z of [-CAR.hz, CAR.hz]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16), mat('#111827'));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, -CAR.hy + 0.2, z);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.32, 8), mat('#cbd5e1', { metal: 0.5, rough: 0.3 }));
      w.add(hub);
      this.wheels.push(w);
      this.group.add(w);
    }
  }

  sync(dt: number) {
    const p = this.car.body.translation();
    this.group.position.set(p.x, p.y, p.z);
    for (const w of this.wheels) w.rotation.y -= (this.car.speed * dt) / 0.38 * this.car.dir;
    // Cabeceo al frenar y acelerar (la carrocería se mueve sobre las ruedas)
    const acc = dt > 0 ? (this.car.speed - this.prevSpeed) / dt : 0;
    this.prevSpeed = this.car.speed;
    this.pitch = THREE.MathUtils.damp(this.pitch, THREE.MathUtils.clamp(acc * 0.012, -0.08, 0.08), 8, dt);
    this.body.rotation.z = this.pitch * this.car.dir;
    this.brake.emissive.set(this.car.braking ? '#ef4444' : '#000000');
    this.brake.color.set(this.car.braking ? '#ef4444' : '#7f1d1d');
  }
}
