import * as THREE from "three";
import { TUNING, type RegularId } from "@/config/tuning";
import type { Customer, GameState } from "@/game/state";

/**
 * The five regulars as blocky figures with distinct silhouettes, mirrored from the state.
 * A "wrong" customer gets the same figure, dimmed, and is put on layer 1 so the security
 * cameras (layer 0) never see them. The player's camera sees both layers.
 */
export class Customers {
  readonly group = new THREE.Group();
  private readonly figures = new Map<number, THREE.Group>();
  /** For a customer with a camera offset: a second body the feeds see, where the cameras think they are. */
  private readonly camFigures = new Map<number, THREE.Group>();

  sync(state: GameState, time: number): void {
    const seen = new Set<number>();
    for (const cu of state.customers) {
      seen.add(cu.id);
      let fig = this.figures.get(cu.id);
      if (!fig) {
        fig = buildRegular(cu.regular, false);
        if (!cu.onCamera || cu.camOffset) fig.traverse((o) => o.layers.set(1)); // player only
        this.figures.set(cu.id, fig);
        this.group.add(fig);
        if (cu.camOffset) {
          const cam = buildRegular(cu.regular, false);
          cam.traverse((o) => o.layers.set(2)); // cameras only
          this.camFigures.set(cu.id, cam);
          this.group.add(cam);
        }
      }
      const walking = cu.phase === "entering" || cu.phase === "toQueue" || cu.phase === "leaving";
      const rate = 9 * (TUNING.regulars[cu.regular].walkSpeed / 1.2);
      const swing = walking ? Math.sin(time * rate) * 0.45 : 0;
      const bob = walking ? Math.abs(Math.sin(time * rate)) * 0.03 : cu.phase === "lingering" ? 0 : Math.sin(time * 1.5 + cu.id) * 0.01;
      const pose = (g: THREE.Group, x: number, z: number) => {
        g.position.set(x, bob, z);
        g.rotation.y = cu.yaw;
        (g.getObjectByName("legL") as THREE.Mesh).rotation.x = swing;
        (g.getObjectByName("legR") as THREE.Mesh).rotation.x = -swing;
      };
      pose(fig, cu.x, cu.z);
      const cam = this.camFigures.get(cu.id);
      if (cam && cu.camOffset) pose(cam, cu.x + cu.camOffset.x, cu.z + cu.camOffset.z);
    }
    for (const [id, fig] of this.figures) {
      if (!seen.has(id)) {
        this.group.remove(fig);
        this.figures.delete(id);
        const cam = this.camFigures.get(id);
        if (cam) {
          this.group.remove(cam);
          this.camFigures.delete(id);
        }
      }
    }
  }
}

const SKIN = 0xe9c3a0;

function mat(color: number, dim: boolean): THREE.MeshLambertMaterial {
  const c = new THREE.Color(color);
  if (dim) c.multiplyScalar(0.55);
  return new THREE.MeshLambertMaterial({ color: c });
}

interface Look {
  height: number;
  shirt: number;
  trousers: number;
  skin: number;
  shoes: number;
}

