import * as THREE from 'three';

/**
 * Tubo flexible que se actualiza cada fotograma sin crear geometría nueva: brazos y piernas «de manguera».
 * El eje sigue una curva cuadrática que pasa por el codo o la rodilla; el grosor puede variar a lo largo.
 */
export class FlexTube {
  readonly geometry: THREE.BufferGeometry;
  private pos: Float32Array;
  private nor: Float32Array;
  private pts: THREE.Vector3[];
  private tan: THREE.Vector3[];

  constructor(private segments = 14, private radial = 10, private radius: (t: number) => number = () => 0.06) {
    const rings = segments + 1, verts = rings * radial + 2;
    this.pos = new Float32Array(verts * 3);
    this.nor = new Float32Array(verts * 3);
    const idx: number[] = [];
    for (let i = 0; i < segments; i++) for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
      // Caras hacia fuera: (b − a) × (c − a) apunta según la normal del anillo
      idx.push(a, b, c, b, d, c);
    }
    // Tapas redondeadas aproximadas con un abanico (los extremos quedan dentro de hombro, mano, cadera o bota)
    const s0 = rings * radial, s1 = s0 + 1;
    for (let j = 0; j < radial; j++) {
      idx.push(s0, (j + 1) % radial, j);
      const last = segments * radial;
      idx.push(s1, last + j, last + ((j + 1) % radial));
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    this.geometry.setIndex(idx);
    this.pts = Array.from({ length: rings }, () => new THREE.Vector3());
    this.tan = Array.from({ length: rings }, () => new THREE.Vector3());
  }

  /** a → (pasa por) mid → b. */
  update(a: THREE.Vector3, mid: THREE.Vector3, b: THREE.Vector3) {
    const c = mid.clone().multiplyScalar(2).sub(a.clone().add(b).multiplyScalar(0.5)); // control de la cuadrática
    const n = this.segments;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this.pts[i].set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(c, 2 * u * t).addScaledVector(b, t * t);
      this.tan[i].set(0, 0, 0).addScaledVector(c.clone().sub(a), 2 * u).addScaledVector(b.clone().sub(c), 2 * t).normalize();
    }
    // Marco que se transporta a lo largo de la curva (sin giros bruscos)
    let normal = new THREE.Vector3(0, 0, 1);
    if (Math.abs(this.tan[0].dot(normal)) > 0.9) normal.set(1, 0, 0);
    normal.sub(this.tan[0].clone().multiplyScalar(normal.dot(this.tan[0]))).normalize();
    const p = this.pos, q = this.nor, r = this.radial;
    const tmp = new THREE.Vector3(), bin = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const t = this.tan[i];
      if (i > 0) {
        normal.sub(tmp.copy(t).multiplyScalar(normal.dot(t)));
        if (normal.lengthSq() < 1e-8) normal.set(t.y, -t.x, 0);
        normal.normalize();
      }
      bin.crossVectors(t, normal);
      const rad = this.radius(i / n);
      for (let j = 0; j < r; j++) {
        const ang = (j / r) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
        const nx = normal.x * cs + bin.x * sn, ny = normal.y * cs + bin.y * sn, nz = normal.z * cs + bin.z * sn;
        const k = (i * r + j) * 3;
        p[k] = this.pts[i].x + nx * rad; p[k + 1] = this.pts[i].y + ny * rad; p[k + 2] = this.pts[i].z + nz * rad;
        q[k] = nx; q[k + 1] = ny; q[k + 2] = nz;
      }
    }
    const s0 = (n + 1) * r * 3;
    p[s0] = this.pts[0].x; p[s0 + 1] = this.pts[0].y; p[s0 + 2] = this.pts[0].z;
    q[s0] = -this.tan[0].x; q[s0 + 1] = -this.tan[0].y; q[s0 + 2] = -this.tan[0].z;
    p[s0 + 3] = this.pts[n].x; p[s0 + 4] = this.pts[n].y; p[s0 + 5] = this.pts[n].z;
    q[s0 + 3] = this.tan[n].x; q[s0 + 4] = this.tan[n].y; q[s0 + 5] = this.tan[n].z;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}

/** Codo o rodilla para una cadena de dos huesos (a, b) entre `root` y `target`, doblándose hacia `pole`. */
export function twoBone(root: THREE.Vector3, target: THREE.Vector3, a: number, b: number, pole: THREE.Vector3): THREE.Vector3 {
  const dir = target.clone().sub(root);
  let d = dir.length();
  if (d < 1e-5) return root.clone().add(pole.clone().normalize().multiplyScalar(a));
  dir.divideScalar(d);
  // Si no llega, el miembro se estira (es de goma): el codo queda a mitad de camino
  if (d >= a + b) return root.clone().addScaledVector(dir, d * (a / (a + b)));
  d = Math.max(d, Math.abs(a - b) + 1e-3);
  const x = (a * a - b * b + d * d) / (2 * d);
  const y = Math.sqrt(Math.max(0, a * a - x * x));
  const perp = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (perp.lengthSq() < 1e-8) perp.set(0, 1, 0).sub(dir.clone().multiplyScalar(dir.y));
  perp.normalize();
  return root.clone().addScaledVector(dir, x).addScaledVector(perp, y);
}
