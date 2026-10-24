import * as THREE from "three";
import { TUNING } from "@/config/tuning";
import { buildStaff } from "@/render/customers";
import { PALETTE, lambert } from "@/render/materials";

/**
 * The player's body for the security cameras. It sits on layer 2, which only the feed
 * cameras render, so the first-person view never sees it.
 */
export class PlayerBody {
  readonly group: THREE.Group;
  private readonly box: THREE.Mesh;
  private lastX = 0;
  private lastZ = 0;
  private stride = 0;

  constructor() {
    this.group = buildStaff();
    this.box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), lambert(PALETTE.box));
    this.box.position.set(0, 1.0, 0.4);
    this.box.visible = false;
    this.group.add(this.box);
    this.group.traverse((o) => o.layers.set(2));
  }

  sync(x: number, z: number, yaw: number, carrying: boolean, dt: number): void {
    const moved = Math.hypot(x - this.lastX, z - this.lastZ);
    this.lastX = x;
    this.lastZ = z;
    const walking = moved > 0.002;
    this.stride = walking ? this.stride + dt * 9 * (TUNING.player.walkSpeed / 1.2) : 0;
    const swing = walking ? Math.sin(this.stride) * 0.45 : 0;
    (this.group.getObjectByName("legL") as THREE.Object3D).rotation.x = swing;
    (this.group.getObjectByName("legR") as THREE.Object3D).rotation.x = -swing;
    this.group.position.set(x, 0, z);
    // The camera yaw of 0 looks down -Z; the body's front is +Z.
    this.group.rotation.y = yaw + Math.PI;
    this.box.visible = carrying;
  }
}
