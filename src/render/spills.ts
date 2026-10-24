import * as THREE from "three";
import type { GameState } from "@/game/state";

/** Dark wet patches on the floor, one per spill in the state. */
export class Spills {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly material = new THREE.MeshLambertMaterial({
    color: 0x3a2f24,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });

  sync(state: GameState): void {
    const seen = new Set<number>();
    for (const sp of state.spills) {
      seen.add(sp.id);
      let mesh = this.meshes.get(sp.id);
      if (!mesh) {
        mesh = new THREE.Mesh(blobGeometry(sp.id), this.material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(sp.x, 0.006, sp.z);
        this.meshes.set(sp.id, mesh);
        this.group.add(mesh);
      }
    }
    for (const [id, mesh] of this.meshes) {
      if (!seen.has(id)) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
        this.meshes.delete(id);
      }
    }
  }
}

/** An irregular puddle outline so no two spills look identical. */
function blobGeometry(seed: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.32 + 0.1 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 5 + seed * 1.7);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return new THREE.ShapeGeometry(shape, 8);
}
