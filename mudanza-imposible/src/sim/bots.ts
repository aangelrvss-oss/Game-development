// Ayudantes controlados por la máquina. Son deliberadamente simples:
// van a un asa libre del objeto (las de su definición, `ItemDef.handles`), la agarran e imitan el movimiento de los
// jugadores humanos que cargan, añadiendo la componente de giro que pidan (Q/E). No esquivan obstáculos ni deciden
// la ruta.
//
// Tienen la misma física que los jugadores (mano blanda, fuerza y equilibrio de `carrier.ts` y `hand.ts`). Lo
// que los distingue está solo aquí, en cómo deciden: se acercan a su asa sin correr y rodeando a los demás
// porteadores (`personal`: a la carrera o de frente chocarían con ellos y los tumbarían) y, cuando sueltan por
// estar bloqueados, primero dejan de tirar y acompañan al sofá un momento (`letGo`): soltar de golpe con el
// sofá tirando de ellos los tumbaría, igual que a un jugador. Y si notan que empiezan a perder el equilibrio
// (`steady`), dejan de imitar y se dejan llevar por el sofá hasta recuperarlo: imitan con retraso, y cuando el
// jugador frena de golpe seguirían empujando contra todos. Y cuando el objeto ya está dentro del camión y ningún
// jugador lo lleva, o los que lo llevan se paran ahí (`stow`), lo sueltan con cuidado y no lo vuelven a agarrar: si no,
// nunca quedaría cargado.
import { CARRIER, type Carrier } from './carrier';
import type { Item } from './items';
import { localToWorld, rotate } from './sofa';
import type { PlayerInput, Vec3 } from './types';

export type BotStyle = 'atentos' | 'despistados';

export const BOT = {
  /** Retraso de reacción en pasos de 1/60 s. */
  delay: { atentos: 10, despistados: 28 },
  turnRate: 0.9,
  /** Fracción de la velocidad de andar con la que van a por su asa. */
  approach: 0.5,
  /** Tiempo acompañando al sofá sin tirar antes de soltarlo (s). */
  letGo: 0.5,
  /** Distancia a la que rodean y frenan ante otro porteador cuando van a por su asa (m). */
  personal: 1.1,
  /** Desviación del tronco (rad) a partir de la cual dejan de tirar y acompañan al sofá, y a la que vuelven. */
  steady: 0.1,
  steadyBack: 0.04,
  /** Dentro del camión, tiempo con los jugadores que cargan parados tras el que dejan el objeto (s). */
  stowAfter: 0.4,
  /**
   * Sin nada que llevar, esperan fuera del camión: `foot` m más allá del pie de la rampa y `aside` m al lado de la caja de
   * carga; para salir, bajan por la rampa a menos de `down` m de su eje (m).
   */
  park: { foot: 0.6, aside: 1.6, down: 1.0 },
  /** Al cambiar de asa, las que están a menos de esto (m) de la más alejada de las ocupadas valen igual. */
  farTie: 0.05,
};

export class BotBrain {
  /** Objeto al que va o que lleva (índice en `Game.items`; lo elige `Game` entre los que necesitan manos). */
  item = 0;
  /** Asa a la que va o que agarra (índice en las asas de la definición del objeto). */
  slot: number;
  history: { x: number; z: number; w: number }[] = [];
  tryTime = 0;
  wander = { x: 0, z: 0, t: 0 };
  /** Tiempo empujando sin avanzar mientras carga. */
  blocked = 0;
  /** Espera antes de volver a agarrar tras soltar por bloqueo. */
  regrab = 0;
  /** Soltando con cuidado: tiempo que queda acompañando al sofá antes de soltar. */
  letGo = 0;
  /** Se está dejando llevar por el sofá para no perder el equilibrio. */
  yielding = false;
  constructor(slot: number, readonly style: BotStyle, private rng: () => number) { this.slot = slot; }

