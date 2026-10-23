/**
 * Every tunable number lives here. Nothing else in the game should carry a magic number
 * that someone might want to tweak later.
 *
 * Coordinates: metres, Y up. The store is centred on the origin: X runs left→right
 * (-6..6), Z runs front→back (-4 is the front wall with the windows, +4 is the fridge wall).
 * The lot is at negative Z, outside the front wall.
 */

export const TUNING = {
  night: {
    /** One night in real seconds. */
    realSeconds: 600,
    /** Wall-clock minutes since midnight when the shift starts (23:00). */
    clockStart: 23 * 60,
    /** Wall-clock minutes since midnight when the shift ends (06:00 next morning). */
    clockEnd: 30 * 60,
    /** Nights in the game. */
    count: 5,
  },

  player: {
    eyeHeight: 1.6,
    /** Collision radius against walls and furniture. */
    radius: 0.32,
    walkSpeed: 2.2, // m/s
    mouseSensitivity: 0.0022,
    /** How far up/down the player can look, in radians from level. */
    maxPitch: Math.PI / 2 - 0.08,
    /** Behind the till, facing the front door (yaw 0 looks toward -Z). */
    spawn: { x: -3.9, z: -1.5, yaw: 0 },
  },

  store: {
    width: 12, // X
    depth: 8, // Z
    height: 3,
    wallThickness: 0.2,
    frontWall: {
      /** Solid strip under the glass. */
      sillHeight: 0.8,
      /** Top of the glass; above it the wall is solid again. */
      glassTop: 2.4,
      doorWidth: 1.2,
      doorHeight: 2.3,
    },
    counter: {
      x: -3.9,
      z: -2.5,
      width: 3.2,
      depth: 0.7,
      height: 1.0,
    },
    shelves: {
      /** X centre of each gondola row. Three rows → two inner aisles plus the open areas at the walls. */
      rowX: [-1.4, 1.6, 4.6],
      zStart: -0.8,
      /** Leaves a clear walkway in front of the fridges. */
      zEnd: 2.4,
      width: 0.9,
      height: 1.8,
      levels: 4,
    },
    fridges: {
      xStart: -5.6,
      xEnd: 3.4,
      unitWidth: 1.5,
      depth: 0.75,
      height: 2.2,
    },
    /** Doors on the right wall (X = +6). Z is the door centre. */
    rightWallDoors: {
      toilet: { z: -2.0, width: 0.9, height: 2.1 },
      manager: { z: 0.3, width: 0.9, height: 2.1 },
      backRoom: { z: 3.0, width: 1.0, height: 2.1 },
    },
    backRoom: {
      /** Extends from the right wall outward along +X. */
      width: 4,
      depth: 4,
      /** Z centre; lines up with the back-room door. */
      z: 3.0,
    },
  },

  lot: {
    /** Asphalt in front of the store. */
    depth: 14,
    width: 40,
    road: { zStart: -18, zEnd: -24 },
    streetlight: { x: 4.5, z: -9.5, height: 5 },
    dumpster: { x: -9, z: -6.5 },
    busShelter: { x: 1, z: -27 },
    /** Where the fog swallows everything. */
    fogNear: 14,
    fogFar: 42,
  },

  lighting: {
    /** Fluorescent ceiling panels: two columns, three rows. */
    panelCols: [-3, 3],
    panelRows: [-2.4, 0.2, 2.8],
    panelIntensity: 7,
    panelDistance: 9,
    hemisphere: 0.35,
    fridgeGlow: 2.5,
    streetlight: 40,
    backRoomBulb: 3,
  },

  render: {
    fov: 72,
    near: 0.05,
    far: 80,
    /** Cap the device pixel ratio so laptops don't melt. */
    maxPixelRatio: 1.5,
  },
} as const;

/** Debug switches read from the URL so testers can jump around. */
export interface DebugOptions {
  /** Start on this night. */
  night: number;
  /** Multiply the speed of the clock (10 = a night in one minute). */
  timeScale: number;
}

export function readDebugOptions(search: string): DebugOptions {
  const params = new URLSearchParams(search);
  const night = clampInt(Number(params.get("night") ?? 1), 1, TUNING.night.count + 1);
  const timeScale = Number(params.get("speed") ?? 1);
  return {
    night,
    timeScale: Number.isFinite(timeScale) && timeScale > 0 ? timeScale : 1,
  };
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
