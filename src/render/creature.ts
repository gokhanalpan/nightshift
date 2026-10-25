import * as THREE from "three";
import { TUNING } from "@/config/tuning";
import type { GameState } from "@/game/state";

/**
 * The thing at the end of the aisle. Customer-shaped, but not: too tall, arms too long, head
 * tilted, pale, and two dark eyes that catch no light. Faces the player. Slides sideways into
 * the shelves when looked at.
 */
export class Creature {
  readonly group = new THREE.Group();
  private readonly head: THREE.Mesh;

  constructor() {
    const pale = new THREE.MeshLambertMaterial({ color: 0xc9c0b6 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a2626 });
    const eye = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const h = 2.15;
    const legH = h * 0.5;
    const torsoH = h * 0.34;
    const headS = h * 0.11;
    for (const x of [-0.08, 0.08]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, legH, 0.14), dark);
      leg.position.set(x, legH / 2, 0);
      this.group.add(leg);
    }
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, torsoH, 0.2), dark);
    torso.position.y = legH + torsoH / 2;
    this.group.add(torso);
    for (const x of [-0.24, 0.24]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, torsoH * 1.35, 0.09), pale);
      arm.position.set(x, legH + torsoH * 0.25, 0);
      this.group.add(arm);
    }
    this.head = new THREE.Mesh(new THREE.BoxGeometry(headS * 1.2, headS * 1.7, headS * 1.2), pale);
    this.head.position.y = legH + torsoH + headS * 0.8;
    this.head.rotation.z = 0.28;
    this.group.add(this.head);
    for (const x of [-0.045, 0.045]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.01), eye);
      e.position.set(x, 0.03, headS * 0.61);
      this.head.add(e);
    }
    this.group.visible = false;
  }

  sync(state: GameState, time: number): void {
    const pk = state.peeker;
    if (!pk) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    let x = pk.x;
    let z = pk.z;
    let y = 0;
    if (pk.phase === "hiding") {
      const t = Math.min(1, (state.elapsed - pk.hideStart) / TUNING.peeker.hideSeconds);
      const e = t * t; // starts slow, then it's gone
      x = pk.x + (pk.hideX - pk.x) * e;
      z = pk.z + (pk.hideZ - pk.z) * e;
      y = -0.3 * e; // and sinks a little as it goes
    } else {
      // The slightest sway, like it's breathing wrong.
      this.head.rotation.z = 0.28 + Math.sin(time * 0.9) * 0.05;
    }
    this.group.position.set(x, y, z);
    // Always facing the player.
    const dx = state.player.x - x;
    const dz = state.player.z - z;
    this.group.rotation.y = Math.atan2(dx, dz);
  }
}
