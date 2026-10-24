import * as THREE from "three";
import { TUNING } from "@/config/tuning";
import { listInteractables, type Interactable } from "@/game/chores";
import type { GameState } from "@/game/state";

const I = TUNING.interact;

/**
 * Picks which interactable the player is looking at: within range, and closest to the centre
 * of the view. No raycasting — a cone test against the sim's own list is enough for a shop.
 */
export function pickInteractable(state: GameState, camera: THREE.Camera): Interactable | null {
  const items = listInteractables(state);
  if (items.length === 0) return null;
  const eye = camera.position;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  let best: Interactable | null = null;
  let bestDot: number = I.cone;
  for (const it of items) {
    const dx = it.x - eye.x;
    const dy = it.y - eye.y;
    const dz = it.z - eye.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > I.range || dist < 1e-4) continue;
    const dot = (dx * forward.x + dy * forward.y + dz * forward.z) / dist;
    if (dot > bestDot) {
      bestDot = dot;
      best = it;
    }
  }
  return best;
}
