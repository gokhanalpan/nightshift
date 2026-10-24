import * as THREE from "three";
import { TUNING } from "@/config/tuning";
import { PALETTE, box, glassMaterial, lambert, textPlane, type Collider } from "@/render/materials";

/** Handles to the things later build steps need to poke at (lights out, manager door glow…). */
export interface StoreHandles {
  group: THREE.Group;
  colliders: Collider[];
  ceilingLights: THREE.PointLight[];
  ceilingPanels: THREE.Mesh[];
  fridgeLight: THREE.PointLight;
  streetlight: THREE.SpotLight;
  backRoomBulb: THREE.PointLight;
  /** The four feed quadrants on the counter monitor, in feed order. */
  monitorFeeds: THREE.Mesh[];
  /** The front glass door; swings when a customer passes. */
  frontDoor: THREE.Group;
  /** "NIGHT 6" on the wall behind the till; shown only in the endless night. */
  night6Sign: THREE.Mesh;
  /** The manager key on a crate in the back room; hidden until night 5. */
  managerKey: THREE.Mesh;
  /** The phone's handset, for a little rattle while it rings. */
  phoneHandset: THREE.Mesh;
  /** The thin glow under the MANAGER door; off until night 4. */
  managerDoorGlow: THREE.Mesh;
  /** Where the wall clock mesh should hang: above the front door, facing into the store. */
  clockAnchor: THREE.Vector3;
}

const S = TUNING.store;
const HALF_W = S.width / 2;
const HALF_D = S.depth / 2;
const T = S.wallThickness;

export function buildStore(): StoreHandles {
  const group = new THREE.Group();
  const colliders: Collider[] = [];

  buildFloorAndCeiling(group);
  const panels = buildCeilingLights(group);
  buildSideAndBackWalls(group, colliders);
  const frontDoor = buildFrontWall(group, colliders);
  const monitorFeeds: THREE.Mesh[] = [];
  const phoneHandset = buildCounter(group, colliders, monitorFeeds);
  buildShelves(group, colliders);
  const fridgeLight = buildFridges(group, colliders);
  const managerDoorGlow = buildRightWallDoors(group, colliders);
  const { bulb: backRoomBulb, key: managerKey } = buildBackRoom(group, colliders);
  const streetlight = buildLot(group);
  const night6Sign = textPlane("NIGHT 6", { width: 1.6, height: 0.5, bg: "#c9c3b0", fg: "#2a1a1a", font: "bold 110px sans-serif" });
  night6Sign.position.set(-HALF_W + 0.01, 2.0, -1.2);
  night6Sign.rotation.y = Math.PI / 2;
  night6Sign.visible = false;
  group.add(night6Sign);

  return {
    group,
    colliders,
    ceilingLights: panels.lights,
    ceilingPanels: panels.meshes,
    fridgeLight,
    streetlight,
    backRoomBulb,
    monitorFeeds,
    frontDoor,
    managerKey,
    phoneHandset,
    night6Sign,
    managerDoorGlow,
    clockAnchor: new THREE.Vector3(0, 2.72, -HALF_D + T / 2 + 0.03),
  };
}

// ---------------------------------------------------------------------------------------------

function buildFloorAndCeiling(g: THREE.Group): void {
  // Checker tiles drawn on a canvas, repeated: cheap and reads as a mini market floor.
  const tile = document.createElement("canvas");
  tile.width = tile.height = 128;
  const ctx = tile.getContext("2d")!;
  ctx.fillStyle = "#" + PALETTE.floorGrout.toString(16).padStart(6, "0");
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#" + PALETTE.floorTile.toString(16).padStart(6, "0");
  ctx.fillRect(3, 3, 58, 58);
  ctx.fillRect(67, 3, 58, 58);
  ctx.fillRect(3, 67, 58, 58);
  ctx.fillRect(67, 67, 58, 58);
  const tex = new THREE.CanvasTexture(tile);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(S.width, S.depth);
  tex.magFilter = THREE.NearestFilter;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S.width, S.depth), new THREE.MeshLambertMaterial({ map: tex }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(S.width, S.depth), lambert(PALETTE.ceiling));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = S.height;
  g.add(ceiling);
}

