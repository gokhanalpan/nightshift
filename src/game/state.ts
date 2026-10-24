import { TUNING, type RegularId } from "@/config/tuning";
import type { FigureStage } from "@/config/anomalies";
import { shelfSlots } from "@/game/layout";
import { seedForNight } from "@/game/rng";

/**
 * The whole game state, kept apart from rendering. Everything the renderer shows is
 * derived from this; everything the player does ends up changing it.
 */
export type NightStatus = "waiting" | "running" | "over";

/** entering: walking to a shelf · browsing: standing at it · toQueue: walking to the till · queued · leaving · gone */
export type CustomerPhase = "entering" | "browsing" | "toQueue" | "queued" | "leaving" | "gone";

export interface Customer {
  id: number;
  x: number;
  z: number;
  /** Facing, radians; 0 faces +Z (toward the counter from the queue). */
  yaw: number;
  phase: CustomerPhase;
  /** Index in the queue while queued; 0 is at the till. */
  queueIndex: number;
  /** Seconds spent queued. */
  waited: number;
  /** Waypoints still to walk, in order. */
  path: Array<{ x: number; z: number }>;
  /** The shelf slot they are going to take from, and where they stand to do it. */
  shelf: { slotId: string; x: number; z: number } | null;
  /** Seconds left standing at the shelf. */
  browse: number;
  /** Appearance seed for the renderer. */
  look: number;
  /** Which regular this is. */
  regular: RegularId;
  /** Anomaly flags. A wrong customer never shows on the camera feeds. */
  wrong: boolean;
  onCamera: boolean;
  /** Makes no footsteps or chime. */
  silent: boolean;
  /** This is the second time tonight. */
  repeat: boolean;
  /** Player has greeted them (G). */
  greeted: boolean;
  /** Leaves without walking: just gone. */
  vanishes: boolean;
}

export interface FigureState {
  stage: FigureStage;
  /** Elapsed-time when it goes away by itself. */
  until: number;
  /** It has been on CAM 3 while the player watched; it goes when the feed closes. */
  seenOnCam: boolean;
}

export interface Lights {
  out: boolean;
  /** Elapsed-time when they come back by themselves (while out). */
  restoreAt: number;
  /** A regular arrives at the till in the dark if the player waits. */
  thenAtTill: RegularId | null;
  /** The fuse box was used tonight. */
  fuseUsed: boolean;
}

export type Ending = "good" | "bad" | "secret" | null;

export interface Spill {
  id: number;
  x: number;
  z: number;
  age: number;
}

export interface SlotState {
  filled: boolean;
  /** Elapsed-time when it was emptied; only meaningful while !filled. */
  emptySince: number;
}

export interface Ping {
  feed: number;
  age: number;
  /** Seconds the correct feed has been on screen. */
  watched: number;
}

export type Action =
  | { kind: "takeBox" }
  | { kind: "putBack" }
  | { kind: "pickUp" }
  | { kind: "restock"; slotId: string }
  | { kind: "serve"; customerId: number }
  | { kind: "mop"; spillId: number }
  | { kind: "cameras" }
  | { kind: "door" }
  | { kind: "leave" }
  | { kind: "fuse" }
  | { kind: "phone" }
  | { kind: "takeKey" }
  | { kind: "managerDoor" }
  | { kind: "readNote" };

export interface ActiveAction {
  action: Action;
  /** 0..1 */
  progress: number;
}

export interface Stats {
  restocked: number;
  served: number;
  mopped: number;
  pingsAnswered: number;
  pingsMissed: number;
  walkouts: number;
}

export interface GameState {
  /** 1..5 normally; 6 is the bad ending's endless night. */
  night: number;
  /** Real seconds into the night, 0 ≤ elapsed ≤ TUNING.night.realSeconds. */
  elapsed: number;
  status: NightStatus;
  rng: number;

  score: number;
  stats: Stats;

  slots: Record<string, SlotState>;
  /** Items left in the box the player is carrying; 0 = empty-handed. */
  carrying: number;
  /** A box set down on the floor, with what's left in it. */
  droppedBox: { x: number; z: number; items: number } | null;
  customers: Customer[];
  spills: Spill[];
  ping: Ping | null;
  /** Feed index on screen while in camera mode, else null. */
  viewingFeed: number | null;
  /** Hold-E action in progress. */
  action: ActiveAction | null;

