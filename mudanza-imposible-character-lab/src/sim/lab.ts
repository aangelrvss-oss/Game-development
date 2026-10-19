import type RAPIER from '@dimforge/rapier3d-compat';
import { Character, CENTER_Y } from './character';
import { NO_INPUT, type LabInput, type TestId, type Vec2, type Vec3 } from './types';

type R = typeof RAPIER;

/** Sofá: la misma forma sirve para la física y para el dibujo (coordenadas locales, respaldo hacia -z). */
export const SOFA = {
  base: { p: [0, 0.03, 0], h: [1.0, 0.15, 0.42] },
  back: { p: [0, 0.44, -0.33], h: [1.0, 0.26, 0.09] },
  arms: [{ p: [-0.91, 0.32, 0.0], h: [0.1, 0.14, 0.42] }, { p: [0.91, 0.32, 0.0], h: [0.1, 0.14, 0.42] }],
  legs: [[-0.86, -0.17, 0.32], [0.86, -0.17, 0.32], [-0.86, -0.17, -0.32], [0.86, -0.17, -0.32]] as [number, number, number][],
  legH: 0.05,
  legR: 0.045,
  /** Altura del centro sobre el suelo en reposo (patas de 10 cm). */
  rest: 0.22,
  mass: 95,
};

/** Zonas del laboratorio: cada prueba tiene su sitio. */
export const ZONES = {
  carpet: { x0: -1.8, x1: 1.8, z0: -3.2, z1: -0.75 },
  curb: { x: 5, z: 0, w: 3.2, h: 0.16, d: 0.3 },
  ramp: { x: -6.5, w: 5, z0: -5.5, z1: 0.5, top: 1.2 },
};

export const FRICTION = { floor: 0.25, carpet: 1.6, ice: 0.03, sofaLeg: 0.3 };

export const DT = 1 / 60;

/** Mando de una prueba: recibe el laboratorio y el tiempo de prueba, devuelve la entrada del porteador. */
type Script = (lab: Lab, t: number) => LabInput;

export class Lab {
  world: RAPIER.World;
  char: Character;
  sofa: RAPIER.RigidBody;
  sofaColliders: RAPIER.Collider[] = [];
  obstacles = new Set<number>();
  private sofaSet = new Set<number>();
  test: TestId = 'libre';
  testTime = 0;
  script: Script | null = null;
  /** Marcas de tiempo de los guiones (primera vez que pasa algo). */
  memo: Record<string, number> = {};
  /** Registro de sucesos con su tiempo (para pruebas y depuración). */
  log: { t: number; e: string }[] = [];
  /** Física del sofá activa (si no, queda fijo como un mueble anclado). */
  sofaPhysics = true;
  /** Ajustes del porteador que se conservan entre pruebas. */
  intensity = 1;
  reactions = true;

  constructor(private R: R) {
    this.world = null!; this.char = null!; this.sofa = null!;
    this.build();
    this.reset('A');
  }

  /** Mundo nuevo: cada prueba empieza sin restos de la anterior (cachés de contacto, cuerpos dormidos), así se repite igual. */
  private build() {
    if (this.world) this.world.free();
    this.sofaColliders = []; this.obstacles.clear(); this.sofaSet.clear();
    this.world = new this.R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = DT;
    this.buildStatic();
    this.sofa = this.buildSofa();
    this.char = new Character(this.R, this.world, { x: 0, y: CENTER_Y + 0.01, z: 2 });
    this.char.intensity = this.intensity;
    this.char.reactions = this.reactions;
  }

  setIntensity(k: number) { this.intensity = Math.max(0.5, Math.min(1.5, k)); this.char.intensity = this.intensity; }
  setReactions(on: boolean) { this.reactions = on; this.char.reactions = on; }

