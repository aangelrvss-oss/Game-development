import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { ItemDef } from '../sim/items';
import { mat, PALETTE } from './materials';
import { signTex } from './textures';

// Dibujo provisional de un objeto del catálogo a partir de su `ItemDef`: cada caja de su forma, tal cual (lo dibujado
// es lo que choca), con el color de la dirección artística y contorno oscuro. El sofá tiene su propio modelo
// (`SofaView`); los modelos reconocibles de los demás llegan en el paso de la vista del ciclo 2.

/** Color de cada caja de la forma, por clave de dibujo (la última se repite para las que sobran). */
const LOOK: Record<string, string[]> = {
  // Cartón
  caja: ['#c8a26b'],
  // Madera miel: asiento y respaldo; patas más oscuras
  silla: ['#c98b52', '#c98b52', '#8a5a3c'],
  // Base y pie oscuros, pantalla de tela crema
  lampara: ['#374151', '#374151', '#efe3c8'],
  // Tablero de madera miel y patas oscuras
  mesa: ['#c98b52', '#8a5a3c'],
  // Metal esmaltado blanco
  nevera: ['#f4f1ea'],
  // Caja negra y teclado de marfil
  piano: ['#2a2140', '#f4f1ea'],
};

const inkMat = new THREE.MeshBasicMaterial({ color: PALETTE.outline, side: THREE.BackSide });

export class ItemView {
  group = new THREE.Group();
  /** Hijo que se aplasta un instante al golpearse, sin tocar la transformación física. */
  private inner = new THREE.Group();
  private squash = 0;
  private squashV = 0;

  constructor(readonly def: ItemDef) {
    this.group.add(this.inner);
    const colors = LOOK[def.draw] ?? ['#c8a26b'];
    def.shape.forEach((b, i) => {
      const w = b.h.x * 2, h = b.h.y * 2, d = b.h.z * 2;
      const geo = b.round ? new RoundedBoxGeometry(w, h, d, 2, b.round) : new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(geo, mat(colors[Math.min(i, colors.length - 1)], { rough: def.draw === 'nevera' ? 0.4 : 0.8 }));
      m.position.set(b.p.x, b.p.y, b.p.z);
      m.castShadow = true; m.receiveShadow = true;
      // Contorno de dibujo animado: copia por detrás, 2 cm más grande (fuera del collider solo el trazo)
      const o = new THREE.Mesh(geo, inkMat);
      o.scale.set(1 + 0.04 / w, 1 + 0.04 / h, 1 + 0.04 / d);
      m.add(o);
      this.inner.add(m);
    });
    // Lo frágil (un golpe algo por encima de su umbral lo rompe entero: 100 puntos o más por m/s) lleva pegatina roja y
    // blanca, en la cara +z de su pieza más grande
    if (def.fragility && def.fragility.damage >= 100) {
      const big = def.shape.reduce((a, b) => (b.h.x * b.h.y * b.h.z > a.h.x * a.h.y * a.h.z ? b : a));
      const s = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(0.3, big.h.x * 1.6), Math.min(0.12, big.h.y * 1.2)), mat('#ffffff', { map: signTex('FRÁGIL', { bg: '#fef2f2', color: '#dc2626', w: 256, h: 96 }), rough: 0.7 }));
      s.position.set(big.p.x, big.p.y, big.p.z + big.h.z + 0.005);
      this.inner.add(s);
    }
  }

  /** Golpe: se aplasta y rebota un instante. */
  bump(strength: number) { this.squashV -= Math.min(2.2, strength * 0.3); }

  sync(body: RAPIER.RigidBody, dt = 1 / 60) {
    const p = body.translation(), q = body.rotation();
    this.group.position.set(p.x, p.y, p.z);
    this.group.quaternion.set(q.x, q.y, q.z, q.w);
    dt = Math.min(dt, 0.1);
    this.squashV += (-this.squash * 140 - this.squashV * 10) * dt;
    this.squash += this.squashV * dt;
    const sq = THREE.MathUtils.clamp(this.squash, -0.12, 0.12);
    this.inner.scale.set(1 - sq * 0.25, 1 + sq, 1 - sq * 0.25);
  }
}
