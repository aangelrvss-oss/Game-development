import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SOFA } from '../sim/lab';

/** Tela con trama suave (canvas): sin texturas externas. */
function fabric() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 2) {
    ctx.fillStyle = `rgba(110,90,60,${0.05 + ((i * 37) % 7) / 140})`; ctx.fillRect(i, 0, 1, 128);
    ctx.fillStyle = `rgba(110,90,60,${0.04 + ((i * 53) % 5) / 160})`; ctx.fillRect(0, i, 128, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Sofá de tres plazas. Las piezas grandes y las patas tienen exactamente las medidas de los colisionadores
 * (sim/lab.ts → SOFA); los cojines y el ribete son decorado dentro de ese volumen.
 */
export class SofaView {
  group = new THREE.Group();
  constructor() {
    const tex = fabric();
    const body = new THREE.MeshStandardMaterial({ color: '#e9d3ab', roughness: 0.92, map: tex });
    const cushion = new THREE.MeshStandardMaterial({ color: '#f4e5c6', roughness: 0.95, map: tex });
    const wood = new THREE.MeshStandardMaterial({ color: '#6e4126', roughness: 0.55 });
    const pipe = new THREE.MeshStandardMaterial({ color: '#b98a55', roughness: 0.7 });
    const box = (h: number[], p: number[], m: THREE.Material, r = 0.06) => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(h[0] * 2, h[1] * 2, h[2] * 2, 3, Math.min(r, h[0], h[1], h[2])), m);
      mesh.position.set(p[0], p[1], p[2]);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    box(SOFA.base.h, SOFA.base.p, body, 0.07);
    box(SOFA.back.h, SOFA.back.p, body, 0.08);
    for (const a of SOFA.arms) box(a.h, a.p, body, 0.09);
    // Tres cojines de asiento y tres de respaldo, algo más claros, con huecos entre ellos
    const top = SOFA.base.p[1] + SOFA.base.h[1];
    for (let i = -1; i <= 1; i++) {
      box([0.265, 0.075, 0.33], [i * 0.54, top + 0.06, 0.05], cushion, 0.07);
      const bc = box([0.265, 0.17, 0.07], [i * 0.54, SOFA.back.p[1] + 0.02, SOFA.back.p[2] + 0.13], cushion, 0.06);
      bc.rotation.x = -0.12;
    }
    // Ribete en el frente del asiento
    const rib = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, SOFA.base.h[0] * 2 - 0.1, 4, 8), pipe);
    rib.rotation.z = Math.PI / 2;
    rib.position.set(0, SOFA.base.p[1] + SOFA.base.h[1] - 0.01, SOFA.base.h[2] + 0.005);
    this.group.add(rib);
    // Patas de madera torneadas: las que apoyan en el suelo (mismas posiciones que en la física)
    for (const l of SOFA.legs) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(SOFA.legR, SOFA.legR * 0.75, SOFA.legH * 2 + 0.02, 14), wood);
      leg.position.set(l[0], l[1] + 0.02, l[2]);
      leg.castShadow = true;
      this.group.add(leg);
    }
  }

  sync(body: { translation(): { x: number; y: number; z: number }; rotation(): { x: number; y: number; z: number; w: number } }) {
    const p = body.translation(), q = body.rotation();
    this.group.position.set(p.x, p.y, p.z);
    this.group.quaternion.set(q.x, q.y, q.z, q.w);
  }
}