  private buildStatic() {
    const R = this.R, w = this.world;
    const fixed = w.createRigidBody(R.RigidBodyDesc.fixed());
    w.createCollider(R.ColliderDesc.cuboid(30, 0.5, 30).setTranslation(0, -0.5, 0).setFriction(FRICTION.floor), fixed);
    // Alfombra gruesa (agarra mucho las patas) y bordillo de 16 cm
    const c = ZONES.carpet;
    w.createCollider(R.ColliderDesc.cuboid((c.x1 - c.x0) / 2, 0.01, (c.z1 - c.z0) / 2).setTranslation((c.x0 + c.x1) / 2, 0.01, (c.z0 + c.z1) / 2)
      .setFriction(FRICTION.carpet).setFrictionCombineRule(R.CoefficientCombineRule.Max), fixed);
    const k = ZONES.curb;
    const curb = w.createCollider(R.ColliderDesc.cuboid(k.w / 2, k.h / 2, k.d / 2).setTranslation(k.x, k.h / 2, k.z).setFriction(0.5), fixed);
    this.obstacles.add(curb.handle);
    // Rampa encerada (casi sin rozamiento) que baja hacia +z
    const r = ZONES.ramp, run = r.z1 - r.z0, a = Math.atan2(r.top, run), len = Math.hypot(run, r.top), hy = 0.2;
    const s = Math.sin(a / 2), q = { x: s, y: 0, z: 0, w: Math.cos(a / 2) };
    w.createCollider(R.ColliderDesc.cuboid(r.w / 2, hy, len / 2).setRotation(q)
      .setTranslation(r.x, r.top / 2 - hy * Math.cos(a), (r.z0 + r.z1) / 2 - hy * Math.sin(a))
      .setFriction(FRICTION.ice).setFrictionCombineRule(R.CoefficientCombineRule.Min), fixed);
  }

