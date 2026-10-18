import * as THREE from 'three';
import type { Game } from '../sim/game';
import { buildLevel, type LevelView } from './levelView';
import { SofaView } from './sofaView';
import { CarrierView } from './carrierView';
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
  carriers: CarrierView[] = [];
  cars: CarView[] = [];
  private dynamic = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private camTarget = new THREE.Vector3(0, 0, 8);
  private camDist = 1;
  private ray = new THREE.Raycaster();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.sky, 45, 110);
    this.scene.add(new THREE.HemisphereLight('#e8f6ff', '#7a8f5a', 1.25));
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.3);
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
    this.dynamic.clear();
    this.fx.clear();
    this.dynamic.add(this.sofa.group, this.sofa.warning);
    this.carriers = game.carriers.map((c) => new CarrierView(c, c.human));
    for (const v of this.carriers) { this.dynamic.add(v.group, ...v.worldObjects()); }
    this.cars = game.cars.map((c) => new CarView(c));
    for (const v of this.cars) this.dynamic.add(v.group);
    const s = game.sofaPos;
    this.camTarget.set(s.x, s.y, s.z);
  }

  render(game: Game, t: number, dt: number) {
    this.sofa.sync(game.sofa, game.integrity, game.sofaUp, t);
    for (const v of this.carriers) {
      const g = v.carrier.grabWorld(game.sofa);
      v.sync(g ? new THREE.Vector3(g.x, g.y, g.z) : null, t, dt);
    }
    for (const v of this.cars) v.sync(dt);
    this.level.update(t, game.light, game.stage >= 5, game.stage);
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
    const tz = s.z * 0.75 + hz * 0.25 + v.z * 0.35 - 1.2;
    const ty = Math.max(0, s.y - 0.6);
    const k = 1 - Math.exp(-dt * 3);
    this.camTarget.x += (tx - this.camTarget.x) * k;
    this.camTarget.y += (ty - this.camTarget.y) * k;
    this.camTarget.z += (tz - this.camTarget.z) * k;
    const want = 1 + Math.min(0.6, Math.max(0, spread - 3) * 0.08);
    this.camDist += (want - this.camDist) * k;
    const shake = this.fx.shake;
    const off = new THREE.Vector3(0, 11, 8.6).multiplyScalar(this.camDist);
    this.camera.position.copy(this.camTarget).add(off);
    if (shake > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
    this.camera.lookAt(this.camTarget);
    // La luz del sol sigue a la acción para que las sombras sean nítidas
    this.sun.position.set(this.camTarget.x + 14, this.camTarget.y + 30, this.camTarget.z + 10);
    this.sun.target.position.copy(this.camTarget);
    this.fadeOccluders(game);
  }

  /** Vuelve translúcidas las paredes que quedan entre la cámara y el grupo. */
  private fadeOccluders(game: Game) {
    const pts = [game.sofaPos, ...game.carriers.filter((c) => c.human !== null).map((c) => c.pos)];
    const hit = new Set<THREE.Object3D>();
    for (const p of pts) {
      const to = new THREE.Vector3(p.x, p.y + 0.4, p.z);
      const from = this.camera.position.clone();
      const dir = to.clone().sub(from);
      const dist = dir.length();
      this.ray.set(from, dir.normalize());
      this.ray.far = dist - 0.3;
      for (const h of this.ray.intersectObjects(this.level.fadeables, false)) hit.add(h.object);
    }
    // Reglas fijas: la fachada se aclara al acercarse a la puerta; la pared sur del pasillo de arriba, al subir.
    const s = game.sofaPos;
    for (const m of this.level.fadeables) {
      const rule = m.userData.fadeRule as ((x: number, y: number, z: number) => boolean) | undefined;
      if (rule && rule(s.x, s.y, s.z)) hit.add(m);
    }
    for (const m of this.level.fadeables) {
      const mm = (m as THREE.Mesh).material as THREE.MeshStandardMaterial;
      const target = hit.has(m) ? 0.22 : 1;
      mm.transparent = true;
      mm.opacity += (target - mm.opacity) * 0.2;
      mm.depthWrite = mm.opacity > 0.95;
    }
  }
}
