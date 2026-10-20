import * as THREE from 'three';
import type { Game } from '../sim/game';
import { buildLevel, type LevelView } from './levelView';
import { SofaView } from './sofaView';
import { CarrierView } from './carrierView';
import { DollView } from './doll/dollView';
import { CarView } from './carView';
import { Fx } from './fx';
import { PALETTE } from './materials';

/** Escena 3D: luz, cámara que sigue al grupo y sincronización con la simulación. */
export class WorldView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  level: LevelView;
  fx = new Fx();
  sofa = new SofaView();
  /** Jugadores humanos: muñeco del laboratorio; ayudantes de la máquina: el reparto original. */
  carriers: (CarrierView | DollView)[] = [];
  cars: CarView[] = [];
  private dynamic = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private camTarget = new THREE.Vector3(0, 0, 8);
  private camDist = 1;
  private ray = new THREE.Raycaster();
  private zoomOverride: number | null = null;
  private jam = false;
  private ratio: number;
  private maxRatio: number;
  private dtAvg = 1 / 60;
  private adaptT = 0;
  setZoomOverride(k: number | null) { this.zoomOverride = k; }

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.maxRatio = Math.min(window.devicePixelRatio, 2);
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.sky, 45, 110);
    this.scene.add(new THREE.HemisphereLight('#eaf4ff', '#8a7a5a', 1.15));
    // Sol cálido de media tarde y un relleno frío desde el otro lado: volumen sin sombras negras
    this.sun = new THREE.DirectionalLight('#ffe9c7', 2.6);
    const fill = new THREE.DirectionalLight('#b9d7ff', 0.55);
    fill.position.set(-20, 15, -10);
    this.scene.add(fill);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);
    this.level = buildLevel();
    this.scene.add(this.level.group, this.dynamic, this.fx.group);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * Resolución adaptable: si los fotogramas tardan demasiado (móvil modesto, render por software),
   * baja la densidad de píxeles hasta la mitad; si sobra margen, la vuelve a subir.
   */
  adapt(dtReal: number) {
    this.dtAvg += (dtReal - this.dtAvg) * 0.1;
    this.adaptT += dtReal;
    if (this.adaptT < 1) return;
    let r = this.ratio;
    if (this.dtAvg > 1 / 28) r = Math.max(0.5, r - 0.25);
    else if (this.dtAvg < 1 / 50) r = Math.min(this.maxRatio, r + 0.25);
    this.adaptT = 0;
    if (r !== this.ratio) {
      // Tras subir, espera más antes de volver a decidir (evita oscilar)
      if (r > this.ratio) this.adaptT = -3;
      this.ratio = r;
      this.renderer.setPixelRatio(r);
      this.resize();
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // En pantallas estrechas, más campo de visión para no perder a nadie
    this.camera.fov = w / h < 1 ? 58 : 42;
    this.camera.updateProjectionMatrix();
  }

  /** Crea las vistas para una partida nueva. */
  attach(game: Game) {
    // Libera las vistas de la partida anterior (reiniciar no debe ir acumulando memoria de vídeo)
    for (const v of this.carriers) v.dispose();
    for (const v of this.cars) v.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.sofa.reset();
    this.dynamic.clear();
    this.fx.clear();
    this.dynamic.add(this.sofa.group, this.sofa.warning);
    this.carriers = game.carriers.map((c) => (c.human !== null ? new DollView(c, c.human, game.world, this.camera, this.fx) : new CarrierView(c, c.human, this.fx, game.world)));
    for (const v of this.carriers) { this.dynamic.add(v.group, ...v.worldObjects()); }
    this.cars = game.cars.map((c) => new CarView(c));
    for (const v of this.cars) this.dynamic.add(v.group);
    const s = game.sofaPos;
    this.camTarget.set(s.x, s.y, s.z);
  }

  render(game: Game, t: number, dt: number) {
    this.sofa.sync(game.sofa, game.sofaItem.integrity, game.sofaUp, t, dt);
    for (const v of this.carriers) {
      const g = v.carrier.grabWorld();
      v.sync(g ? new THREE.Vector3(g.x, g.y, g.z) : null, t, dt);
    }
    for (const v of this.cars) v.sync(dt);
    // Atasco: aviso flotante una vez por atasco
    if (game.phase === 'playing' && game.stuckTime > 1.5 && !this.jam) { this.jam = true; this.fx.text(game.sofaPos, '¡ATASCO!', '#ffffff', 42, '#ea580c', 2); }
    if (game.stuckTime < 0.2) this.jam = false;
    this.level.update(t, game.light, game.stage >= 5, game.stage, game.sofaPos);
    this.fx.update(dt);
    this.updateCamera(game, dt);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(game: Game, dt: number) {
    // Objetivo: el sofá, desplazado un poco hacia donde va y hacia los humanos
    const s = game.sofaPos, v = game.sofa.linvel();
    const humans = game.carriers.filter((c) => c.human !== null);
    let hx = s.x, hz = s.z, spread = 0;
    if (humans.length) {
      hx = humans.reduce((a, c) => a + c.pos.x, 0) / humans.length;
      hz = humans.reduce((a, c) => a + c.pos.z, 0) / humans.length;
    }
    for (const c of game.carriers) spread = Math.max(spread, Math.hypot(c.pos.x - s.x, c.pos.z - s.z));
    const tx = s.x * 0.75 + hx * 0.25 + v.x * 0.35;
    const tz = s.z * 0.75 + hz * 0.25 + v.z * 0.35 - 0.8;
    const ty = Math.max(0, s.y - 0.6);
    const k = 1 - Math.exp(-dt * 3);
    this.camTarget.x += (tx - this.camTarget.x) * k;
    this.camTarget.y += (ty - this.camTarget.y) * k;
    this.camTarget.z += (tz - this.camTarget.z) * k;
    const want = this.zoomOverride ?? 1 + Math.min(0.6, Math.max(0, spread - 3) * 0.08);
    this.camDist += (want - this.camDist) * k;
    const shake = this.fx.shake;
    // Algo más baja y cerca que una vista cenital: se leen las siluetas y las caras de lado
    // Unos 53° de inclinación: las cabezas tapan poco el sofá y aún se ven perfiles y caras de lado
    const off = new THREE.Vector3(0, 8.5, 6.3).multiplyScalar(this.camDist);
    this.camera.position.copy(this.camTarget).add(off);
    if (shake > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
    this.camera.lookAt(this.camTarget);
    // La luz del sol sigue a la acción para que las sombras sean nítidas
    this.sun.position.set(this.camTarget.x + 14, this.camTarget.y + 30, this.camTarget.z + 10);
    this.sun.target.position.copy(this.camTarget);
    this.fadeOccluders(game, dt);
  }

  /**
   * Corte de las paredes que tapan la acción (como una maqueta): la pared baja hasta un zócalo opaco
   * en vez de volverse un fantasma translúcido. Ventanas, toldos y dinteles se ocultan.
   * Se comprueba contra el volumen original de cada pieza, para que al recortarla no deje de «tapar» y oscile.
   */
  private fadeOccluders(game: Game, dt: number) {
    const pts = [game.sofaPos];
    for (const c of game.carriers) {
      if (c.human === null) continue;
      const p = c.pos;
      pts.push(p);
      // Tumbado: el centro del collider tumbado, que es donde se dibuja el cuerpo
      if (c.down) { const k = c.collider.translation(); pts.push({ x: k.x, y: k.y, z: k.z }); }
    }
    const hit = new Set<THREE.Object3D>();
    const from = this.camera.position;
    const tmp = new THREE.Vector3();
    for (const p of pts) {
      const to = new THREE.Vector3(p.x, p.y + 0.4, p.z);
      const dist = to.distanceTo(from);
      this.ray.ray.set(from, to.sub(from).normalize());
      for (const m of this.level.fadeables) {
        const box = m.userData.box as THREE.Box3;
        if (this.ray.ray.intersectBox(box, tmp) && tmp.distanceTo(from) < dist - 0.3) hit.add(m);
      }
    }
    const s = game.sofaPos;
    const k = 1 - Math.exp(-Math.max(dt, 1 / 60) * 10);
    for (const m of this.level.fadeables) {
      const rule = m.userData.fadeRule as ((x: number, y: number, z: number) => boolean) | undefined;
      if (rule && rule(s.x, s.y, s.z)) hit.add(m);
      const u = m.userData as { cut: number; mode: 'cut' | 'hide'; box: THREE.Box3 };
      u.cut ??= 1;
      u.cut += ((hit.has(m) ? 0 : 1) - u.cut) * k;
      if (u.mode === 'hide') { m.visible = u.cut > 0.5; continue; }
      const full = u.box.max.y - u.box.min.y, stub = Math.min(0.4, full);
      const h = stub + (full - stub) * u.cut;
      m.scale.y = h / full;
      m.position.y = u.box.min.y + h / 2;
    }
  }
}
