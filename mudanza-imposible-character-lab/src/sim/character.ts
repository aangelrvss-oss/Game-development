import type RAPIER from '@dimforge/rapier3d-compat';
import type { CharState, LabInput, Vec2, Vec3 } from './types';

type R = typeof RAPIER;

/**
 * Parámetros del porteador. El cuerpo físico es una cápsula con la rotación bloqueada mientras está de pie;
 * el equilibrio es un péndulo invertido (L = inclinación del tronco) que empujan fuerzas medidas en la física.
 */
export const CHAR = {
  radius: 0.3,
  halfHeight: 0.35,
  mass: 75,
  walkSpeed: 2.3,
  runSpeed: 4.2,
  carrySpeed: 1.5,
  accel: 16,
  /** Aceleración máxima al tirar con todo el esfuerzo (≈ 1100 N con 75 kg). */
  pullAccel: 15,
  /** Tiempo con el que el cuerpo se acostumbra a una fuerza (s): los cambios más rápidos le pillan desprevenido. */
  adapt: 0.35,
  /** Tiempo hasta pasar del 40 % al 100 % del esfuerzo al tirar sin avanzar. */
  effortRamp: 2.4,
  grabReach: 1.05,
  handForward: 0.42,
  handY: 0.12,
  handSpeed: 1.5,
  gripBreak: 0.6,
  /** Fuerza que aguantan las manos (N, medida suavizada): por encima, el asa se escapa. */
  gripForce: 900,
  /** Sin estar tirando (le pilla un tirón sin afianzarse), el agarre aguanta mucho menos. */
  gripForceLoose: 420,
  // Equilibrio
  comHeight: 0.9,
  /** Par de tobillo/cadera disponible de pie y dando pasos (rad/s²). */
  ankleMax: 6,
  stepMax: 10,
  kp: 30,
  kd: 8,
  /** Parte de la aceleración voluntaria que no se anticipa (torpeza): balancea un poco al arrancar y frenar. */
  clumsy: 0.15,
  /** Cuánto se echa hacia atrás al tirar, respecto al equilibrio estático (los tirones de verdad se hacen colgándose). */
  pullLean: 2.6,
  /** Cuánto desequilibra un cambio brusco de la fuerza en las manos (soltarse el sofá de golpe, un tirón). */
  releaseGain: 1.6,
  loseAt: 0.26,
  fallAt: 0.78,
  regainBelow: 0.1,
  stumbleMaxTime: 1.4,
  /** Fracción de la velocidad que se convierte en giro al engancharse el pie con un bordillo (ω = v/h). */
  tripCatch: 0.7,
  /** Tiempo mínimo dando traspiés antes de caer (salvo desequilibrio extremo): se le ve intentarlo. */
  stumbleMin: 0.4,
  lieTime: 0.9,
  recoverTime: 0.85,
};

export const CENTER_Y = CHAR.halfHeight + CHAR.radius;

const len2 = (v: Vec2) => Math.hypot(v.x, v.z);

