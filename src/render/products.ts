import * as THREE from "three";
import { shelfSlots } from "@/game/layout";
import type { GameState } from "@/game/state";
import { PALETTE, lambert } from "@/render/materials";

/**
 * One mesh per shelf slot; visibility follows the slot's filled flag. Each empty slot also has
 * a small amber tag on the shelf edge that shows only while the player is carrying a box.
 */
export class Products {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly tags = new Map<string, THREE.Mesh>();
  private readonly tagMat = new THREE.MeshLambertMaterial({ color: 0xffb347, emissive: 0xffb347, emissiveIntensity: 1.6 });

  constructor() {
    for (const s of shelfSlots()) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(s.w, s.h, s.d),
        lambert(PALETTE.products[s.colorIndex % PALETTE.products.length]!),
      );
      mesh.position.set(s.x, s.y, s.z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.meshes.set(s.id, mesh);

      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.05, s.d * 0.9), this.tagMat);
      // on the outer edge of the shelf board, just under the slot
      tag.position.set(s.x + s.side * (s.w / 2 + 0.005), s.y - s.h / 2 - 0.045, s.z);
      tag.visible = false;
      this.group.add(tag);
      this.tags.set(s.id, tag);
    }
  }

  sync(state: GameState, time: number): void {
    const showTags = state.carrying > 0;
    this.tagMat.emissiveIntensity = 1.2 + Math.sin(time * 5) * 0.6;
    for (const [id, mesh] of this.meshes) {
      const filled = state.slots[id]?.filled ?? true;
      mesh.visible = filled;
      this.tags.get(id)!.visible = showTags && !filled;
    }
  }
}
