import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ZONES } from '../sim/lab';

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

/** Plató: suelo de estudio, zonas de prueba, luz cálida con contraluz frío y cámara orbital que sigue al muñeco. */
export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  controls: OrbitControls;
  private key: THREE.DirectionalLight;
  private target = new THREE.Vector3();
  gameView = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    const bg = new THREE.Color('#ece6f1');
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, 18, 42);

    this.scene.add(new THREE.HemisphereLight('#fff8f0', '#a89c94', 1.1));
    this.key = new THREE.DirectionalLight('#ffe7cc', 2.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6; sc.near = 1; sc.far = 40;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.scene.add(this.key, this.key.target);
    const rim = new THREE.DirectionalLight('#b9d4ff', 1.3);
    rim.position.set(-6, 5, -8);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight('#ffd9e8', 0.35);
    fill.position.set(8, 3, 6);
    this.scene.add(fill);

    this.buildFloor();
    this.camera.position.set(4.2, 2.6, 5.2);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.target.set(0, 0.7, 0);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private buildFloor() {
    // Suelo de estudio: gris cálido con retícula de 1 m muy suave
    const floorTex = canvasTex(512, 512, (ctx) => {
      ctx.fillStyle = '#ddd5cf'; ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = 'rgba(120,100,110,0.16)'; ctx.lineWidth = 3;
      for (let i = 0; i <= 512; i += 128) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke(); }
    }, [15, 15]);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Alfombra gruesa con flecos (prueba B)
    const c = ZONES.carpet;
    const rug = canvasTex(512, 384, (ctx) => {
      ctx.fillStyle = '#b44a3a'; ctx.fillRect(0, 0, 512, 384);
      ctx.strokeStyle = '#e8c27a'; ctx.lineWidth = 14; ctx.strokeRect(24, 24, 464, 336);
      ctx.strokeStyle = '#7d2c25'; ctx.lineWidth = 6; ctx.strokeRect(50, 50, 412, 284);
      ctx.fillStyle = '#e8c27a';
      for (let x = 110; x < 420; x += 70) for (let y = 110; y < 300; y += 70) { ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x + 18, y); ctx.lineTo(x, y + 18); ctx.lineTo(x - 18, y); ctx.fill(); }
      for (let i = 0; i < 4000; i++) { ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,230,200' : '60,10,10'},0.06)`; ctx.fillRect(Math.random() * 512, Math.random() * 384, 2, 2); }
    });
    const carpet = new THREE.Mesh(new THREE.BoxGeometry(c.x1 - c.x0, 0.02, c.z1 - c.z0), new THREE.MeshStandardMaterial({ map: rug, roughness: 1 }));
    carpet.position.set((c.x0 + c.x1) / 2, 0.01, (c.z0 + c.z1) / 2);
    carpet.receiveShadow = true;
    this.scene.add(carpet);
    for (const z of [c.z0, c.z1]) for (let x = c.x0 + 0.05; x < c.x1; x += 0.07) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.09), new THREE.MeshStandardMaterial({ color: '#efd9a6', roughness: 1 }));
      f.position.set(x, 0.004, z + (z === c.z0 ? -0.045 : 0.045));
      this.scene.add(f);
    }

    // Bordillo de hormigón con franjas de aviso (prueba C)
    const k = ZONES.curb;
    const stripes = canvasTex(256, 32, (ctx) => {
      ctx.fillStyle = '#f2c230'; ctx.fillRect(0, 0, 256, 32);
      ctx.fillStyle = '#26232b';
      for (let x = -32; x < 288; x += 32) { ctx.beginPath(); ctx.moveTo(x, 32); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 32, 0); ctx.lineTo(x + 16, 32); ctx.fill(); }
    }, [6, 1]);
    const curb = new THREE.Mesh(new RoundedBoxGeometry(k.w, k.h, k.d, 2, 0.02), [
      new THREE.MeshStandardMaterial({ color: '#bdb6b0', roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: '#bdb6b0', roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: '#cfc8c2', roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: '#bdb6b0', roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.7 }), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.7 }),
    ]);
    curb.position.set(k.x, k.h / 2, k.z);
    curb.castShadow = curb.receiveShadow = true;
    this.scene.add(curb);

    // Rampa encerada de baldosa azul, casi sin rozamiento (prueba D)
    const r = ZONES.ramp, run = r.z1 - r.z0, a = Math.atan2(r.top, run), len = Math.hypot(run, r.top), hy = 0.2;
    const tiles = canvasTex(256, 256, (ctx) => {
      ctx.fillStyle = '#8fc6e6'; ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#e9f6ff'; ctx.lineWidth = 6;
      for (let i = 0; i <= 256; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < 12; i++) ctx.fillRect(10 + i * 20, 10 + ((i * 37) % 200), 30, 4);
    }, [r.w / 1.2, len / 1.2]);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(r.w, hy * 2, len), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.12, metalness: 0.05 }));
    ramp.rotation.x = a;
    ramp.position.set(r.x, r.top / 2 - hy * Math.cos(a), (r.z0 + r.z1) / 2 - hy * Math.sin(a));
    ramp.castShadow = ramp.receiveShadow = true;
    this.scene.add(ramp);
    // Muro bajo al fondo de la rampa (cierra la escena)
    const wall = new THREE.Mesh(new RoundedBoxGeometry(r.w, r.top + 0.4, 0.2, 2, 0.04), new THREE.MeshStandardMaterial({ color: '#c9c0d6', roughness: 0.9 }));
    wall.position.set(r.x, (r.top + 0.4) / 2, r.z0 - 0.1);
    wall.castShadow = wall.receiveShadow = true;
    this.scene.add(wall);

    // Letras pintadas en el suelo para reconocer cada zona
    const letter = (txt: string, sub: string, x: number, z: number) => {
      const t = canvasTex(256, 256, (ctx) => {
        ctx.fillStyle = 'rgba(80,60,90,0.5)'; ctx.font = '900 150px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, 128, 112);
        ctx.font = '700 30px system-ui, sans-serif'; ctx.fillText(sub, 128, 214);
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.003, z);
      this.scene.add(m);
    };
    letter('A', 'CAMINAR', -2.8, 2.6);
    letter('B', 'TIRAR', 2.6, -1.6);
    letter('C', 'TROPEZAR', ZONES.curb.x + 2.4, ZONES.curb.z - 2);
    letter('D', 'RAMPA ENCERADA', ZONES.ramp.x + 3.3, 1.8);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 55 : 38;
    this.camera.updateProjectionMatrix();
  }

  /** Vista de juego: cámara alta y oblicua como en la demo; vista de estudio: tres cuartos, a la altura del muñeco. */
  setGameView(on: boolean, test = 'A') {
    this.gameView = on;
    const t = this.controls.target;
    // En la vista de estudio, cada prueba tiene un ángulo que deja ver la cara y la causa del accidente
    const studio: Record<string, [number, number, number]> = {
      A: [-2.6, 1.7, -4.4], B: [4.6, 1.5, -1.9], C: [3.0, 1.7, 4.6], D: [4.4, 1.9, -0.6], libre: [3.6, 1.9, 4.6],
    };
    const off = on ? new THREE.Vector3(0, 7.2, 5.4) : new THREE.Vector3(...(studio[test] ?? studio.libre));
    this.camera.position.copy(t).add(off);
    this.controls.update();
  }

  /** La cámara acompaña al muñeco (y al sofá si está cerca) sin perder el ángulo que haya elegido el usuario. */
  follow(focus: THREE.Vector3, dt: number, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    this.target.copy(focus);
    const t = this.controls.target;
    const delta = this.target.clone().sub(t).multiplyScalar(k);
    t.add(delta);
    this.camera.position.add(delta);
    this.controls.update();
    this.key.position.set(t.x + 4, t.y + 9, t.z + 5);
    this.key.target.position.copy(t);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