export class Character {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  state: CharState = 'idle';
  stateTime = 0;
  facing: Vec2 = { x: 0, z: -1 };
  joint: RAPIER.ImpulseJoint | null = null;
  grabLocal: Vec3 | null = null;
  private grabBody: RAPIER.RigidBody | null = null;
  handDir: Vec2 = { x: 0, z: -1 };
  /** Altura de las manos al agarrar (relativa al centro): se tira a esa altura, sin levantar el mueble. */
  private handHeight: number = CHAR.handY;
  anchorCur: Vec3 = { x: 0, y: CHAR.handY, z: 0 };
  /** Inclinación del tronco (rad, hacia dónde se va el centro de masas) y su velocidad. */
  lean: Vec2 = { x: 0, z: 0 };
  leanVel: Vec2 = { x: 0, z: 0 };
  /** Inclinación que quiere tener (colgarse al tirar, adelantarse al andar) y la desviación respecto a ella. */
  leanTarget: Vec2 = { x: 0, z: 0 };
  leanDev: Vec2 = { x: 0, z: 0 };
  /** Fuerza horizontal medida sobre el tronco (agarre o empujón del sofá), en N, y aceleración real del cuerpo. */
  force: Vec2 = { x: 0, z: 0 };
  /** La fuerza que espera (sigue a la real con retraso): con ella se cuelga; lo que desequilibra es la diferencia. */
  forceExp: Vec2 = { x: 0, z: 0 };
  accel: Vec2 = { x: 0, z: 0 };
  /** Aceleración que desequilibra los pies: la voluntaria no anticipada y la de los golpes en los pies. */
  footAccel: Vec2 = { x: 0, z: 0 };
  effort = 0;
  /** Velocidad pedida (para que la vista distinga «quiere andar y no puede»). */
  wantVel: Vec2 = { x: 0, z: 0 };
  grounded = true;
  falls = 0;
  /** Escala de las reacciones (control «intensidad»), acotada a valores seguros. */
  intensity = 1;
  reactions = true;
  private stumbleTime = 0;
  private calmTime = 0;
  private lying = 0;
  private recoverFrom: { p: Vec3; q: RAPIER.Rotation } | null = null;
  private lastJ: Vec2 = { x: 0, z: 0 };
  private tripCool = 0;
  private v0: Vec3 = { x: 0, y: 0, z: 0 };
  private resumeState: CharState = 'idle';
  /** Suceso de este paso (para la vista y el registro): tropiezo, se suelta, cae, se levanta. */
  events: string[] = [];

