import * as THREE from "three";
import type { GameState } from "@/game/state";
import { buildCart } from "@/render/customers";

/** The cart anomaly: an empty cart, placed by the state, nudged into a slight wrong angle. */
export class CartProp {
  readonly group: THREE.Group;

  constructor() {
    this.group = buildCart(false);
    this.group.visible = false;
  }

  sync(state: GameState): void {
    const c = state.cart;
    if (!c) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.position.set(c.x, 0, c.z);
    // Handle toward the player, as if someone had just let go of it.
    this.group.rotation.y = Math.atan2(state.player.x - c.x, state.player.z - c.z) + Math.PI + 0.15 * (c.stage % 2 ? 1 : -1);
  }
}