  /** Elapsed-times at which the next thing of each kind happens. */
  next: { restock: number; customer: number; spill: number; ping: number };
  nextId: number;
  /** Last thing worth telling the player, for a brief HUD line. */
  notice: { text: string; at: number } | null;
  /** First-night hints already shown, so each appears once. */
  hintsShown: string[];

  // --- Steps 3 and 4 ---
  /** Regulars who have been in tonight, in order. */
  visited: RegularId[];
  /** Rules (1-based) broken tonight; each at most once. */
  rulesBroken: number[];
  /** Rules broken on earlier nights this week. */
  strikes: number;
  doorLocked: boolean;
  figure: FigureState | null;
  lights: Lights;
  /** The dark figure in the back room, until this elapsed-time. */
  backRoomFigure: number | null;
  /** The phone is ringing until this elapsed-time; answered stops it. */
  phone: { until: number; answered: boolean } | null;
  knocked: boolean;
  keyVisible: boolean;
  hasKey: boolean;
  anomaliesFired: string[];
  /** The player is reading the rules note (movement frozen). */
  reading: boolean;
  ending: Ending;
  /** Night 6: nothing happens, nothing ends. */
  endless: boolean;
}

export function createState(night = 1, strikes = 0): GameState {
  const slots: Record<string, SlotState> = {};
  for (const s of shelfSlots()) slots[s.id] = { filled: true, emptySince: 0 };
  const c = TUNING.chores;
  return {
    night,
    elapsed: 0,
    status: "waiting",
    rng: seedForNight(night),
    score: TUNING.score.start,
    stats: { restocked: 0, served: 0, mopped: 0, pingsAnswered: 0, pingsMissed: 0, walkouts: 0 },
    slots,
    carrying: 0,
    droppedBox: null,
    customers: [],
    spills: [],
    ping: null,
    viewingFeed: null,
    action: null,
    next: {
      restock: mid(c.restock.first),
      customer: mid(c.customer.first),
      spill: mid(c.spill.first),
      ping: mid(c.ping.first),
    },
    nextId: 1,
    notice: null,
    hintsShown: [],
    visited: [],
    rulesBroken: [],
    strikes,
    doorLocked: false,
    figure: null,
    lights: { out: night > TUNING.night.count, restoreAt: 0, thenAtTill: null, fuseUsed: false },
    backRoomFigure: null,
    phone: null,
    knocked: false,
    keyVisible: false,
    hasKey: false,
    anomaliesFired: [],
    reading: false,
    ending: null,
    endless: night > TUNING.night.count,
  };
}

function mid(range: readonly [number, number]): number {
  return (range[0] + range[1]) / 2;
}

export function startNight(state: GameState): void {
  if (state.status === "waiting") state.status = "running";
}

/** Advance the clock by dt real seconds. Chores are advanced separately in chores.ts. */
export function tickClock(state: GameState, dt: number): void {
  if (state.status !== "running" || dt <= 0) return;
  state.elapsed = Math.min(TUNING.night.realSeconds, state.elapsed + dt);
  if (state.elapsed >= TUNING.night.realSeconds) {
    if (state.endless) state.elapsed = 0; // night 6: 06:00 becomes 23:00 again
    else state.status = "over";
  }
}

/** 0 at 23:00, 1 at 06:00. */
export function nightProgress(state: GameState): number {
  return state.elapsed / TUNING.night.realSeconds;
}

/** Wall-clock minutes since midnight of the first day (so 06:00 next morning is 1800). */
export function clockMinutes(state: GameState): number {
  const { clockStart, clockEnd } = TUNING.night;
  return clockStart + nightProgress(state) * (clockEnd - clockStart);
}

/** "23:00", "02:30", "06:00". Floors to the minute. */
export function formatClock(minutesSinceMidnight: number): string {
  const total = Math.floor(minutesSinceMidnight) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function clockString(state: GameState): string {
  return formatClock(clockMinutes(state));
}

export function isNightOver(state: GameState): boolean {
  return state.status === "over";
}

export function addScore(state: GameState, delta: number): void {
  state.score = Math.max(TUNING.score.min, Math.min(TUNING.score.max, state.score + delta));
}

export function notify(state: GameState, text: string): void {
  state.notice = { text, at: state.elapsed };
}