function buildCeilingLights(g: THREE.Group): { lights: THREE.PointLight[]; meshes: THREE.Mesh[] } {
  const lights: THREE.PointLight[] = [];
  const meshes: THREE.Mesh[] = [];
  const panelMat = lambert(PALETTE.fluorescent, { emissive: PALETTE.fluorescent, emissiveIntensity: 1.4 });
  for (const x of TUNING.lighting.panelCols) {
    for (const z of TUNING.lighting.panelRows) {
      const panel = box(g, [1.2, 0.06, 0.4], [x, S.height - 0.04, z], panelMat, undefined, { castShadow: false });
      meshes.push(panel);
      const light = new THREE.PointLight(0xfff4dc, TUNING.lighting.panelIntensity, TUNING.lighting.panelDistance, 2);
      light.position.set(x, S.height - 0.25, z);
      g.add(light);
      lights.push(light);
    }
  }
  return { lights, meshes };
}

function buildSideAndBackWalls(g: THREE.Group, c: Collider[]): void {
  const wall = lambert(PALETTE.wall);
  // Left wall, full length.
  box(g, [T, S.height, S.depth + T * 2], [-HALF_W - T / 2, S.height / 2, 0], wall, c);
  // Back wall, full width.
  box(g, [S.width + T * 2, S.height, T], [0, S.height / 2, HALF_D + T / 2], wall, c);
  // Right wall is built in segments around its doors (see buildRightWallDoors).
  const x = HALF_W + T / 2;
  const d = S.rightWallDoors;
  const cuts = [d.toilet, d.manager, d.backRoom].sort((a, b) => a.z - b.z);
  let z = -HALF_D - T;
  for (const door of cuts) {
    const start = door.z - door.width / 2;
    if (start > z) box(g, [T, S.height, start - z], [x, S.height / 2, (z + start) / 2], wall, c);
    // Header above the door opening.
    const headerH = S.height - door.height;
    box(g, [T, headerH, door.width], [x, door.height + headerH / 2, door.z], wall);
    z = door.z + door.width / 2;
  }
  box(g, [T, S.height, HALF_D + T - z], [x, S.height / 2, (z + HALF_D + T) / 2], wall, c);
  // Skirting along the inside of the three solid walls.
  const skirt = lambert(PALETTE.trim);
  box(g, [0.04, 0.1, S.depth], [-HALF_W + 0.02, 0.05, 0], skirt);
  box(g, [S.width, 0.1, 0.04], [0, 0.05, HALF_D - 0.02], skirt);
}

