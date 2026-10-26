import * as THREE from "three";
import { TUNING } from "@/config/tuning";
import type { GameState } from "@/game/state";

/**
 * The hanging man: a plain dark figure, limp, feet off the floor, turning slowly. Behind him a
 * cold light that only comes up once he's been seen. When he rushes, the whole group moves.
 */
export class Hanging {
  readonly group = new THREE.Group();
  readonly backlight: THREE.PointLight;
  /** One cold tube directly above him, the only light in the room once he's been seen. */
  readonly tube: THREE.SpotLight;
  private readonly tubeMesh: THREE.Mesh;
  private readonly rope: THREE.Mesh;
  private readonly body = new THREE.Group();
  private readonly head: THREE.Mesh;
  private drop = 0;
  private tilt = 0;
  private faceUp = 0;

  constructor() {
    const dark = new THREE.MeshLambertMaterial({ color: 0x0e0f12 });
    const skin = new THREE.MeshLambertMaterial({ color: 0x24211f });
    const legH = 0.92;
    const torsoH = 0.6;
    // Straight and limp: legs together, arms flat against the sides, feet pointing down.
    for (const x of [-0.08, 0.08]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, legH, 0.16), dark);
      leg.position.set(x, legH / 2, 0);
      this.body.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.1), dark);
      foot.position.set(x, -0.08, 0.02);
      this.body.add(foot);
    }
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, torsoH, 0.22), dark);
    torso.position.y = legH + torsoH / 2;
    this.body.add(torso);
    for (const x of [-0.25, 0.25]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, torsoH * 1.15, 0.11), dark);
      arm.position.set(x, legH + torsoH * 0.38, 0.0);
      this.body.add(arm);
    }
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), skin);
    this.head.position.set(0, legH + torsoH + 0.1, 0.05);
    this.head.rotation.x = 0.6; // chin on chest
    this.body.add(this.head);
    this.body.position.y = TUNING.hanging.height;
    this.group.add(this.body);

    // The rope, from the ceiling down to the back of the neck.
    const neckY = TUNING.hanging.height + legH + torsoH + 0.1;
    const ropeLen = TUNING.store.height - neckY;
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, ropeLen, 6), new THREE.MeshLambertMaterial({ color: 0x3a3127 }));
    this.rope.position.set(0, neckY + ropeLen / 2, -0.02);
    this.group.add(this.rope);

    // Cold tube in the ceiling above him.
    this.tubeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.05, 0.16),
      new THREE.MeshLambertMaterial({ color: 0xdfeeff, emissive: 0xcfe4ff, emissiveIntensity: 0 }),
    );
    this.tubeMesh.position.set(0, TUNING.store.height - 0.03, 0);
    this.group.add(this.tubeMesh);
    // Narrow: it lights him and a pool of floor, not the aisle.
    this.tube = new THREE.SpotLight(0xcfe4ff, 0, 6, Math.PI / 9, 0.6, 1.4);
    this.tube.position.set(0, TUNING.store.height - 0.1, 0);
    this.tube.target.position.set(0, 0, 0);
    this.group.add(this.tube, this.tube.target);

    this.backlight = new THREE.PointLight(0x9fc0ff, 0, 6, 2);
    this.backlight.position.set(0, 1.4, -0.9);
    this.group.add(this.backlight);
    this.group.visible = false;
  }

  sync(state: GameState, time: number): void {
    const h = state.hanging;
    if (!h) {
      this.group.visible = false;
      this.backlight.intensity = 0;
      this.tube.intensity = 0;
      this.drop = 0;
      this.tilt = 0;
      this.faceUp = 0;
      return;
    }
    const H = TUNING.hanging;
    this.group.visible = true;

    // Stage 2: the head tilts, slowly enough to doubt. Stage 3+: lower, and the face comes up.
    const tiltTarget = h.stage === "still" ? 0 : H.tiltRadians;
    this.tilt += (tiltTarget - this.tilt) * Math.min(1, (1 / H.tiltSeconds) * 0.016 * 3);
    const changed = h.stage === "changed" || h.stage === "rush";
    this.drop = changed ? H.drop : 0;
    this.faceUp = changed ? 1 : 0;
    this.head.rotation.z = this.tilt;
    this.head.rotation.x = 0.6 - 0.75 * this.faceUp;

    let x = h.x;
    let z = h.z;
    let y = -this.drop;
    if (h.stage === "rush" && h.rushTo) {
      const t = Math.min(1, h.stageT / H.rushSeconds);
      const e = t * t * t;
      x = h.x + (h.rushTo.x - h.x) * e;
      z = h.z + (h.rushTo.z - h.z) * e;
      y = -this.drop + (TUNING.player.eyeHeight - 1.55 - H.height + this.drop) * e;
      this.body.rotation.x = -0.9 * e;
    } else {
      this.body.rotation.x = 0;
    }
    this.group.position.set(x, y, z);

    // Faces the player; a very slow turn on the rope while nothing else is happening.
    const dx = state.player.x - x;
    const dz = state.player.z - z;
    const facing = Math.atan2(dx, dz);
    this.group.rotation.y = h.stage === "still" ? facing + Math.sin(time * 0.3) * 0.5 : facing;
    this.body.position.y = H.height + Math.sin(time * 0.8) * 0.02;
    this.rope.visible = h.stage !== "rush";
    this.tubeMesh.visible = h.stage !== "rush";

    // The tube: on from the start (it's how he's seen), out during stage 3, a last stutter as he rushes.
    let lit = 1;
    if (h.stage === "out") lit = h.stageT < H.outSeconds * 0.2 ? (Math.random() < 0.5 ? 1 : 0) : 0;
    else if (h.stage === "rush") lit = Math.max(0, 1 - h.stageT / H.rushSeconds);
    const flicker = Math.random() < 0.05 ? 0.5 : 1 - Math.random() * 0.1;
    this.tube.intensity = 14 * lit * flicker;
    (this.tubeMesh.material as THREE.MeshLambertMaterial).emissiveIntensity = 2.0 * lit * flicker;
    this.backlight.intensity = 3 * lit;
  }
}