  /**
   * Hacia (`dx`, `dz`), a `d` m, sin correr: rodea a quien tiene delante y frena si está muy cerca (no los arrolla).
   */
  private approach(p: Vec3, dx: number, dz: number, d: number, others: Vec3[], input: PlayerInput) {
    let s = Math.min(BOT.approach, d / 0.8);
    let ux = dx / d, uz = dz / d;
    // Espacio personal: rodea a quien tiene delante y frena si está muy cerca (no los arrolla)
    for (const o of others) {
      const ox = o.x - p.x, oz = o.z - p.z, od = Math.hypot(ox, oz);
      if (od < 1e-3 || od > BOT.personal || od > d + 0.3) continue;
      const ahead = (ox * ux + oz * uz) / od;
      if (ahead < 0.2) continue;
      // Se desvía hacia el lado contrario al que queda el otro respecto a su camino
      const px = -uz, pz = ux, side = ox * px + oz * pz > 0 ? -1 : 1, k = 1.5 * ahead * (1 - od / BOT.personal);
      ux += px * side * k; uz += pz * side * k;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul; uz /= ul;
      s *= Math.max(0.35, od / BOT.personal);
    }
    input.mx = ux * s; input.mz = uz * s;
  }

  /**
   * Sin nada que llevar (su objeto ya está cargado y ninguno necesita manos): va a `goal` (fuera del camión, a un lado de
   * la rampa, para no quedarse en el carril de los que llegan) y allí espera.
   */
  park(me: Carrier, goal: { x: number; z: number }, others: Vec3[]): PlayerInput {
    const input: PlayerInput = { mx: 0, mz: 0, grab: false, turn: 0, right: false };
    const p = me.pos, dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
    if (me.stunned <= 0 && !me.holding && d > 0.3) this.approach(p, dx, dz, d, others, input);
    return input;
  }

