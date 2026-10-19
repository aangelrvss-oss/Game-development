// Arnés sin navegador para medir la VISTA real del juego (src/view/*) en Node con vite-node.
// - Simula `document`/`window` con un canvas 2D falso (solo para que las texturas de canvas se puedan crear).
// - Construye un WorldView sin WebGLRenderer (Object.create + campos a mano) y con un renderer.render vacío,
//   de modo que attach() y render() ejecutan EXACTAMENTE el código de sincronización de src/view (muñecos,
//   sofá, cámara, oclusión) igual que main.ts, pero sin dibujar píxeles.
// No modifica nada del repositorio.
import * as THREE from 'three';

const fakeCtx = () => {
  const store: Record<string | symbol, unknown> = {};
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s: string) => ({ width: String(s).length * 20 });
      if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      if (k === 'getImageData' || k === 'createImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
};
/** Instala un `document` y un `window` mínimos (canvas 2D falso). */
export function installDomShim() {
  const g = globalThis as unknown as Record<string, unknown>;
  g.document ??= { createElement: () => { const ctx = fakeCtx(); return { width: 300, height: 150, style: {}, getContext: () => ctx, addEventListener() {} }; } };
  // Rapier (wasm) toma `window.performance.now()` para sus contadores si existe `window`: hay que dárselo.
  g.window ??= { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, addEventListener() {}, performance: globalThis.performance };
}

export async function headlessWorld(w = 1280, h = 720) {
  installDomShim();
  const { WorldView } = await import('../../../src/view/world.ts');
  const { buildLevel } = await import('../../../src/view/levelView.ts');
  const { SofaView } = await import('../../../src/view/sofaView.ts');
  const { Fx } = await import('../../../src/view/fx.ts');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = Object.create(WorldView.prototype) as any;
  v.renderer = { render() {}, info: { render: {} }, setPixelRatio() {}, setSize() {} };
  v.scene = new THREE.Scene();
  v.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 400);
  v.camera.updateProjectionMatrix();
  v.level = buildLevel();
  v.fx = new Fx();
  v.sofa = new SofaView();
  v.carriers = []; v.cars = [];
  v.dynamic = new THREE.Group();
  v.sun = new THREE.DirectionalLight('#ffe9c7', 2.6);
  v.sun.castShadow = true;
  v.scene.add(v.sun, v.sun.target);
  v.camTarget = new THREE.Vector3(0, 0, 8); v.camDist = 1; v.ray = new THREE.Raycaster(); v.zoomOverride = null; v.jam = false;
  v.ratio = 1; v.maxRatio = 1; v.dtAvg = 1 / 60; v.adaptT = 0;
  v.scene.add(v.level.group, v.dynamic, v.fx.group);
  return v as InstanceType<typeof WorldView> & { [k: string]: any };
}
