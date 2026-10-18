import * as THREE from 'three';

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Material plano y mate, con caché por color. */
export function mat(color: string, opts: { rough?: number; emissive?: string; transparent?: boolean; map?: THREE.Texture; metal?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${opts.rough ?? 0.85}|${opts.emissive ?? ''}|${opts.transparent ? 1 : 0}|${opts.map?.uuid ?? ''}|${opts.metal ?? 0}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.85,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ?? '#000000',
      transparent: opts.transparent ?? false,
      map: opts.map ?? null,
    });
    cache.set(key, m);
  }
  return m;
}

/** Material propio (no compartido), para lo que cambia de opacidad o de color. */
export function ownMat(color: string, opts: { rough?: number; emissive?: string; map?: THREE.Texture } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85, metalness: 0, emissive: opts.emissive ?? '#000000', map: opts.map ?? null });
}

export const PALETTE = {
  grass: '#8fd16a',
  grassDark: '#6fbf52',
  road: '#4a4f5c',
  sidewalk: '#d9d4cc',
  stripe: '#f8f5ec',
  facade: '#f6a38f',
  facadeTrim: '#e07a5f',
  wall: '#fbe9c9',
  block: '#f4c7a1',
  roof: '#c8553d',
  floor: '#d9a066',
  stairs: '#c98b52',
  ramp: '#9aa7b8',
  hedge: '#3f9d4b',
  fence: '#f8fafc',
  house: '#fde7b0',
  truck: '#f8fafc',
  zone: '#22c55e',
  sky: '#9fd8ff',
  outline: '#2a2140',
};