  /**
   * Calcula el mando del ayudante para este paso. `item`: el objeto que lleva o al que va; `taken`: sus asas ocupadas;
   * `stow`: el objeto ya está dentro del camión y ningún jugador lo lleva (se suelta y se deja).
   */
  think(me: Carrier, item: Item, lead: { x: number; z: number; w: number; active: boolean }, taken: Set<number>, dt: number, others: Vec3[] = [], stow = false): PlayerInput {
    const input: PlayerInput = { mx: 0, mz: 0, grab: false, turn: 0, right: false };
    const body = item.body, handles = item.def.handles;
    if (me.stunned > 0) { this.letGo = 0; return input; }
    const p = me.pos;
    if (!me.holding) {
      this.letGo = 0;
      // Ya está cargado (o a punto): no se vuelve a agarrar
      if (stow) { this.regrab = 0; return input; }
      // Su asa la ha cogido otro (también un jugador): busca otra libre, de las más alejadas de las ocupadas (el otro
      // extremo: el peso se reparte y el objeto va derecho; agarrado por un extremo y por un costado, la mesa iba
      // inclinada y sus patas topaban con el pie de la rampa). Entre las igual de alejadas, una al azar
      if (taken.has(this.slot)) {
        const free = handles.map((_, i) => i).filter((i) => !taken.has(i));
        const far = free.map((i) => Math.min(...[...taken].map((k) => Math.hypot(handles[i].p.x - handles[k].p.x, handles[i].p.z - handles[k].p.z))));
        const best = Math.max(...far), pick = free.filter((_, j) => far[j] > best - BOT.farTie);
        if (free.length) this.slot = pick[Math.floor(this.rng() * pick.length)];
      }
      if (this.regrab > 0) {
        // Se aparta un poco y deja pasar al sofá; después vuelve a por un asa.
        this.regrab -= dt;
        input.mx = lead.x / CARRIER.carrySpeed * 0.8; input.mz = lead.z / CARRIER.carrySpeed * 0.8;
        return input;
      }
      const slot = handles[this.slot];
      const anchor = localToWorld(body, slot.p);
      const out = rotate(body.rotation(), slot.out);
      const ol = Math.hypot(out.x, out.z) || 1;
      const goal = { x: anchor.x + (out.x / ol) * 0.6, z: anchor.z + (out.z / ol) * 0.6 };
      const dx = goal.x - p.x, dz = goal.z - p.z;
      const d = Math.hypot(dx, dz);
      this.tryTime += dt;
      if (d < 0.45 && Math.abs(anchor.y - p.y) < 1.2) {
        input.grab = true;
      } else {
        this.approach(p, dx, dz, d, others, input);
      }
      // Si no llega en un rato (bloqueado), prueba otra asa libre.
      if (this.tryTime > 5) {
        this.tryTime = 0;
        const free = handles.map((_, i) => i).filter((i) => !taken.has(i) && i !== this.slot);
        if (free.length) this.slot = free[Math.floor(this.rng() * free.length)];
      }
      return input;
    }
    this.tryTime = 0;
    // Dentro del camión y sin jugadores que lo lleven: lo suelta con cuidado (acompaña al objeto y después suelta)
    if (stow && this.letGo <= 0) this.letGo = BOT.letGo;
    const lean = Math.hypot(me.lean.x, me.lean.z);
    this.yielding = lean > BOT.steady || (this.yielding && lean > BOT.steadyBack) || me.wobbling;
    if (this.yielding && this.letGo <= 0) {
      // Pierde el equilibrio: deja de tirar y acompaña al sofá (la historia sigue llenándose para luego)
      this.history.push({ x: lead.x, z: lead.z, w: lead.w });
      while (this.history.length > BOT.delay[this.style]) this.history.shift();
      const g = me.grabWorld();
      if (g) { const v = body.velocityAtPoint(g); input.mx = v.x / CARRIER.carrySpeed; input.mz = v.z / CARRIER.carrySpeed; }
      return input;
    }
    if (this.letGo > 0) {
      // Soltando con cuidado: deja de tirar y acompaña al sofá; después suelta
      this.letGo -= dt;
      const g = me.grabWorld();
      if (g && this.letGo > 0) {
        const v = body.velocityAtPoint(g);
        input.mx = v.x / CARRIER.carrySpeed; input.mz = v.z / CARRIER.carrySpeed;
        return input;
      }
      this.letGo = 0;
      this.regrab = 2.2;
      input.grab = true; // en un ayudante que carga, «agarrar» significa soltar
      return input;
    }
    // Imita a los humanos con retraso de reacción.
    this.history.push({ x: lead.x, z: lead.z, w: lead.w });
    const delay = BOT.delay[this.style];
    while (this.history.length > delay) this.history.shift();
    const h = this.history[0];
    if (!lead.active && h.x === 0 && h.z === 0 && h.w === 0) return input;
    const c = body.translation();
    const rx = p.x - c.x, rz = p.z - c.z;
    // v = v_líder + ω × r (ω sobre +y)
    let vx = h.x + h.w * rz;
    let vz = h.z - h.w * rx;
    if (this.style === 'despistados') {
      this.wander.t -= dt;
      if (this.wander.t <= 0) {
        this.wander = { x: (this.rng() - 0.5) * 1.6, z: (this.rng() - 0.5) * 1.6, t: 0.6 + this.rng() * 1.4 };
      }
      vx += this.wander.x; vz += this.wander.z;
    }
    input.mx = vx / CARRIER.carrySpeed;
    input.mz = vz / CARRIER.carrySpeed;
    // ¿Atascado contra algo? Si se queda atrás de su asa (la mano se estira) o empuja y no avanza mientras el
    // sofá sí avanza, suelta para no bloquear al grupo (pasa en puertas). Si todo el grupo va despacio (la
    // escalera, un peso grande), no es él quien se atasca: sigue agarrando.
    const want = Math.hypot(vx, vz);
    const v = me.body.linvel(), sv = body.linvel();
    const along = want > 1e-3 ? (v.x * vx + v.z * vz) / want : 0;
    const stuck = want > 0.9 && along < 0.3 * want && Math.hypot(sv.x, sv.z) > 0.6;
    this.blocked = stuck || me.handSep > 0.3 ? this.blocked + dt : 0;
    if (this.blocked > 0.7) {
      // Bloqueado: suelta para no frenar al grupo (pasa en puertas), pero con cuidado (`letGo`)
      this.blocked = 0;
      this.letGo = BOT.letGo;
      const free = handles.map((_, i) => i).filter((i) => !taken.has(i) && i !== this.slot);
      if (free.length) this.slot = free[Math.floor(this.rng() * free.length)];
    }
    return input;
  }
}