  private buildSofa() {
    const R = this.R;
    const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, SOFA.rest, -2).setLinearDamping(0.1).setAngularDamping(0.8).setCcdEnabled(true).setAdditionalSolverIterations(4));
    const parts = [SOFA.base, SOFA.back, ...SOFA.arms];
    let vol = 0;
    for (const p of parts) vol += 8 * p.h[0] * p.h[1] * p.h[2];
    const dens = SOFA.mass / vol;
    for (const p of parts) {
      this.sofaColliders.push(this.world.createCollider(R.ColliderDesc.cuboid(p.h[0], p.h[1], p.h[2]).setTranslation(p.p[0], p.p[1], p.p[2]).setDensity(dens).setFriction(0.3), body));
    }
    // Patas: son las que tocan el suelo (y las que se enganchan en la alfombra)
    for (const l of SOFA.legs) {
      this.sofaColliders.push(this.world.createCollider(R.ColliderDesc.cylinder(SOFA.legH, SOFA.legR).setTranslation(l[0], l[1] + 0.02, l[2]).setDensity(dens * 0.2).setFriction(FRICTION.sofaLeg), body));
    }
    for (const c of this.sofaColliders) this.sofaSet.add(c.handle);
    return body;
  }

  get sofaPos(): Vec3 { return this.sofa.translation(); }

  private placeSofa(p: Vec3, yaw: number) {
    this.sofa.setBodyType(this.R.RigidBodyType.Dynamic, true);
    this.sofa.setTranslation(p, true);
    this.sofa.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.sofa.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.sofa.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (!this.sofaPhysics) this.sofa.setBodyType(this.R.RigidBodyType.Fixed, true);
  }

  setSofaPhysics(on: boolean) {
    this.sofaPhysics = on;
    this.sofa.setBodyType(on ? this.R.RigidBodyType.Dynamic : this.R.RigidBodyType.Fixed, true);
  }

  /** Prepara una prueba desde cero. Las cuatro arrancan siempre igual: se pueden comparar. */
  reset(test: TestId) {
    this.build();
    this.test = test;
    this.testTime = 0;
    this.memo = {};
    this.log = [];
    const ch = this.char;
    switch (test) {
      case 'A':
        this.placeSofa({ x: 0, y: SOFA.rest, z: -2 }, 0);
        ch.place({ x: -1.5, y: CENTER_Y + 0.01, z: 2.6 }, { x: 0, z: -1 });
        this.script = scriptA;
        break;
      case 'B':
        // Sofá en la alfombra con las patas delanteras a 4 cm del borde; él delante, mirándolo
        this.placeSofa({ x: 0, y: SOFA.rest + 0.02, z: -1.11 }, 0);
        ch.place({ x: 0, y: CENTER_Y + 0.03, z: -0.09 }, { x: 0, z: -1 });
        this.script = scriptB;
        break;
      case 'C':
        this.placeSofa({ x: 0, y: SOFA.rest, z: -2 }, 0);
        ch.place({ x: ZONES.curb.x, y: CENTER_Y + 0.01, z: ZONES.curb.z - 4.2 }, { x: 0, z: 1 });
        this.script = scriptC;
        break;
      case 'D': {
        // Sofá atravesado arriba de la rampa encerada: baja solo, por su peso. Él espera más abajo, a un lado de
        // su camino, para pararlo agarrándolo por un extremo cuando pase.
        const r = ZONES.ramp, z = -4.7;
        this.placeSofa({ x: r.x, y: this.rampY(z) + SOFA.rest + 0.06, z }, 0);
        const cz = -0.6, cx = r.x + 1.0 + 0.55;
        ch.place({ x: cx, y: this.rampY(cz) + CENTER_Y + 0.05, z: cz }, { x: -0.35, z: -0.94 });
        this.script = scriptD;
        break;
      }
      default:
        this.placeSofa({ x: 0, y: SOFA.rest, z: -2 }, 0);
        ch.place({ x: 0, y: CENTER_Y + 0.01, z: 1.5 }, { x: 0, z: -1 });
        this.script = null;
    }
  }

  /** Altura del suelo en (x, z): bordillo, rampa, alfombra o suelo (para apoyar los pies dibujados). */
  heightAt(x: number, z: number) {
    const k = ZONES.curb, r = ZONES.ramp, c = ZONES.carpet;
    if (Math.abs(x - k.x) < k.w / 2 && Math.abs(z - k.z) < k.d / 2) return k.h;
    if (Math.abs(x - r.x) < r.w / 2 && z > r.z0 && z < r.z1) return this.rampY(z);
    if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return 0.02;
    return 0;
  }

  /** Altura de la superficie de la rampa en z. */
  rampY(z: number) {
    const r = ZONES.ramp;
    return Math.max(0, r.top * (r.z1 - z) / (r.z1 - r.z0));
  }

  /** Avanza un paso fijo. `manual` es la entrada del teclado (manda en la prueba libre o si el usuario toca algo). */
  step(manual: LabInput = NO_INPUT) {
    const input = this.script ? this.script(this, this.testTime) : manual;
    const ch = this.char;
    if (input.grab) {
      if (ch.holding) ch.release();
      else ch.tryGrab(this.sofa, this.sofaColliders);
    }
    ch.preStep(input, DT);
    this.world.step();
    // Contactos del porteador este paso
    const contact: { obstacle: boolean; sofa: boolean; obstacleNormal?: Vec2 } = { obstacle: false, sofa: false };
    this.world.contactPairsWith(ch.collider, (other) => {
      this.world.contactPair(ch.collider, other, (m, flipped) => {
        if (m.numContacts() === 0) return;
        if (this.obstacles.has(other.handle)) {
          const n = m.normal();
          // Normal del bordillo hacia el porteador (horizontal)
          const s = flipped ? 1 : -1;
          const nx = n.x * s, nz = n.z * s, l = Math.hypot(nx, nz);
          if (l > 0.3) { contact.obstacle = true; contact.obstacleNormal = { x: nx / l, z: nz / l }; }
        } else if (this.sofaSet.has(other.handle)) contact.sofa = true;
      });
    });
    ch.postStep(DT, contact);
    for (const e of ch.events) this.log.push({ t: +this.testTime.toFixed(3), e });
    this.testTime += DT;
  }

  /** Para los guiones: recuerda la primera vez que pasa algo. */
  once(key: string, cond: boolean) {
    if (cond && this.memo[key] === undefined) this.memo[key] = this.testTime;
    return this.memo[key];
  }

  dispose() { this.world.free(); }
}

