import * as THREE from "three";
import { TUNING } from "@/config/tuning";

/** The four security cameras as real Three.js cameras, plus a small housing mesh for each. */
export class SecurityCameras {
  readonly group = new THREE.Group();
  readonly cameras: THREE.PerspectiveCamera[] = [];

  constructor(aspect: number) {
    const housing = new THREE.MeshLambertMaterial({ color: 0x2b2d30 });
    const lens = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const led = new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 });
    for (const feed of TUNING.cameras.feeds) {
      const cam = new THREE.PerspectiveCamera(TUNING.cameras.fov, aspect, 0.05, 60);
      cam.position.set(feed.pos.x, feed.pos.y, feed.pos.z);
      cam.lookAt(feed.at.x, feed.at.y, feed.at.z);
      cam.layers.enable(2); // the player's own body
      this.cameras.push(cam);

      const body = new THREE.Group();
      body.position.copy(cam.position);
      body.quaternion.copy(cam.quaternion);
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.26), housing);
      shell.position.z = 0.02;
      body.add(shell);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), lens);
      eye.position.z = -0.12;
      body.add(eye);
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.01), led);
      dot.position.set(0.05, 0.04, -0.12);
      body.add(dot);
      // Housings live on layer 1 so a feed never sees its own lens; the player's camera enables it.
      body.traverse((o) => o.layers.set(1));
      this.group.add(body);
    }
  }

  setAspect(aspect: number): void {
    for (const c of this.cameras) {
      c.aspect = aspect;
      c.updateProjectionMatrix();
    }
  }
}