function buildFrontWall(g: THREE.Group, c: Collider[]): THREE.Group {
  const wall = lambert(PALETTE.wall);
  const frame = lambert(PALETTE.doorFrame);
  const z = -HALF_D - T / 2;
  const f = S.frontWall;
  const glass = glassMaterial();

  // Sill under the glass, full width; the door interrupts it.
  const sideW = (S.width - f.doorWidth) / 2;
  const sideX = f.doorWidth / 2 + sideW / 2;
  box(g, [sideW, f.sillHeight, T], [-sideX, f.sillHeight / 2, z], wall, c);
  box(g, [sideW, f.sillHeight, T], [sideX, f.sillHeight / 2, z], wall, c);
  // Solid strip above the glass.
  const topH = S.height - f.glassTop;
  box(g, [S.width + T * 2, topH, T], [0, f.glassTop + topH / 2, z], wall);

  // Window panes (collide: the player never goes outside).
  const paneH = f.glassTop - f.sillHeight;
  for (const sx of [-1, 1]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(sideW, paneH), glass);
    pane.position.set(sx * sideX, f.sillHeight + paneH / 2, z);
    g.add(pane);
    // thin window collider, in case the sill alone leaves a gap at the door edges
    c.push({ minX: sx * sideX - sideW / 2, maxX: sx * sideX + sideW / 2, minZ: z - T / 2, maxZ: z + T / 2 });
    // mullions
    for (const mx of [sx * (f.doorWidth / 2 + 0.03), sx * (HALF_W - 0.03)]) {
      box(g, [0.06, paneH, T + 0.02], [mx, f.sillHeight + paneH / 2, z], frame);
    }
    box(g, [sideW, 0.06, T + 0.02], [sx * sideX, f.sillHeight + 0.03, z], frame);
    box(g, [sideW, 0.06, T + 0.02], [sx * sideX, f.glassTop - 0.03, z], frame);
  }

  // The glass door: frame, pane, push bar. Locked for now (it is a collider).
  const dw = f.doorWidth;
  const dh = f.doorHeight;
  // Hinge group sits at the door's left jamb; the leaf is offset so rotating the group swings it.
  const door = new THREE.Group();
  door.position.set(-dw / 2, 0, z);
  const leaf = new THREE.Group();
  leaf.position.x = dw / 2;
  box(leaf, [0.08, dh, T + 0.02], [-dw / 2 + 0.04, dh / 2, 0], frame);
  box(leaf, [0.08, dh, T + 0.02], [dw / 2 - 0.04, dh / 2, 0], frame);
  box(leaf, [dw, 0.08, T + 0.02], [0, dh - 0.04, 0], frame);
  box(leaf, [dw, 0.1, T + 0.02], [0, 0.05, 0], frame);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(dw - 0.16, dh - 0.18), glass);
  pane.position.set(0, dh / 2, 0);
  leaf.add(pane);
  box(leaf, [dw - 0.3, 0.04, 0.04], [0, 1.0, T / 2 + 0.03], lambert(PALETTE.shelfMetal));
  door.add(leaf);
  g.add(door);
  // header between the door top and the glass line (fixed, not part of the leaf)
  box(g, [dw, f.glassTop - dh, T], [0, dh + (f.glassTop - dh) / 2, z], wall);
  c.push({ minX: -dw / 2, maxX: dw / 2, minZ: z - T / 2, maxZ: z + T / 2 });

  // "OPEN 24h" sign hanging inside the right window.
  const sign = textPlane("OPEN 24h", { width: 0.9, height: 0.3, bg: "#1a1a1a", fg: "#ff5a3c" });
  sign.position.set(3.2, 2.1, z + T / 2 + 0.02);
  g.add(sign);
  return door;
}

function buildCounter(g: THREE.Group, c: Collider[], monitorFeeds: THREE.Mesh[]): THREE.Mesh {
  const k = S.counter;
  // Body and top.
  box(g, [k.width, k.height - 0.05, k.depth], [k.x, (k.height - 0.05) / 2, k.z], lambert(PALETTE.counter), c);
  box(g, [k.width + 0.1, 0.05, k.depth + 0.1], [k.x, k.height - 0.025, k.z], lambert(PALETTE.counterTop));
  // Return along the left wall, so the player is in an L behind the till.
  box(g, [k.depth, k.height, 1.6], [-HALF_W + k.depth / 2, k.height / 2, k.z + k.depth / 2 + 0.8], lambert(PALETTE.counter), c);

  // Till.
  const tillX = k.x + 0.9;
  box(g, [0.45, 0.18, 0.4], [tillX, k.height + 0.09, k.z], lambert(PALETTE.trim));
  box(g, [0.3, 0.1, 0.02], [tillX, k.height + 0.26, k.z - 0.1], lambert(0x9fd6a8, { emissive: 0x9fd6a8, emissiveIntensity: 0.6 }));

  // Camera monitor: a chunky CRT with four dim feed quadrants. A quadrant brightens when it pings.
  const monX = TUNING.interact.points.monitor.x;
  box(g, [0.55, 0.45, 0.45], [monX, k.height + 0.225, k.z + 0.05], lambert(0x3a3c3f));
  const feedColors = [0x1e3a2a, 0x1e2f3a, 0x2a2a1e, 0x2a1e2a];
  let i = 0;
  for (const qy of [1, -1]) {
    for (const qx of [-1, 1]) {
      const feed = new THREE.Mesh(
        new THREE.PlaneGeometry(0.2, 0.15),
        new THREE.MeshLambertMaterial({ color: feedColors[i], emissive: feedColors[i], emissiveIntensity: 2.2 }),
      );
      feed.position.set(monX + qx * 0.11, k.height + 0.225 + qy * 0.085, k.z - 0.18);
      feed.rotation.y = Math.PI;
      g.add(feed);
      monitorFeeds.push(feed);
      i++;
    }
  }

  // The rules note, taped to the counter top beside the till. Three lines on night 1.
  const note = textPlane("RULES", {
    width: 0.22,
    height: 0.3,
    bg: "#f3eee0",
    fg: "#222",
    font: "bold 28px sans-serif",
    pixelsPerMetre: 400,
  });
  note.rotation.x = -Math.PI / 2;
  const np = TUNING.props.note;
  note.position.set(np.x, k.height + 0.001, np.z);
  g.add(note);

  // The phone: a beige desk phone with a handset on top.
  const pp = TUNING.props.phone;
  box(g, [0.22, 0.07, 0.18], [pp.x, k.height + 0.035, pp.z], lambert(0xcdc5b0));
  const handset = box(g, [0.2, 0.04, 0.06], [pp.x, k.height + 0.09, pp.z - 0.05], lambert(0xb9b09a));
  for (let i = 0; i < 6; i++) {
    box(g, [0.02, 0.01, 0.02], [pp.x - 0.03 + (i % 3) * 0.03, k.height + 0.075, pp.z + 0.02 + Math.floor(i / 3) * 0.03], lambert(0x3a3a3a), undefined, {
      castShadow: false,
    });
  }
  return handset;
}