/** Body plan shared by everyone; each regular adds their own bits on top. */
function body(look: Look, dim: boolean): { g: THREE.Group; legH: number; torsoH: number; headS: number } {
  const g = new THREE.Group();
  const shirt = mat(look.shirt, dim);
  const trousers = mat(look.trousers, dim);
  const skin = mat(look.skin, dim);
  const shoes = mat(look.shoes, dim);
  const h = look.height;
  const legH = h * 0.45;
  const torsoH = h * 0.36;
  const headS = h * 0.15;
  const scale = h / 1.7;

  for (const [name, x] of [
    ["legL", -0.11 * scale],
    ["legR", 0.11 * scale],
  ] as const) {
    const leg = new THREE.Group();
    leg.position.set(x, legH, 0);
    leg.name = name;
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.18 * scale, legH, 0.2 * scale), trousers);
    shin.position.y = -legH / 2;
    shin.castShadow = true;
    leg.add(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.19 * scale, 0.08, 0.28 * scale), shoes);
    shoe.position.set(0, -legH + 0.04, 0.03 * scale);
    leg.add(shoe);
    g.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46 * scale, torsoH, 0.26 * scale), shirt);
  torso.name = "torso";
  torso.position.y = legH + torsoH / 2;
  torso.castShadow = true;
  g.add(torso);
  for (const [name, x] of [
    ["armL", -0.3 * scale],
    ["armR", 0.3 * scale],
  ] as const) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12 * scale, torsoH * 0.9, 0.14 * scale), shirt);
    arm.name = name;
    arm.position.set(x, legH + torsoH / 2, 0);
    g.add(arm);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(headS * 1.4, headS * 1.4, headS * 1.3), skin);
  head.name = "head";
  head.position.y = legH + torsoH + headS * 0.75;
  head.castShadow = true;
  g.add(head);
  return { g, legH, torsoH, headS };
}

/** A wire shopping cart. Its handle is at -Z, so the pusher stands behind it. */
export function buildCart(dim: boolean): THREE.Group {
  const cart = new THREE.Group();
  const wire = mat(0x8a8f96, dim);
  const basket = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.45, 0.55),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(0x8a8f96).multiplyScalar(dim ? 0.55 : 1), transparent: true, opacity: 0.55 }),
  );
  basket.position.y = 0.55;
  cart.add(basket);
  for (const [x, z] of [
    [-0.17, -0.22],
    [0.17, -0.22],
    [-0.17, 0.22],
    [0.17, 0.22],
  ] as const) {
    const wheel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.1), mat(0x222222, dim));
    wheel.position.set(x, 0.05, z);
    cart.add(wheel);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.03), wire);
    strut.position.set(x, 0.2, z);
    cart.add(strut);
  }
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.03), mat(0xc24a3c, dim));
  handle.position.set(0, 0.9, -0.3);
  cart.add(handle);
  return cart;
}