/** Dirección (normalizada y con frenada al llegar) hacia un punto. */
function toward(lab: Lab, x: number, z: number, run = false, slow = 0.6): LabInput {
  const p = lab.char.pos, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
  if (d < 0.12) return NO_INPUT;
  const k = Math.min(1, d / slow);
  return { mx: (dx / d) * k, mz: (dz / d) * k, run, grab: false };
}

/** A · Caminar torpemente: recto, giro, parada, media vuelta y parada. */
const scriptA: Script = (lab, t) => {
  // [x, z, pausa al llegar]
  const legs: [number, number, number][] = [[-1.5, 0.2, 0], [1.2, -1.1, 0.8], [-0.4, 1.4, 0]];
  const i = lab.memo.leg ?? 0;
  if (i >= legs.length) return NO_INPUT;
  const arrived = lab.memo[`at${i}`];
  if (arrived !== undefined) {
    if (t >= arrived + legs[i][2]) lab.memo.leg = i + 1;
    return NO_INPUT;
  }
  const [x, z] = legs[i];
  const p = lab.char.pos, v = lab.char.body.linvel();
  lab.once(`at${i}`, Math.hypot(p.x - x, p.z - z) < 0.2 && Math.hypot(v.x, v.z) < 0.5);
  return toward(lab, x, z);
};

/** B · Tirar de un sofá demasiado pesado: agarra, tira hacia atrás; al salir de la alfombra se suelta de golpe. */
const scriptB: Script = (lab, t) => {
  if (t < 0.5) return NO_INPUT;
  if (!lab.char.holding && lab.once('grab', true) === lab.testTime) return { ...NO_INPUT, grab: true };
  // Tira hasta un segundo después de que el sofá salga de la alfombra; luego lo suelta
  const out = lab.once('fuera', lab.sofaPos.z - 0.32 > ZONES.carpet.z1);
  if (lab.char.holding && (out === undefined || t < out + 1.2) && t < 9) return { mx: 0, mz: 1, run: false, grab: false };
  if (lab.char.holding && out !== undefined && t > out + 1.6 && lab.char.state !== 'losingBalance') return { ...NO_INPUT, grab: lab.once('suelta', true) === lab.testTime };
  return NO_INPUT;
};

/** C · Tropiezo: corre hacia el bordillo; después de levantarse, da unos pasos para demostrar que vuelve a responder. */
const scriptC: Script = (lab, t) => {
  const ch = lab.char;
  const up = lab.once('levantado', lab.once('cae', !ch.upright) !== undefined && ch.state === 'idle');
  if (up !== undefined) return t < up + 0.6 ? NO_INPUT : t < up + 2.4 ? toward(lab, ZONES.curb.x - 1.2, ZONES.curb.z + 2.5) : NO_INPUT;
  if (lab.once('cae', !ch.upright) !== undefined) return NO_INPUT;
  if (t < 0.4) return NO_INPUT;
  return { mx: 0, mz: 1, run: true, grab: false };
};

/** D · Física imprevisible: el sofá baja deslizándose; lo agarra al pasar, le da el tirón y tira de él; luego lo persigue. */
const scriptD: Script = (lab, t) => {
  const ch = lab.char;
  const got = lab.once('agarrado', ch.holding);
  if (got === undefined) {
    // Pulsa agarrar cuando el sofá le pasa al lado (a menos de 75 cm)
    const p = ch.pos;
    let near = Infinity;
    for (const c of lab.sofaColliders) {
      const pr = c.projectPoint({ x: p.x, y: p.y - 0.15, z: p.z }, true);
      if (pr) near = Math.min(near, Math.hypot(pr.point.x - p.x, pr.point.z - p.z));
    }
    return { ...NO_INPUT, grab: near < 0.75 && Math.round(t * 60) % 3 === 0 };
  }
  const lost = lab.once('perdido', !ch.holding);
  if (lost !== undefined && ch.upright && ch.state !== 'losingBalance' && t < lost + 3) {
    const s = lab.sofaPos;
    return toward(lab, s.x, s.z + 0.9);
  }
  return NO_INPUT; // sujeta sin tirar: aguanta como puede
};
