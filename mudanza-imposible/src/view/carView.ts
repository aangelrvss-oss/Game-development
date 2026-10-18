import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CAR, type Car } from '../sim/traffic';
import { mat, ownMat } from './materials';

export class CarView {
  group = new THREE.Group();
  private brake: THREE.MeshStandardMaterial;
  private wheels: THREE.Mesh[] = [];
  constructor(readonly car: Car) {
    const body = new THREE.Mesh(new RoundedBoxGeometry(CAR.hx * 2, CAR.hy * 1.3, CAR.hz * 2, 3, 0.18), mat(car.color, { rough: 0.5 }));
    body.position.y = -0.1;
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(CAR.hx * 1.1, CAR.hy * 1.1, CAR.hz * 1.8, 3, 0.18), mat('#e2e8f0', { rough: 0.3 }));
    cabin.position.set(-0.2 * car.dir, CAR.hy * 0.85, 0);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(CAR.hx * 1.12, CAR.hy * 0.6, CAR.hz * 1.82), mat('#334155', { rough: 0.2 }));
    glass.position.copy(cabin.position).add(new THREE.Vector3(0, 0.08, 0));
    for (const m of [body, cabin, glass]) { m.castShadow = true; this.group.add(m); }
    for (const x of [-1.3, 1.3]) for (const z of [-CAR.hz, CAR.hz]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14), mat('#111827'));
      w.rotation.x = Math.PI / 2;
      w.position.set(x, -CAR.hy + 0.2, z);
      this.wheels.push(w);
      this.group.add(w);
    }
    // Faros delanteros y luces de freno traseras
    for (const z of [-0.6, 0.6]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.32), mat('#fff7cc', { emissive: '#fff1a8' }));
      head.position.set(car.dir * CAR.hx, 0, z);
      this.group.add(head);
    }
    this.brake = ownMat('#7f1d1d');
    for (const z of [-0.65, 0.65]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.3), this.brake);
      b.position.set(-car.dir * CAR.hx, 0.05, z);
      this.group.add(b);
    }
  }

  sync(dt: number) {
    const p = this.car.body.translation();
    this.group.position.set(p.x, p.y, p.z);
    for (const w of this.wheels) w.rotation.y -= (this.car.speed * dt) / 0.38 * this.car.dir;
    this.brake.emissive.set(this.car.braking ? '#ef4444' : '#000000');
    this.brake.color.set(this.car.braking ? '#ef4444' : '#7f1d1d');
  }
}
