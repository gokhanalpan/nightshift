import * as THREE from "three";
import { TUNING } from "@/config/tuning";
import type { Collider } from "@/render/materials";

const P = TUNING.player;

/**
 * Walks the camera around the store. Owns the input state; does not know about game rules.
 * Collision is a circle (the player) against axis-aligned boxes, resolved one axis at a time
 * so the player slides along walls instead of sticking to them.
 */
export class PlayerController {
  readonly camera: THREE.PerspectiveCamera;
  readonly position = new THREE.Vector3();
  yaw: number;
  pitch = 0;
  /** True while the pointer is locked to the canvas. */
  locked = false;
  /** Set to false to freeze movement (menus, endings). Looking still works. */
  canMove = true;

  private readonly keys = new Set<string>();
  private readonly colliders: Collider[];
  private readonly element: HTMLElement;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly onLockChange: (() => void)[] = [];

  constructor(camera: THREE.PerspectiveCamera, element: HTMLElement, colliders: Collider[]) {
    this.camera = camera;
    this.element = element;
    this.colliders = colliders;
    this.position.set(P.spawn.x, P.eyeHeight, P.spawn.z);
    this.yaw = P.spawn.yaw;
    this.camera.rotation.order = "YXZ";
    this.applyToCamera();

    document.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
    });
    document.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    document.addEventListener("mousemove", (e) => this.onMouseMove(e));
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.keys.clear();
      for (const cb of this.onLockChange) cb();
    });
  }

  requestLock(): void {
    this.element.requestPointerLock();
  }

  onLock(cb: () => void): void {
    this.onLockChange.push(cb);
  }

  update(dt: number): void {
    if (this.locked && this.canMove) {
      let mx = 0;
      let mz = 0;
      if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) mz += 1;
      if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) mz -= 1;
      if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) mx += 1;
      if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) mx -= 1;

      if (mx !== 0 || mz !== 0) {
        this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const step = P.walkSpeed * dt;
        const len = Math.hypot(mx, mz);
        const dx = (this.forward.x * mz + this.right.x * mx) / len * step;
        const dz = (this.forward.z * mz + this.right.z * mx) / len * step;
        this.moveWithCollision(dx, dz);
      }
    }
    this.applyToCamera();
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.locked) return;
    this.yaw -= e.movementX * P.mouseSensitivity;
    this.pitch -= e.movementY * P.mouseSensitivity;
    this.pitch = Math.max(-P.maxPitch, Math.min(P.maxPitch, this.pitch));
  }

  private moveWithCollision(dx: number, dz: number): void {
    // X first, then Z. Each axis backs out of any box it would overlap.
    this.position.x += dx;
    if (this.overlaps()) this.position.x -= dx;
    this.position.z += dz;
    if (this.overlaps()) this.position.z -= dz;
  }

  private overlaps(): boolean {
    const r = P.radius;
    const px = this.position.x;
    const pz = this.position.z;
    for (const c of this.colliders) {
      // closest point on the box to the player's centre
      const cx = Math.max(c.minX, Math.min(px, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pz, c.maxZ));
      const ddx = px - cx;
      const ddz = pz - cz;
      if (ddx * ddx + ddz * ddz < r * r) return true;
    }
    return false;
  }

  private applyToCamera(): void {
    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
