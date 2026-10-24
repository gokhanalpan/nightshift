import * as THREE from "three";
import { TUNING } from "@/config/tuning";
import { PALETTE, lambert } from "@/render/materials";

/**
 * The stock box in the player's hands: open-topped, with as many items visible inside as are
 * left in it. Parented to the camera so it sits in the lower right of the view.
 */
export class HandBox {
  readonly group = new THREE.Group();
  private readonly items: THREE.Mesh[] = [];

  constructor() {
    const card = lambert(PALETTE.box);
    const inner = lambert(0x7d5c36);
    const w = 0.5;
    const h = 0.3;
    const d = 0.5;
    const t = 0.02;
    const walls: Array<[[number, number, number], [number, number, number]]> = [
      [[w, t, d], [0, -h / 2, 0]], // bottom
      [[t, h, d], [-w / 2, 0, 0]],
      [[t, h, d], [w / 2, 0, 0]],
      [[w, h, t], [0, 0, -d / 2]],
      [[w, h, t], [0, 0, d / 2]],
    ];
    for (const [size, pos] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), card);
      m.position.set(...pos);
      this.group.add(m);
    }
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w - t * 2, 0.005, d - t * 2), inner);
    floor.position.y = -h / 2 + t;
    this.group.add(floor);

    // Items sit in a row across the box; the count follows what is left.
    const n = TUNING.chores.restock.boxItems;
    for (let i = 0; i < n; i++) {
      const color = PALETTE.products[(i * 3 + 1) % PALETTE.products.length]!;
      const item = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.18, 0.3), lambert(color));
      item.position.set(-0.15 + (i * 0.3) / Math.max(1, n - 1), -h / 2 + t + 0.09, 0.02);
      item.rotation.y = (i - 1) * 0.08;
      this.group.add(item);
      this.items.push(item);
    }

    this.group.position.set(0.3, -0.38, -0.64);
    this.group.rotation.set(0.35, -0.25, 0.05);
    this.group.visible = false;
  }

  sync(carrying: number): void {
    this.group.visible = carrying > 0;
    this.items.forEach((item, i) => (item.visible = i < carrying));
  }
}