function buildShelves(g: THREE.Group, c: Collider[]): void {
  const sh = S.shelves;
  const length = sh.zEnd - sh.zStart;
  const zc = (sh.zStart + sh.zEnd) / 2;
  const metal = lambert(PALETTE.shelfMetal);
  const board = lambert(PALETTE.shelfBoard);
  for (const x of sh.rowX) {
    // Central spine and base plinth; the whole row is one collider.
    box(g, [0.1, sh.height, length], [x, sh.height / 2, zc], metal);
    box(g, [sh.width, 0.12, length], [x, 0.06, zc], metal, c);
    // Shelf boards on both faces. Products are drawn by products.ts from the slot layout.
    for (let lvl = 0; lvl < sh.levels; lvl++) {
      const y = 0.4 + lvl * ((sh.height - 0.5) / (sh.levels - 1));
      box(g, [sh.width, 0.04, length], [x, y, zc], board);
    }
    // End caps.
    for (const ez of [sh.zStart, sh.zEnd]) {
      box(g, [sh.width, sh.height, 0.06], [x, sh.height / 2, ez], metal);
    }
  }
}

function buildFridges(g: THREE.Group, c: Collider[]): THREE.PointLight {
  const f = S.fridges;
  const z = HALF_D - f.depth / 2;
  const body = lambert(PALETTE.fridgeBody);
  const glassMat = new THREE.MeshLambertMaterial({
    color: PALETTE.fridgeGlass,
    emissive: PALETTE.fridgeGlass,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.55,
  });
  const inner = lambert(0xdfe8ee, { emissive: 0xbfd8e8, emissiveIntensity: 0.8 });
  const span = f.xEnd - f.xStart;
  const units = Math.max(1, Math.round(span / f.unitWidth));
  const w = span / units;
  for (let i = 0; i < units; i++) {
    const x = f.xStart + w / 2 + i * w;
    // Shell: back, sides, top, bottom, then a glowing interior and a glass door.
    box(g, [w, f.height, 0.08], [x, f.height / 2, HALF_D - 0.04], body, i === 0 ? c : undefined);
    box(g, [0.06, f.height, f.depth], [x - w / 2 + 0.03, f.height / 2, z], body);
    box(g, [w, 0.12, f.depth], [x, f.height - 0.06, z], body);
    box(g, [w, 0.2, f.depth], [x, 0.1, z], body);
    box(g, [w - 0.14, f.height - 0.34, f.depth - 0.2], [x, f.height / 2 - 0.02, z + 0.05], inner, undefined, {
      castShadow: false,
    });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.16, f.height - 0.36), glassMat);
    door.position.set(x, f.height / 2 - 0.02, HALF_D - f.depth + 0.01);
    door.rotation.y = Math.PI;
    g.add(door);
    // Rows of bottles, blocky.
    for (let r = 0; r < 3; r++) {
      const y = 0.45 + r * 0.55;
      for (let b = 0; b < 4; b++) {
        const bx = x - w / 2 + 0.25 + b * ((w - 0.5) / 3);
        box(g, [0.12, 0.3, 0.12], [bx, y, z + 0.1], lambert(PALETTE.products[(r + b) % 4]!), undefined, {
          castShadow: false,
        });
      }
    }
  }
  box(g, [0.06, f.height, f.depth], [f.xEnd - 0.03, f.height / 2, z], body);
  // One collider for the whole run.
  c.push({ minX: f.xStart, maxX: f.xEnd, minZ: HALF_D - f.depth, maxZ: HALF_D });

  const light = new THREE.PointLight(0xaacfff, TUNING.lighting.fridgeGlow, 6, 2);
  light.position.set((f.xStart + f.xEnd) / 2, 1.4, HALF_D - f.depth - 0.4);
  g.add(light);
  return light;
}

