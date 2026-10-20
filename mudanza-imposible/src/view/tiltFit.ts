import RAPIER from '@dimforge/rapier3d-compat';
import { CARRIER, CENTER_Y, DOLL_HEIGHT, DOLL_SCALE, type Carrier } from '../sim/carrier';

/**
 * Cuánto de una inclinación dibujada cabe sin meterse en nada. La usan el muñeco de los jugadores (`DollView`) y los
 * ayudantes (`CarrierView`): los dos se dibujan dentro de la cápsula de pie, pero se inclinan alrededor de los pies
 * (desequilibrio, colgarse hacia atrás al tirar, adelantarse al andar) y la cápsula física no. En vez de apartar el
 * dibujo de lo que atraviesa, la inclinación se reduce a lo que cabe.
 *
 * Se prueba la parte de arriba del cuerpo (del ombligo a lo alto de la cabeza, como una cápsula del radio de la
 * física) inclinada contra todo (sofá, paredes, otros porteadores) con una consulta de forma y, si no cabe, se busca
 * por bisección cuánto inclinarse. Baja al momento y vuelve a subir suavizada.
 */
export class TiltFit {
  /** Parte de arriba del cuerpo: del ombligo (a 0,75 m del modelo del muñeco, escalado) a lo alto de la cápsula. */
  private upper: RAPIER.Capsule;
  /** Altura del centro de `upper` sobre los pies. */
  private upperMid: number;
  private fit = 1;

  constructor(private world: RAPIER.World, private carrier: Carrier) {
    const y0 = 0.75 * DOLL_SCALE, y1 = DOLL_HEIGHT - CARRIER.radius;
    this.upper = new RAPIER.Capsule((y1 - y0) / 2, CARRIER.radius);
    this.upperMid = (y0 + y1) / 2;
  }

  /** Fracción (0..1) de la inclinación (x, z) que se puede dibujar: rad hacia donde va lo alto del cuerpo. */
  fraction(x: number, z: number, dt: number) {
    const fit = this.room(x, z);
    this.fit = fit < this.fit ? fit : this.fit + (fit - this.fit) * Math.min(1, dt * 6);
    return this.fit;
  }

  private room(x: number, z: number) {
    const l = Math.min(1.2, Math.hypot(x, z)); // el dibujo no se inclina más
    if (l < 0.01) return 1;
    const d = { x: x / Math.hypot(x, z), z: z / Math.hypot(x, z) };
    const fits = (a: number) => {
      const h = Math.sin(a / 2), m = this.upperMid, p = this.carrier.pos;
      const c = { x: p.x + d.x * Math.sin(a) * m, y: p.y - CENTER_Y + Math.cos(a) * m, z: p.z + d.z * Math.sin(a) * m };
      let hit = false;
      this.world.intersectionsWithShape(c, { x: d.z * h, y: 0, z: -d.x * h, w: Math.cos(a / 2) }, this.upper, () => { hit = true; return false; }, undefined, undefined, this.carrier.collider);
      return !hit;
    };
    if (fits(l)) return 1;
    let lo = 0, hi = 1;
    for (let i = 0; i < 3; i++) { const mid = (lo + hi) / 2; if (fits(l * mid)) lo = mid; else hi = mid; }
    return lo;
  }
}