export function buildRegular(id: RegularId, dim: boolean): THREE.Group {
  const height = TUNING.regulars[id].height;
  switch (id) {
    case "hoodie": {
      const { g, legH, torsoH, headS } = body({ height, shirt: 0x3b3f46, trousers: 0x23262b, skin: SKIN, shoes: 0x1a1a1a }, dim);
      // Hood: a dark shell around the head, open at the front; pocket on the torso.
      const hood = new THREE.Mesh(new THREE.BoxGeometry(headS * 1.7, headS * 1.7, headS * 1.5), mat(0x3b3f46, dim));
      hood.position.set(0, legH + torsoH + headS * 0.85, -headS * 0.2);
      g.add(hood);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.04), mat(0x33373d, dim));
      pocket.position.set(0, legH + torsoH * 0.3, 0.15);
      g.add(pocket);
      return g;
    }
    case "oldwoman": {
      const { g, legH, torsoH, headS } = body({ height, shirt: 0x8d6a8f, trousers: 0x5a5560, skin: 0xe4c5b0, shoes: 0x3a2f2a }, dim);
      // Headscarf and a slight stoop.
      const scarf = new THREE.Mesh(new THREE.BoxGeometry(headS * 1.6, headS * 1.0, headS * 1.5), mat(0xb8b0a0, dim));
      scarf.position.set(0, legH + torsoH + headS * 1.1, -headS * 0.1);
      g.add(scarf);
      (g.getObjectByName("torso") as THREE.Mesh).rotation.x = 0.12;
      // The cart, pushed in front.
      const cart = buildCart(dim);
      cart.position.set(0, 0, 0.5);
      g.add(cart);
      return g;
    }
    case "kid": {
      const { g, legH, torsoH, headS } = body({ height, shirt: 0xe0b23a, trousers: 0x3a5aa8, skin: SKIN, shoes: 0xd94c3d }, dim);
      // Cap with a peak, and a small backpack.
      const cap = new THREE.Mesh(new THREE.BoxGeometry(headS * 1.5, headS * 0.5, headS * 1.4), mat(0x2d9c5a, dim));
      cap.position.set(0, legH + torsoH + headS * 1.4, 0);
      g.add(cap);
      const peak = new THREE.Mesh(new THREE.BoxGeometry(headS * 1.3, 0.03, headS * 0.8), mat(0x2d9c5a, dim));
      peak.position.set(0, legH + torsoH + headS * 1.2, headS * 0.9);
      g.add(peak);
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.12), mat(0x9b3c8f, dim));
      bag.position.set(0, legH + torsoH * 0.55, -0.17);
      g.add(bag);
      return g;
    }
    case "suit": {
      const { g, legH, torsoH } = body({ height, shirt: 0x1f232c, trousers: 0x1f232c, skin: 0xdfbfa0, shoes: 0x0f0f0f }, dim);
      // White shirt strip, tie, briefcase.
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, torsoH * 0.9, 0.02), mat(0xf2f2f2, dim));
      strip.position.set(0, legH + torsoH / 2, 0.135);
      g.add(strip);
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.05, torsoH * 0.7, 0.015), mat(0x8a1f2b, dim));
      tie.position.set(0, legH + torsoH * 0.45, 0.15);
      g.add(tie);
      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.28), mat(0x2a2320, dim));
      hair.position.set(0, legH + torsoH + height * 0.15 * 1.45, -0.01);
      g.add(hair);
      const briefcase = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.4), mat(0x3b2a1f, dim));
      briefcase.position.set(0.42, legH * 0.45, 0);
      g.add(briefcase);
      return g;
    }
    case "nurse": {
      const { g, legH, torsoH, headS } = body({ height, shirt: 0x3fa1a8, trousers: 0x3fa1a8, skin: 0xd8a98a, shoes: 0xf5f5f5 }, dim);
      // Hair tied back, lanyard, a cardigan over the scrubs because it's cold out.
      const hair = new THREE.Mesh(new THREE.BoxGeometry(headS * 1.45, headS * 0.5, headS * 1.35), mat(0x3a2a22, dim));
      hair.position.set(0, legH + torsoH + headS * 1.35, -0.02);
      g.add(hair);
      const bun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), mat(0x3a2a22, dim));
      bun.position.set(0, legH + torsoH + headS * 1.1, -headS * 0.8);
      g.add(bun);
      const cardigan = new THREE.Mesh(new THREE.BoxGeometry(0.5, torsoH * 0.8, 0.3), mat(0x6c6f78, dim));
      cardigan.position.set(0, legH + torsoH * 0.55, -0.01);
      g.add(cardigan);
      const lanyard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.01), mat(0xf5f5f5, dim));
      lanyard.position.set(0.08, legH + torsoH * 0.5, 0.165);
      g.add(lanyard);
      return g;
    }
  }
}

/** The player, as the cameras see them: store shirt, apron, name badge. */
export function buildStaff(): THREE.Group {
  const { g, legH, torsoH } = body({ height: 1.76, shirt: 0xb03a30, trousers: 0x2b2f36, skin: SKIN, shoes: 0x1a1a1a }, false);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(0.36, torsoH * 0.95 + legH * 0.35, 0.03), mat(0x2e3238, false));
  apron.position.set(0, legH + torsoH * 0.45 - legH * 0.17, 0.145);
  g.add(apron);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.01), mat(0xf2f2f2, false));
  badge.position.set(-0.12, legH + torsoH * 0.8, 0.165);
  g.add(badge);
  return g;
}

/** For the final frame and tests: a plain customer-shaped stand-in for a given regular. */
export function customerStandIn(cu: Pick<Customer, "regular" | "wrong">): THREE.Group {
  return buildRegular(cu.regular, cu.wrong);
}