function buildRightWallDoors(g: THREE.Group, c: Collider[]): THREE.Mesh {
  const x = HALF_W + T / 2;
  const d = S.rightWallDoors;
  const doorMat = lambert(PALETTE.door);
  const frame = lambert(PALETTE.doorFrame);

  const makeDoor = (z: number, w: number, h: number, label: string | null, solid: boolean) => {
    box(g, [T + 0.04, 0.06, w + 0.12], [x, h + 0.03, z], frame);
    box(g, [T + 0.04, h, 0.06], [x, h / 2, z - w / 2 - 0.03], frame);
    box(g, [T + 0.04, h, 0.06], [x, h / 2, z + w / 2 + 0.03], frame);
    if (solid) {
      box(g, [0.06, h, w], [x, h / 2, z], doorMat, c);
      // handle on the store side
      box(g, [0.04, 0.03, 0.14], [HALF_W - 0.02, 1.0, z - w / 2 + 0.15], lambert(PALETTE.shelfMetal));
    }
    if (label) {
      const sign = textPlane(label, { width: 0.5, height: 0.14, bg: "#2a2a2a", fg: "#e8e2d0", font: "bold 40px sans-serif" });
      sign.position.set(HALF_W - 0.005, h + 0.2, z);
      sign.rotation.y = -Math.PI / 2;
      g.add(sign);
    }
  };

  makeDoor(d.toilet.z, d.toilet.width, d.toilet.height, "STAFF", true);
  makeDoor(d.manager.z, d.manager.width, d.manager.height, "MANAGER", true);
  // Back-room door stands open, hinged inward into the back room.
  makeDoor(d.backRoom.z, d.backRoom.width, d.backRoom.height, null, false);
  box(
    g,
    [d.backRoom.width, d.backRoom.height, 0.06],
    [HALF_W + T + d.backRoom.width / 2, d.backRoom.height / 2, d.backRoom.z - d.backRoom.width / 2 - 0.03],
    doorMat,
    c,
  );

  // Light under the MANAGER door. Hidden until a later night.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(d.manager.width - 0.1, 0.02),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }),
  );
  glow.position.set(HALF_W - 0.03, 0.012, d.manager.z);
  glow.rotation.y = -Math.PI / 2;
  glow.visible = false;
  g.add(glow);
  return glow;
}

