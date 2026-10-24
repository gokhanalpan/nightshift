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
    /** Ceiling brightness by night, and the extra dimming after 03:00. */
    nightDim: { 1: 1, 2: 0.92, 3: 0.84, 4: 0.76, 5: 0.68 } as Record<number, number>,
    lateDim: 0.85,
    lateFrom: "03:00",
    /** Seconds of flicker before a blackout; and the odd flicker, every [min, max] s, from night 2. */
    preBlackoutFlicker: 3,
    strayFlicker: [50, 110],
    strayFlickerFromNight: 2,
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

  /** Step 2: chores, scoring and the things the player can interact with. */
  interact: {
    /** How far from the eye an interactable can be used, and how centred it must be (cos of the cone half-angle). */
    range: 2.4,
    cone: 0.82,
    /** Hold-E durations in seconds. */
    duration: { takeBox: 0.6, restock: 1.2, serve: 2.0, mop: 3.0 },
    /** Fixed interaction points. The monitor and the till sit on the counter; the stock pile is in the back room. */
    points: {
      monitor: { x: -4.7, y: 1.2, z: -2.45 },
      till: { x: -3.0, y: 1.1, z: -2.5 },
      stockPile: { x: 6.8, y: 0.9, z: 4.4 },
    },
  },

  chores: {
    /** Spawn intervals in real seconds [min, max]; the first spawn of each kind is offset so they don't all land together. */
    /** Shelves also empty when customers take things; this is the extra "stock just ran out" trickle. */
    restock: { first: [20, 30], every: [100, 160], initialEmpty: 2, boxItems: 3 },
    customer: { first: [12, 20], every: [38, 70], maxQueue: 3, walkSpeed: 1.25, browse: [2.5, 5] },
    spill: { first: [60, 90], every: [100, 150] },
    ping: { first: [40, 60], every: [80, 130], expires: 60, confirmSeconds: 1.0, beepEvery: 4 },
    /** Customers shop along these shelf faces (row index, side); the left face of row 0 is the staff side. */
    shopFaces: [
      { row: 0, side: 1 },
      { row: 1, side: -1 },
      { row: 1, side: 1 },
      { row: 2, side: -1 },
      { row: 2, side: 1 },
    ],
    /** How far from the shelf face a browsing customer stands, and the clear corridor Z in front of the shelves. */
    browseOffset: 0.75,
    corridorZ: -1.7,
    /** Queue spots in front of the till; index 0 is being served. Customers face +Z (the counter). */
    queue: [
      { x: -3.0, z: -3.45 },
      { x: -1.9, z: -3.45 },
      { x: -0.8, z: -3.45 },
    ],
    /** Customers come in through the front door and leave the same way. */
    doorPath: { outside: { x: 0, z: -5.4 }, inside: { x: 0, z: -3.45 } },
    /** Where spills can appear: open floor in the aisles and in front of the counter. */
    spillPoints: [
      { x: 0.1, z: 0.4 },
      { x: 0.1, z: 1.9 },
      { x: 3.1, z: 0.3 },
      { x: 3.1, z: 1.8 },
      { x: -3.5, z: 1.0 },
      { x: -4.4, z: 2.7 },
      { x: 5.5, z: 0.0 },
      { x: 1.5, z: -2.0 },
      { x: -1.0, z: -2.9 },
      { x: 3.6, z: -3.0 },
    ],
  },

  /** The five regulars. Faces are shelf faces they shop from (row index, side). */
  regulars: {
    hoodie: { name: "hoodie guy", height: 1.78, walkSpeed: 1.2, browse: [3, 6], faces: [{ row: 2, side: -1 }, { row: 2, side: 1 }] },
    oldwoman: { name: "the old woman", height: 1.55, walkSpeed: 0.75, browse: [5, 9], faces: [{ row: 1, side: -1 }] },
    kid: { name: "the kid", height: 1.25, walkSpeed: 1.55, browse: [2, 3.5], faces: [{ row: 0, side: 1 }] },
    suit: { name: "the suited man", height: 1.86, walkSpeed: 1.35, browse: [1.5, 3], faces: [{ row: 1, side: 1 }] },
    nurse: { name: "the nurse", height: 1.68, walkSpeed: 1.15, browse: [3, 5], faces: [{ row: 2, side: -1 }] },
  },

  /** Night 5 is "everything, faster": spawn intervals are divided by this. */
  nightPace: { 1: 1, 2: 1, 3: 1.1, 4: 1.25, 5: 1.6 } as Record<number, number>,

  rules: {
    /** The note's lines, in the order they appear. Night N shows the first (2 + N). */
    lines: [
      "Lock the door at 02:00, unlock at 05:00.",
      "Don't serve customers who don't appear on camera.",
      "If the lights go out, wait at the till. Do not go to the fuse box.",
      "If the same customer comes in twice, do not greet them the second time.",
      "If the phone rings after 03:00, don't pick up.",
      "If someone knocks on the back room door from the inside, it's time to leave.",
      "There is no night 6.",
    ],
    /** Line indexes (0-based) struck through on night 4 and later. */
    crossedOutFrom: { night: 4, lines: [1, 2] },
    /** Minutes of slack around the lock/unlock times before rule 1 counts as broken. */
    doorGraceMinutes: 12,
    lockAt: "02:00",
    unlockAt: "05:00",
    /** Score hit when a rule is broken, and the small bonus for greeting a customer promptly. */
    brokenPenalty: 10,
    /** Rules broken over the week before the morning stops coming. Night 5 allows none. */
    strikesToLose: 3,
    greetReward: 1,
    greetWindow: 12,
  },

  /** Where the figure stands outside, by stage. Nearer each night. */
  figure: {
    /** How much dread (drone, vignette) each stage carries. */
    dread: { shelter: 0.2, road: 0.35, lot: 0.6, window: 1.0 } as Record<string, number>,
    stages: {
      shelter: { x: 1.0, z: -26.4, yaw: 0 },
      road: { x: 0.6, z: -20.6, yaw: 0 },
      lot: { x: 2.4, z: -8.2, yaw: 0 },
      window: { x: 2.6, z: -4.75, yaw: 0 },
    },
    /** Where the figure stands in the back room on night 3, and at the till in the final frame. */
    backRoom: { x: 8.4, z: 3.0, yaw: -Math.PI / 2 },
    till: { x: -3.9, z: -1.6, yaw: 0 },
  },

  props: {
    phone: { x: -2.6, y: 1.12, z: -2.6 },
    fuseBox: { x: 10.2, y: 1.5, z: 2.4 },
    managerKey: { x: 9.0, y: 0.95, z: 1.6 },
    note: { x: -2.1, y: 1.0, z: -2.4 },
    frontDoor: { x: 0, y: 1.0, z: -3.8 },
    managerDoor: { x: 5.8, y: 1.0, z: 0.3 },
    /** The player counts as "at the till" within this distance of the spawn point. */
    tillRadius: 1.6,
  },

  score: {
    start: 50,
    min: 0,
    max: 100,
    /** Each chore: seconds before it starts costing, cost per second after that, reward for doing it, and a flat penalty if it fails outright. */
    restock: { grace: 90, perSecond: 0.03, reward: 3 },
    serve: { grace: 20, perSecond: 0.06, reward: 4, patience: 70, walkout: 8 },
    mop: { grace: 45, perSecond: 0.03, reward: 3 },
    ping: { reward: 3, missed: 6 },
    /** Good ending needs at least this at 06:00 (used from step 5). */
    goodEnding: 60,
  },

  cameras: {
    /** Four feeds: position, what the camera points at, label. */
    feeds: [
      { label: "CAM 1  SHOP", pos: { x: 5.6, y: 2.8, z: -3.6 }, at: { x: 0.0, y: 0.9, z: 1.6 } },
      { label: "CAM 2  BACK ROOM", pos: { x: 9.9, y: 2.8, z: 1.3 }, at: { x: 7.2, y: 0.8, z: 3.6 } },
      { label: "CAM 3  LOT", pos: { x: 0.0, y: 3.4, z: -4.5 }, at: { x: 1.5, y: 0.4, z: -17 } },
      { label: "CAM 4  AISLE", pos: { x: -5.6, y: 2.8, z: 3.8 }, at: { x: -3.4, y: 0.9, z: -2.2 } },
    ],
    fov: 80,
  },

  render: {
    fov: 72,
    near: 0.05,
    far: 80,
    /** Cap the device pixel ratio so laptops don't melt. */
    maxPixelRatio: 1.5,
  },
} as const;

export type RegularId = keyof typeof TUNING.regulars;

/** "03:00" → minutes since midnight of the first evening (hours before 12 are the next morning). */
export function clockToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return (h < 12 ? h + 24 : h) * 60 + m;
}

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
