import * as THREE from "three";

/**
 * A round wall clock on a canvas texture. Redraws only when the displayed minute changes,
 * so it costs nothing most frames.
 */
export class WallClock {
  readonly mesh: THREE.Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private lastMinute = -1;

  constructor(diameter = 0.5) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = 256;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshLambertMaterial({ map: this.texture, transparent: true });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(diameter / 2, 48), mat);
    this.draw(23 * 60);
  }

  /** Hang it at a point, facing the given direction (default: into the store, +Z). */
  placeAt(position: THREE.Vector3, facing: THREE.Vector3 = new THREE.Vector3(0, 0, 1)): void {
    this.mesh.position.copy(position);
    this.mesh.lookAt(position.clone().add(facing));
  }

  /** minutesSinceMidnight may exceed 24h (06:00 next day = 1800). */
  update(minutesSinceMidnight: number): void {
    const minute = Math.floor(minutesSinceMidnight);
    if (minute === this.lastMinute) return;
    this.lastMinute = minute;
    this.draw(minute);
  }

  private draw(minute: number): void {
    const c = this.ctx;
    const w = this.canvas.width;
    const r = w / 2;
    c.clearRect(0, 0, w, w);

    // Rim and face.
    c.beginPath();
    c.arc(r, r, r - 2, 0, Math.PI * 2);
    c.fillStyle = "#1c1c1c";
    c.fill();
    c.beginPath();
    c.arc(r, r, r - 14, 0, Math.PI * 2);
    c.fillStyle = "#efe9d8";
    c.fill();

    // Hour ticks, bolder at 12/3/6/9.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const major = i % 3 === 0;
      const len = major ? 22 : 12;
      c.strokeStyle = "#222";
      c.lineWidth = major ? 6 : 3;
      c.beginPath();
      c.moveTo(r + Math.sin(a) * (r - 20), r - Math.cos(a) * (r - 20));
      c.lineTo(r + Math.sin(a) * (r - 20 - len), r - Math.cos(a) * (r - 20 - len));
      c.stroke();
    }

    const h = (minute / 60) % 12;
    const m = minute % 60;
    const hourAngle = (h / 12) * Math.PI * 2;
    const minuteAngle = (m / 60) * Math.PI * 2;

    c.lineCap = "round";
    c.strokeStyle = "#1a1a1a";
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(r, r);
    c.lineTo(r + Math.sin(hourAngle) * (r * 0.5), r - Math.cos(hourAngle) * (r * 0.5));
    c.stroke();
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(r, r);
    c.lineTo(r + Math.sin(minuteAngle) * (r * 0.74), r - Math.cos(minuteAngle) * (r * 0.74));
    c.stroke();
    c.fillStyle = "#b4322a";
    c.beginPath();
    c.arc(r, r, 7, 0, Math.PI * 2);
    c.fill();

    this.texture.needsUpdate = true;
  }
}
