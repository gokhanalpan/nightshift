import * as THREE from "three";

/**
 * The figure. Tall, thin, no features, nearly black. Stands perfectly still.
 * One mesh group is enough: the state says where it is, if anywhere.
 */
export class Figure {
  readonly group = new THREE.Group();

  constructor(height = 2.05) {
    const dark = new THREE.MeshLambertMaterial({ color: 0x0b0b0d });
    const legH = height * 0.5;
    const torsoH = height * 0.36;
    const headS = height * 0.12;
    for (const x of [-0.09, 0.09]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, legH, 0.16), dark);
      leg.position.set(x, legH / 2, 0);
      this.group.add(leg);
    }
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, torsoH, 0.22), dark);
    torso.position.y = legH + torsoH / 2;
    this.group.add(torso);
    for (const x of [-0.26, 0.26]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, torsoH * 1.05, 0.12), dark);
      arm.position.set(x, legH + torsoH / 2 - 0.05, 0);
      this.group.add(arm);
    }
    const head = new THREE.Mesh(new THREE.BoxGeometry(headS * 1.3, headS * 1.6, headS * 1.3), dark);
    head.position.y = legH + torsoH + headS * 0.8;
    this.group.add(head);
    this.group.visible = false;
  }

  show(x: number, z: number, yaw: number): void {
    this.group.position.set(x, 0, z);
    this.group.rotation.y = yaw;
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }
}