  constructor(private R: R, private world: RAPIER.World, pos: Vec3) {
    this.body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).lockRotations().setCcdEnabled(true).setAngularDamping(0.6));
    const vol = Math.PI * CHAR.radius ** 2 * (2 * CHAR.halfHeight + (4 / 3) * CHAR.radius);
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(CHAR.halfHeight, CHAR.radius).setDensity(CHAR.mass / vol).setFriction(0).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0),
      this.body,
    );
  }

  get pos(): Vec3 { return this.body.translation(); }
  get holding() { return this.joint !== null; }
  get upright() { return this.state !== 'falling' && this.state !== 'recovering'; }

  private set(s: CharState) { if (s !== this.state) { this.state = s; this.stateTime = 0; } }

  place(p: Vec3, facing: Vec2) {
    this.release();
    this.body.setBodyType(this.R.RigidBodyType.Dynamic, true);
    this.body.lockRotations(true, true);
    this.collider.setFriction(0);
    this.collider.setFrictionCombineRule(this.R.CoefficientCombineRule.Min);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.body.setTranslation(p, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.facing = { ...facing };
    this.lean = { x: 0, z: 0 }; this.leanVel = { x: 0, z: 0 }; this.leanTarget = { x: 0, z: 0 }; this.leanDev = { x: 0, z: 0 };
    this.force = { x: 0, z: 0 }; this.forceExp = { x: 0, z: 0 }; this.accel = { x: 0, z: 0 }; this.footAccel = { x: 0, z: 0 };
    this.effort = 0; this.lying = 0; this.stumbleTime = 0; this.recoverFrom = null;
    this.state = 'idle'; this.stateTime = 0;
  }

  handAnchor(): Vec3 {
    return { x: this.handDir.x * CHAR.handForward, y: this.handHeight, z: this.handDir.z * CHAR.handForward };
  }

  handWorld(): Vec3 {
    const p = this.pos, a = this.joint ? this.anchorCur : this.handAnchor();
    return { x: p.x + a.x, y: p.y + a.y, z: p.z + a.z };
  }

  grabWorld(): Vec3 | null {
    if (!this.grabLocal || !this.grabBody) return null;
    const t = this.grabBody.translation(), q = this.grabBody.rotation(), l = this.grabLocal;
    // q · l · q⁻¹
    const ix = q.w * l.x + q.y * l.z - q.z * l.y, iy = q.w * l.y + q.z * l.x - q.x * l.z;
    const iz = q.w * l.z + q.x * l.y - q.y * l.x, iw = -q.x * l.x - q.y * l.y - q.z * l.z;
    return {
      x: t.x + ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
      y: t.y + iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
      z: t.z + iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
    };
  }

  /** Agarra el punto más cercano del cuerpo indicado, si está al alcance. */
  tryGrab(body: RAPIER.RigidBody, colliders: RAPIER.Collider[]): boolean {
    if (this.joint || !this.upright) return false;
    const p = this.pos;
    const probe = { x: p.x + this.facing.x * 0.35, y: p.y - 0.15, z: p.z + this.facing.z * 0.35 };
    let best = Infinity, target: Vec3 | null = null;
    for (const c of colliders) {
      const pr = c.projectPoint(probe, true);
      if (!pr) continue;
      const d = Math.hypot(pr.point.x - probe.x, pr.point.y - probe.y, pr.point.z - probe.z);
      if (d < best) { best = d; target = { x: pr.point.x, y: pr.point.y, z: pr.point.z }; }
    }
    if (!target) return false;
    const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    if (d > CHAR.grabReach + CHAR.radius || Math.abs(target.y - p.y) > 1.2) return false;
    this.handDir = d > 1e-3 ? { x: dx / d, z: dz / d } : { ...this.facing };
    const t = body.translation(), q = body.rotation();
    // Punto en coordenadas locales del sofá: q⁻¹ · (target − t)
    const v = { x: target.x - t.x, y: target.y - t.y, z: target.z - t.z };
    const qi = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
    const ix = qi.w * v.x + qi.y * v.z - qi.z * v.y, iy = qi.w * v.y + qi.z * v.x - qi.x * v.z;
    const iz = qi.w * v.z + qi.x * v.y - qi.y * v.x, iw = -qi.x * v.x - qi.y * v.y - qi.z * v.z;
    this.grabLocal = {
      x: ix * qi.w + iw * -qi.x + iy * -qi.z - iz * -qi.y,
      y: iy * qi.w + iw * -qi.y + iz * -qi.x - ix * -qi.z,
      z: iz * qi.w + iw * -qi.z + ix * -qi.y - iy * -qi.x,
    };
    this.grabBody = body;
    this.anchorCur = { x: target.x - p.x, y: target.y - p.y, z: target.z - p.z };
    this.handHeight = Math.max(-0.4, Math.min(CHAR.handY, target.y - p.y));
    const data = this.R.JointData.spherical(this.anchorCur, this.grabLocal);
    this.joint = this.world.createImpulseJoint(data, this.body, body, true);
    this.joint.setContactsEnabled(false);
    this.effort = 0.4;
    this.set('grabbing');
    this.events.push('agarra');
    return true;
  }

  release(reason = 'suelta') {
    if (this.joint) { this.world.removeImpulseJoint(this.joint, true); this.events.push(reason); }
    this.joint = null; this.grabLocal = null; this.grabBody = null;
  }

  /** Antes del paso de física: control de movimiento según el estado. */
  preStep(input: LabInput, dt: number) {
    this.events = [];
    this.stateTime += dt;
    const v = this.body.linvel();
    this.v0 = { x: v.x, y: v.y, z: v.z };
    this.lastJ = { x: 0, z: 0 };
    if (!this.upright) { this.wantVel = { x: 0, z: 0 }; return; }

    let mx = input.mx, mz = input.mz;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    const speed = this.joint ? CHAR.carrySpeed : input.run ? CHAR.runSpeed : CHAR.walkSpeed;
    let tx = mx * speed, tz = mz * speed;
    let maxA = CHAR.accel;

    if (this.joint) {
      // Tirar: si pide moverse y apenas avanza, aprieta cada vez más (esfuerzo de 40 % a 100 %)
      const vh = Math.hypot(v.x, v.z), want = Math.hypot(tx, tz);
      if (want > 0.3 && vh < want * 0.6) this.effort = Math.min(1, this.effort + (0.6 / CHAR.effortRamp) * dt);
      else this.effort += (0.4 - this.effort) * Math.min(1, dt * 2);
      maxA = CHAR.pullAccel * this.effort;
    }
    if (this.state === 'losingBalance') {
      // Pasos apresurados hacia donde se cae: los pies intentan volver a ponerse debajo del cuerpo
      const d = this.leanDev, l = len2(d);
      if (l > 1e-4) {
        const sp = (1.2 + 3 * l) * Math.min(1.5, this.intensity);
        tx = tx * 0.3 + (d.x / l) * sp;
        tz = tz * 0.3 + (d.z / l) * sp;
        // Con el sofá agarrado, los pasos no pueden tirar más que su esfuerzo
        maxA = this.joint ? CHAR.pullAccel * Math.max(0.6, this.effort) : CHAR.accel * 1.3;
      }
    }
    this.wantVel = { x: tx, z: tz };
    let ax = (tx - v.x) / dt, az = (tz - v.z) / dt;
    const a = Math.hypot(ax, az);
    if (a > maxA) { ax *= maxA / a; az *= maxA / a; }
    const mass = this.body.mass();
    this.lastJ = { x: ax * mass * dt, z: az * mass * dt };
    this.body.applyImpulse({ x: this.lastJ.x, y: 0, z: this.lastJ.z }, true);
    if (!this.joint && m > 0.15 && this.state !== 'losingBalance') this.facing = { x: mx / Math.max(m, 1e-6), z: mz / Math.max(m, 1e-6) };

    // La mano lleva el punto agarrado a su sitio poco a poco (sin tirones)
    if (this.joint) {
      const t = this.handAnchor(), c = this.anchorCur;
      const dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z, d = Math.hypot(dx, dy, dz);
      if (d > 1e-4) {
        const k = Math.min(1, (CHAR.handSpeed * dt) / d);
        this.anchorCur = { x: c.x + dx * k, y: c.y + dy * k, z: c.z + dz * k };
        (this.joint as RAPIER.SphericalImpulseJoint).setAnchor1(this.anchorCur);
      }
      this.facing = { ...this.handDir };
    }
  }

  /**
   * Después del paso de física: mide la aceleración real y la fuerza externa (agarre, empujones, golpes),
   * hace avanzar el péndulo del equilibrio y decide el estado.
   * `contact`: con qué ha chocado este paso ('obstacle' a la altura de los pies, 'sofa' contra el cuerpo).
   */
  postStep(dt: number, contact: { obstacle: boolean; sofa: boolean; obstacleNormal?: Vec2 }) {
    const v = this.body.linvel(), mass = this.body.mass();
    const ax = (v.x - this.v0.x) / dt, az = (v.z - this.v0.z) / dt;
    // Filtro corto: los contactos con el suelo dan picos de un paso sin significado
    const k = Math.min(1, dt / 0.04);
    this.accel.x += (Math.max(-40, Math.min(40, ax)) - this.accel.x) * k;
    this.accel.z += (Math.max(-40, Math.min(40, az)) - this.accel.z) * k;
    const fx = mass * ax - this.lastJ.x / dt, fz = mass * az - this.lastJ.z / dt;
    // Dónde actúa cada fuerza: el agarre o un empujón del sofá, en el tronco; un bordillo, en los pies.
    // La aceleración propia (el control) también va por los pies, pero casi toda está anticipada.
    const upper = (this.joint || contact.sofa) && !contact.obstacle;
    // El empuje medido tiene ruido de contacto paso a paso: se suaviza (0,18 s)
    const kf = Math.min(1, dt / 0.18);
    this.force.x += ((upper ? fx : 0) - this.force.x) * kf;
    this.force.z += ((upper ? fz : 0) - this.force.z) * kf;
    const cmdX = this.lastJ.x / (mass * dt), cmdZ = this.lastJ.z / (mass * dt);
    const fa = (n: number) => Math.max(-40, Math.min(40, n));
    const footX = fa(CHAR.clumsy * cmdX + (contact.obstacle ? fx / mass : 0));
    const footZ = fa(CHAR.clumsy * cmdZ + (contact.obstacle ? fz / mass : 0));
    this.footAccel.x += (footX - this.footAccel.x) * k;
    this.footAccel.z += (footZ - this.footAccel.z) * k;

    if (this.joint) {
      const g = this.grabWorld()!, h = this.handWorld();
      const braced = len2(this.wantVel) > 0.3;
      if (Math.hypot(g.x - h.x, g.y - h.y, g.z - h.z) > CHAR.gripBreak || len2(this.force) > (braced ? CHAR.gripForce : CHAR.gripForceLoose)) {
        this.release('se le escapa');
      }
    }

    if (this.state === 'falling') return this.updateFalling(dt);
    if (this.state === 'recovering') return this.updateRecovering(dt);

    // Tropiezo: el pie se engancha y el cuerpo sigue: giro sobre el punto de apoyo ω ≈ v/h
    this.tripCool = Math.max(0, this.tripCool - dt);
    if (contact.obstacle && contact.obstacleNormal && this.reactions && this.tripCool === 0) {
      const n = contact.obstacleNormal; // normal hacia el porteador
      const into = -(this.v0.x * n.x + this.v0.z * n.z);
      if (into > 0.6 && this.stateTime > 0.15) {
        const w = (into / CHAR.comHeight) * CHAR.tripCatch * this.intensity;
        this.leanVel.x += -n.x * w; this.leanVel.z += -n.z * w;
        this.tripCool = 0.6;
        this.events.push('tropieza');
      }
    }

    // Péndulo invertido alrededor de la postura buscada. La gravedad agranda la desviación; la desequilibran
    // los golpes en los pies, la torpeza al arrancar y frenar y la parte inesperada de la fuerza en el tronco.
    // El control (tobillos, cadera o pasos) es limitado.
    const s = this.reactions ? this.intensity : 0;
    const g = 9.81, h = CHAR.comHeight;
    // Fuerza esperada: la medida, con retraso. Lo que desequilibra es lo que cambia más deprisa que eso.
    const ka = Math.min(1, dt / CHAR.adapt);
    this.forceExp.x += (this.force.x - this.forceExp.x) * ka;
    this.forceExp.z += (this.force.z - this.forceExp.z) * ka;
    // Tirando activamente, la tensión que crece la genera él mismo (la anticipa); solo le sorprende que
    // la tensión caiga de golpe (el sofá cede), y eso le echa hacia atrás. Sujetando sin tirar, o si el
    // sofá le golpea, cualquier cambio brusco (tirón, empujón) le sorprende.
    let sx = this.force.x - this.forceExp.x, sz = this.force.z - this.forceExp.z;
    const pullingHard = this.joint && len2(this.wantVel) > 0.3;
    const fe = len2(this.forceExp);
    if (pullingHard && fe > 1) {
      const ux0 = this.forceExp.x / fe, uz0 = this.forceExp.z / fe; // hacia el sofá
      const drop = Math.max(0, fe - (this.force.x * ux0 + this.force.z * uz0));
      sx = -ux0 * drop; sz = -uz0 * drop;
    }
    const want = this.reactions && (this.joint || contact.sofa)
      ? { x: (-CHAR.pullLean * this.forceExp.x) / (mass * g), z: (-CHAR.pullLean * this.forceExp.z) / (mass * g) } // se cuelga en contra del tirón
      : { x: this.wantVel.x * 0.025, z: this.wantVel.z * 0.025 };
    const tl = len2(want);
    if (tl > 0.42) { want.x *= 0.42 / tl; want.z *= 0.42 / tl; }
    // La postura buscada (voluntaria) cambia a velocidad limitada: colgarse del sofá lleva un momento
    const dx = want.x - this.leanTarget.x, dz = want.z - this.leanTarget.z, dl = Math.hypot(dx, dz), maxStep = 0.9 * dt;
    this.leanTarget = dl > maxStep ? { x: this.leanTarget.x + (dx * maxStep) / dl, z: this.leanTarget.z + (dz * maxStep) / dl } : want;
    // La desviación involuntaria es un péndulo invertido: la gravedad la agranda; el control es limitado
    // (tobillos y cadera de pie; pasos, con más margen, cuando ya ha perdido el equilibrio)
    const umax = this.state === 'losingBalance' ? CHAR.stepMax : CHAR.ankleMax;
    const D = this.leanDev, W = this.leanVel;
    let ux = -CHAR.kp * D.x - CHAR.kd * W.x, uz = -CHAR.kp * D.z - CHAR.kd * W.z;
    const u = Math.hypot(ux, uz);
    if (u > umax) { ux *= umax / u; uz *= umax / u; }
    const dist = (n: number) => Math.max(-25, Math.min(25, n));
    // Si estaba colgado del sofá, perder ese apoyo desequilibra con la misma ganancia con la que se colgaba
    const kh = this.joint || contact.sofa ? CHAR.releaseGain : 1;
    W.x += ((g / h) * D.x + dist(s * ((kh * sx) / (mass * h) - this.footAccel.x / h)) + ux) * dt;
    W.z += ((g / h) * D.z + dist(s * ((kh * sz) / (mass * h) - this.footAccel.z / h)) + uz) * dt;
    D.x += W.x * dt; D.z += W.z * dt;
    if (!this.reactions) { D.x *= 0.9; D.z *= 0.9; W.x *= 0.9; W.z *= 0.9; }
    this.lean = { x: this.leanTarget.x + D.x, z: this.leanTarget.z + D.z };
    // Se pierde el equilibrio por desviarse de la postura buscada; se cae por inclinación total o desviación grande
    const l = len2(D), total = len2(this.lean);

    // Estado
    if (this.state === 'losingBalance') {
      this.stumbleTime += dt;
      this.calmTime = l < CHAR.regainBelow ? this.calmTime + dt : 0;
      const tooMuch = total > CHAR.fallAt || l > CHAR.fallAt * 0.75;
      if ((tooMuch && (this.stumbleTime > CHAR.stumbleMin || l > 1.1)) || (this.stumbleTime > CHAR.stumbleMaxTime && l > CHAR.loseAt)) return this.startFall();
      if (this.calmTime > 0.25) { this.set(this.resumeState === 'pulling' && !this.joint ? 'idle' : this.resumeState); this.events.push('recupera'); }
      return;
    }
    if (l > CHAR.loseAt) {
      this.resumeState = this.joint ? 'grabbing' : 'idle';
      this.stumbleTime = 0; this.calmTime = 0;
      this.set('losingBalance');
      this.events.push('desequilibrio');
      return;
    }
    const vh = Math.hypot(v.x, v.z), wantSpeed = len2(this.wantVel);
    if (this.joint) this.set(wantSpeed > 0.3 || this.effort > 0.55 ? 'pulling' : this.state === 'grabbing' || this.stateTime > 0.3 ? 'grabbing' : this.state);
    else this.set(vh > 0.35 || wantSpeed > 0.3 ? 'walking' : 'idle');
  }

  /** Se cae: la cápsula se desbloquea con la inclinación y el giro que llevaba; la gravedad hace el resto. */
  private startFall() {
    this.release('suelta al caer');
    const l = len2(this.lean) || 1e-6;
    const dir = { x: this.lean.x / l, z: this.lean.z / l };
    const ang = Math.min(l, 0.9);
    const axis = { x: dir.z, y: 0, z: -dir.x };
    const s = Math.sin(ang / 2), q = { x: axis.x * s, y: 0, z: axis.z * s, w: Math.cos(ang / 2) };
    const p = this.pos;
    const foot = { x: p.x, y: p.y - CENTER_Y, z: p.z };
    // Centro = pie + R·(0, CENTER_Y, 0): gira alrededor del apoyo, sin hundirse en el suelo
    const ry = { x: 2 * (q.x * q.y - q.w * q.z), y: 1 - 2 * (q.x * q.x + q.z * q.z), z: 2 * (q.y * q.z + q.w * q.x) };
    this.body.lockRotations(false, true);
    // En el suelo roza como un cuerpo (de pie no: lo mueve el control)
    this.collider.setFriction(0.9);
    this.collider.setFrictionCombineRule(this.R.CoefficientCombineRule.Average);
    this.body.setTranslation({ x: foot.x + ry.x * CENTER_Y, y: foot.y + ry.y * CENTER_Y + 0.02, z: foot.z + ry.z * CENTER_Y }, true);
    this.body.setRotation(q, true);
    const w = Math.max(2.2, len2(this.leanVel));
    this.body.setAngvel({ x: axis.x * w, y: 0, z: axis.z * w }, true);
    const v = this.body.linvel();
    this.body.setLinvel({ x: v.x + dir.x * 0.6, y: v.y, z: v.z + dir.z * 0.6 }, true);
    this.falls++;
    this.lying = 0;
    this.set('falling');
    this.events.push('cae');
  }

  private updateFalling(dt: number) {
    const q = this.body.rotation();
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z); // componente vertical del eje de la cápsula
    const w = this.body.angvel(), v = this.body.linvel();
    const still = Math.hypot(w.x, w.y, w.z) < 1.2 && Math.hypot(v.x, v.y, v.z) < 0.8;
    if (upY < 0.55 && still) this.lying += dt;
    if (this.lying > CHAR.lieTime || this.stateTime > 4) {
      this.recoverFrom = { p: { ...this.pos }, q: { ...q } as RAPIER.Rotation };
      this.body.setBodyType(this.R.RigidBodyType.KinematicPositionBased, true);
      this.set('recovering');
      this.events.push('se levanta');
    }
  }

  private updateRecovering(_dt: number) {
    const from = this.recoverFrom!;
    const t = Math.min(1, this.stateTime / CHAR.recoverTime);
    const e = t * t * (3 - 2 * t);
    // Se incorpora alrededor de los pies: rotación hacia vertical y el centro sube a su altura
    const q0 = from.q;
    const dot = q0.w; // con la identidad
    const sgn = dot < 0 ? -1 : 1;
    let qx = q0.x * sgn * (1 - e), qy = q0.y * sgn * (1 - e), qz = q0.z * sgn * (1 - e), qw = q0.w * sgn * (1 - e) + e;
    const n = Math.hypot(qx, qy, qz, qw); qx /= n; qy /= n; qz /= n; qw /= n;
    const footY = this.footGround(from.p, 0);
    const target = { x: from.p.x, y: footY + CENTER_Y + 0.01, z: from.p.z };
    this.body.setNextKinematicRotation({ x: qx, y: qy, z: qz, w: qw });
    this.body.setNextKinematicTranslation({ x: from.p.x + (target.x - from.p.x) * e, y: from.p.y + (target.y - from.p.y) * e, z: from.p.z + (target.z - from.p.z) * e });
    if (t >= 1) {
      this.body.setBodyType(this.R.RigidBodyType.Dynamic, true);
      this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      this.body.lockRotations(true, true);
      this.collider.setFriction(0);
      this.collider.setFrictionCombineRule(this.R.CoefficientCombineRule.Min);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      this.lean = { x: 0, z: 0 }; this.leanVel = { x: 0, z: 0 }; this.leanTarget = { x: 0, z: 0 }; this.leanDev = { x: 0, z: 0 };
      this.forceExp = { x: 0, z: 0 };
      this.force = { x: 0, z: 0 }; this.accel = { x: 0, z: 0 }; this.footAccel = { x: 0, z: 0 };
      this.set('idle');
      this.events.push('de pie');
    }
  }

  /** Altura del suelo bajo un punto (rayo hacia abajo, ignorando al propio porteador). */
  private footGround(p: Vec3, fallback: number) {
    const ray = new this.R.Ray({ x: p.x, y: p.y + 1, z: p.z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, 4, true, undefined, undefined, undefined, this.body);
    return hit ? p.y + 1 - hit.timeOfImpact : fallback;
  }
}
