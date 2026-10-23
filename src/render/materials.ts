import * as THREE from "three";

/** Flat-colour palette. The lighting does the mood work; these stay plain. */
export const PALETTE = {
  floorTile: 0x8d8f86,
  floorGrout: 0x6f716a,
  wall: 0xc9c3b0,
  ceiling: 0xd8d4c6,
  trim: 0x2a2a2a,
  counter: 0x6b4e35,
  counterTop: 0xb9b4a4,
  shelfMetal: 0x5c6670,
  shelfBoard: 0xd6d1c2,
  fridgeBody: 0xe7e8e4,
  fridgeGlass: 0x5f8fb0,
  door: 0x7a6a55,
  doorFrame: 0x3b332a,
  glass: 0x7fa3bb,
  asphalt: 0x2a2c2e,
  roadLine: 0x9a9480,
  pole: 0x3a3d40,
  lampWarm: 0xffb45e,
  dumpster: 0x2f5a3e,
  shelterRoof: 0x44484c,
  shelterPost: 0x7b7f84,
  box: 0xa67b49,
  fuseBox: 0x7a7f86,
  fluorescent: 0xfaf6e8,
  // product colours, cycled on the shelves
  products: [0xd94c3d, 0x3d7bd9, 0xe8c547, 0x4aa36c, 0xf2f2f2, 0x9b59b6, 0xff8c42, 0x2c3e50],
} as const;

const cache = new Map<string, THREE.Material>();

export function lambert(color: number, opts: { emissive?: number; emissiveIntensity?: number } = {}): THREE.MeshLambertMaterial {
  const key = `l:${color}:${opts.emissive ?? 0}:${opts.emissiveIntensity ?? 0}`;
  let m = cache.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    if (opts.emissive !== undefined) {
      m.emissive = new THREE.Color(opts.emissive);
      m.emissiveIntensity = opts.emissiveIntensity ?? 1;
    }
    cache.set(key, m);
  }
  return m;
}

export function glassMaterial(): THREE.MeshLambertMaterial {
  const key = "glass";
  let m = cache.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color: PALETTE.glass,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    cache.set(key, m);
  }
  return m;
}

/** Axis-aligned box the player cannot walk through. */
export interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Adds a box mesh centred at (x, y, z) with the given size, and optionally registers it
 * as a collider. Most of the store is built from this one helper.
 */
export function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  pos: [number, number, number],
  material: THREE.Material,
  colliders?: Collider[],
  opts: { castShadow?: boolean; receiveShadow?: boolean } = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos);
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = opts.receiveShadow ?? true;
  parent.add(mesh);
  if (colliders) {
    colliders.push({
      minX: pos[0] - size[0] / 2,
      maxX: pos[0] + size[0] / 2,
      minZ: pos[2] - size[2] / 2,
      maxZ: pos[2] + size[2] / 2,
    });
  }
  return mesh;
}

/** A sign: text drawn on a small canvas, so there are no font/texture assets to ship. */
export function textPlane(
  text: string,
  opts: { width: number; height: number; bg: string; fg: string; font?: string; pixelsPerMetre?: number },
): THREE.Mesh {
  const ppm = opts.pixelsPerMetre ?? 256;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(32, Math.round(opts.width * ppm));
  canvas.height = Math.max(32, Math.round(opts.height * ppm));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = opts.fg;
  ctx.font = opts.font ?? `bold ${Math.round(canvas.height * 0.55)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(opts.width, opts.height), mat);
  return mesh;
}