function buildBackRoom(g: THREE.Group, c: Collider[]): { bulb: THREE.PointLight; key: THREE.Mesh } {
  const b = S.backRoom;
  const x0 = HALF_W + T; // inner face of the right wall, from the back room's side
  const cx = x0 + b.width / 2;
  const cz = b.z;
  const wall = lambert(0xb3ada0);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(b.width, b.depth), lambert(0x5a5c57));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  g.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(b.width, b.depth), lambert(0x9b978c));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(cx, S.height, cz);
  g.add(ceiling);

  // Far wall, and the two side walls. (The shared wall with the store already exists.)
  box(g, [T, S.height, b.depth + T * 2], [x0 + b.width + T / 2, S.height / 2, cz], wall, c);
  box(g, [b.width, S.height, T], [cx, S.height / 2, cz - b.depth / 2 - T / 2], wall, c);
  box(g, [b.width, S.height, T], [cx, S.height / 2, cz + b.depth / 2 + T / 2], wall, c);

  // Stock boxes in a couple of stacks, and a pallet.
  const boxMat = lambert(PALETTE.box);
  const pile = TUNING.interact.points.stockPile;
  const stacks: Array<[number, number, number]> = [
    [pile.x, pile.z, 3],
    [x0 + 1.3, cz + 1.4, 2],
    [x0 + 0.6, cz + 0.7, 1],
    [x0 + 3.2, cz - 1.3, 2],
    [TUNING.props.managerKey.x, TUNING.props.managerKey.z, 2],
  ];
  for (const [sx, sz, n] of stacks) {
    for (let i = 0; i < n; i++) {
      box(g, [0.6, 0.45, 0.6], [sx, 0.225 + i * 0.47, sz], boxMat, i === 0 ? c : undefined);
    }
  }
  // Fuse box on the far wall, with a little red standby lamp.
  const fb = TUNING.props.fuseBox;
  box(g, [0.1, 0.6, 0.4], [fb.x - 0.05, fb.y, fb.z], lambert(PALETTE.fuseBox));
  box(g, [0.02, 0.04, 0.04], [fb.x - 0.11, fb.y + 0.22, fb.z + 0.15], lambert(0xff3030, { emissive: 0xff3030, emissiveIntensity: 2 }));
  // The manager key, on a crate. Hidden until the night it matters.
  const kp = TUNING.props.managerKey;
  const key = box(g, [0.03, 0.01, 0.1], [kp.x, kp.y, kp.z], lambert(0xd8b65a, { emissive: 0xd8b65a, emissiveIntensity: 0.3 }), undefined, { castShadow: false });
  box(key, [0.05, 0.01, 0.04], [0, 0, -0.06], lambert(0xd8b65a));
  key.visible = false;
  // Mop and bucket by the door.
  box(g, [0.32, 0.3, 0.32], [x0 + 0.5, 0.15, cz - 1.5], lambert(0xd9c93a));
  box(g, [0.03, 1.4, 0.03], [x0 + 0.42, 0.85, cz - 1.42], lambert(0xc9b69a));

  // One bare bulb.
  const bulb = new THREE.PointLight(0xffe2b0, TUNING.lighting.backRoomBulb, 7, 2);
  bulb.position.set(cx, S.height - 0.3, cz);
  g.add(bulb);
  box(g, [0.1, 0.1, 0.1], [cx, S.height - 0.25, cz], lambert(0xfff1c8, { emissive: 0xfff1c8, emissiveIntensity: 1.5 }), undefined, {
    castShadow: false,
  });
  return { bulb, key };
}

function buildLot(g: THREE.Group): THREE.SpotLight {
  const L = TUNING.lot;
  const frontZ = -HALF_D - T;

  // Asphalt from the front wall out past the road.
  const totalDepth = -L.road.zEnd - 8 + HALF_D;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(L.width, totalDepth), lambert(PALETTE.asphalt));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.001, frontZ - totalDepth / 2);
  ground.receiveShadow = true;
  g.add(ground);

  // Pavement strip right in front of the store.
  box(g, [S.width + 2, 0.08, 1.4], [0, 0.04, frontZ - 0.7], lambert(0x6c6c66), undefined, { castShadow: false });

  // Parking bay lines.
  const lineMat = lambert(PALETTE.roadLine);
  for (let i = -3; i <= 3; i++) {
    box(g, [0.08, 0.01, 4.5], [i * 2.6, 0.005, frontZ - 4.5], lineMat, undefined, { castShadow: false });
  }

  // Road: a darker band with a dashed centre line, kerbs either side.
  const roadDepth = L.road.zStart - L.road.zEnd;
  const roadZ = (L.road.zStart + L.road.zEnd) / 2;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(L.width, roadDepth), lambert(0x222426));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.002, roadZ);
  g.add(road);
  for (let x = -L.width / 2; x < L.width / 2; x += 3) {
    box(g, [1.5, 0.01, 0.12], [x + 0.75, 0.006, roadZ], lineMat, undefined, { castShadow: false });
  }
  box(g, [L.width, 0.12, 0.3], [0, 0.06, L.road.zStart + 0.15], lambert(0x55564f), undefined, { castShadow: false });
  box(g, [L.width, 0.12, 0.3], [0, 0.06, L.road.zEnd - 0.15], lambert(0x55564f), undefined, { castShadow: false });

  // Streetlight: pole, arm, head, warm cone down onto the lot.
  const sl = L.streetlight;
  box(g, [0.14, sl.height, 0.14], [sl.x, sl.height / 2, sl.z], lambert(PALETTE.pole));
  box(g, [0.1, 0.1, 1.2], [sl.x, sl.height - 0.05, sl.z - 0.6], lambert(PALETTE.pole));
  box(g, [0.5, 0.2, 0.7], [sl.x, sl.height - 0.1, sl.z - 1.3], lambert(PALETTE.pole));
  box(g, [0.4, 0.04, 0.6], [sl.x, sl.height - 0.21, sl.z - 1.3], lambert(PALETTE.lampWarm, { emissive: PALETTE.lampWarm, emissiveIntensity: 2 }), undefined, {
    castShadow: false,
  });
  const spot = new THREE.SpotLight(PALETTE.lampWarm, TUNING.lighting.streetlight, 18, Math.PI / 3.2, 0.6, 1.4);
  spot.position.set(sl.x, sl.height - 0.3, sl.z - 1.3);
  spot.target.position.set(sl.x, 0, sl.z - 1.3);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  g.add(spot, spot.target);

  // Dumpster at the corner of the lot.
  const d = L.dumpster;
  box(g, [1.8, 1.2, 1.0], [d.x, 0.6, d.z], lambert(PALETTE.dumpster));
  box(g, [1.9, 0.12, 1.1], [d.x, 1.26, d.z], lambert(0x274a33));
  box(g, [0.1, 0.1, 1.0], [d.x - 0.8, 1.38, d.z], lambert(0x274a33));

  // Bus shelter across the road. The figure will stand here on night 1.
  const b = L.busShelter;
  const post = lambert(PALETTE.shelterPost);
  for (const px of [-1.6, 1.6]) {
    box(g, [0.1, 2.4, 0.1], [b.x + px, 1.2, b.z - 0.8], post);
    box(g, [0.1, 2.4, 0.1], [b.x + px, 1.2, b.z + 0.8], post);
  }
  box(g, [3.6, 0.12, 2.0], [b.x, 2.46, b.z], lambert(PALETTE.shelterRoof));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.0), glassMaterial());
  back.position.set(b.x, 1.3, b.z - 0.8);
  g.add(back);
  box(g, [2.6, 0.08, 0.4], [b.x, 0.5, b.z - 0.5], post);
  box(g, [0.08, 0.5, 0.08], [b.x - 1.1, 0.25, b.z - 0.5], post);
  box(g, [0.08, 0.5, 0.08], [b.x + 1.1, 0.25, b.z - 0.5], post);
  box(g, [0.1, 2.6, 0.1], [b.x + 2.4, 1.3, b.z], post);
  const shelterLamp = new THREE.PointLight(0xcfe3ff, 6, 7, 2);
  shelterLamp.position.set(b.x, 2.3, b.z);
  g.add(shelterLamp);
  box(g, [0.6, 0.05, 0.2], [b.x, 2.38, b.z], lambert(0xdfeeff, { emissive: 0xdfeeff, emissiveIntensity: 1.2 }), undefined, { castShadow: false });
  const stopSign = textPlane("BUS", { width: 0.4, height: 0.4, bg: "#2b4a7a", fg: "#ffffff", font: "bold 60px sans-serif" });
  stopSign.position.set(b.x + 2.4, 2.3, b.z + 0.06);
  g.add(stopSign);

  // Far side: a low wall and a few dark building blocks, so the fog has something to eat.
  const dark = lambert(0x16181a);
  box(g, [L.width, 1.0, 0.3], [0, 0.5, L.road.zEnd - 4], dark, undefined, { castShadow: false });
  for (const [bx, bw, bh] of [
    [-12, 6, 7],
    [-4, 5, 5],
    [5, 8, 9],
    [14, 6, 6],
  ] as const) {
    box(g, [bw, bh, 6], [bx, bh / 2, L.road.zEnd - 9], dark, undefined, { castShadow: false });
    // one or two lit windows each
    box(g, [0.5, 0.6, 0.05], [bx - bw / 4, bh * 0.6, L.road.zEnd - 6 + 0.01], lambert(0xffd58a, { emissive: 0xffd58a, emissiveIntensity: 1.2 }), undefined, {
      castShadow: false,
    });
  }

  return spot;
}
