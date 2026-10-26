import type { RegularId } from "@/config/tuning";

/**
 * Every anomaly is one entry. The engine in game/anomalies.ts knows how to perform each
 * `tell` kind; adding a new anomaly of an existing kind is a new entry here, not new code.
 *
 * Times are wall-clock "HH:MM"; hours before 12 mean the next morning.
 */
export type FigureStage = "shelter" | "road" | "lot" | "window";

export type Tell =
  /** The figure stands outside at a stage. Gone after the window, or after it has been seen on CAM 3 and the feed closed. */
  | { kind: "figure"; stage: FigureStage; seconds: number }
  /** Something stands at the end of an aisle, watching. Look straight at it and it slips behind the shelves. */
  | { kind: "peeker"; seconds?: number }
  /**
   * A man hanging at the end of an aisle under one cold tube. Still at first. Looked at for a
   * while: his head tilts. Longer: the tube flickers out and when it's back he hangs lower,
   * face up toward the player. Look away and back: gone. `rush` instead sends him at the player.
   */
  | { kind: "hanging"; seconds?: number; rush?: boolean; tiltAfter?: number; flickerAfter?: number }
  /** A regular whose camera image stands one aisle over from where they really are. Serving them breaks rule 2. */
  | { kind: "wrongCustomer"; regular?: RegularId }
  /** A regular who, once served, doesn't leave: back to you at the counter, closer each time you look away, then gone. */
  | { kind: "lingerer"; regular?: RegularId }
  /** An empty cart at the end of an aisle that is closer every time you look back. */
  | { kind: "cart"; seconds?: number }
  /** The wall clock runs ahead of the real time and the note says something it didn't. */
  | { kind: "clockLie"; seconds?: number; minutes?: number }
  /** The phone again: your own footsteps on the line, then knocks. */
  | { kind: "secondPhone"; seconds?: number }
  /** One ceiling light follows you, then lags, then lights where you were. */
  | { kind: "lightFollow"; seconds?: number }
  /** A spill with nobody near it. */
  | { kind: "spill"; x: number; z: number }
  /** Lights go out for `seconds`, then come back by themselves — unless the fuse box is used. Waiting it out: the peeker is there when they return. */
  | { kind: "lightsOut"; seconds: number }
  /** The phone on the counter rings for `seconds`. */
  | { kind: "phone"; seconds: number }
  /** A knock from inside the back room. */
  | { kind: "knock" }
  /** The manager key appears in the back room. */
  | { kind: "managerKey" };

export interface Anomaly {
  id: string;
  night: number;
  /** Fires at or after this wall-clock time. */
  at: string;
  tell: Tell;
  /** The rule (1-based) this one tests, for the end-of-night tally. */
  rule?: number;
}

export const ANOMALIES: Anomaly[] = [
  // Night 1 — normal. One tell most players won't notice.
  { id: "n1-figure-shelter", night: 1, at: "03:00", tell: { kind: "figure", stage: "shelter", seconds: 240 } },

  // Night 2 — something at the end of an aisle; a customer the cameras put in the wrong place; a cart; the figure across the road; a spill nobody made; a customer who won't go.
  { id: "n2-peeker", night: 2, at: "00:50", tell: { kind: "peeker", seconds: 45 } },
  { id: "n2-wrong", night: 2, at: "01:20", tell: { kind: "wrongCustomer" }, rule: 2 },
  { id: "n2-figure-road", night: 2, at: "02:30", tell: { kind: "figure", stage: "road", seconds: 300 } },
  { id: "n2-cart", night: 2, at: "02:50", tell: { kind: "cart", seconds: 70 } },
  { id: "n2-spill-far", night: 2, at: "03:40", tell: { kind: "spill", x: 3.1, z: 1.8 } },
  { id: "n2-lingerer", night: 2, at: "04:20", tell: { kind: "lingerer" } },

  // Night 3 — lights out; the fuse box or the till; it's inside more often.
  { id: "n3-peeker-a", night: 3, at: "00:30", tell: { kind: "peeker", seconds: 40 } },
  { id: "n3-clock", night: 3, at: "01:55", tell: { kind: "clockLie", seconds: 45, minutes: 13 } },
  { id: "n3-lights", night: 3, at: "02:30", tell: { kind: "lightsOut", seconds: 45 }, rule: 3 },
  { id: "n3-figure-road", night: 3, at: "04:10", tell: { kind: "figure", stage: "road", seconds: 240 } },
  { id: "n3-peeker-b", night: 3, at: "05:10", tell: { kind: "peeker", seconds: 40 } },

  // Night 4 — the phone; the figure at the window.
  { id: "n4-figure-lot", night: 4, at: "00:40", tell: { kind: "figure", stage: "lot", seconds: 200 } },
  { id: "n4-wrong", night: 4, at: "01:10", tell: { kind: "wrongCustomer" }, rule: 2 },
  { id: "n4-peeker-a", night: 4, at: "01:50", tell: { kind: "peeker", seconds: 50 } },
  { id: "n4-hanging", night: 4, at: "02:40", tell: { kind: "hanging", seconds: 90 } },
  { id: "n4-phone", night: 4, at: "03:10", tell: { kind: "phone", seconds: 28 }, rule: 5 },
  { id: "n4-figure-window", night: 4, at: "04:00", tell: { kind: "figure", stage: "window", seconds: 90 } },
  { id: "n4-peeker-b", night: 4, at: "04:50", tell: { kind: "peeker", seconds: 50 } },

  // Night 5 — everything, faster; the knock; the key.
  { id: "n5-peeker-a", night: 5, at: "23:40", tell: { kind: "peeker", seconds: 45 } },
  { id: "n5-light", night: 5, at: "00:30", tell: { kind: "lightFollow", seconds: 90 } },
  { id: "n5-figure-lot", night: 5, at: "01:00", tell: { kind: "figure", stage: "lot", seconds: 240 } },
  { id: "n5-hanging", night: 5, at: "01:40", tell: { kind: "hanging", seconds: 90, rush: true } },
  { id: "n5-lights", night: 5, at: "02:20", tell: { kind: "lightsOut", seconds: 35 }, rule: 3 },
  { id: "n5-phone", night: 5, at: "03:05", tell: { kind: "phone", seconds: 30 }, rule: 5 },
  { id: "n5-peeker-b", night: 5, at: "03:40", tell: { kind: "peeker", seconds: 45 } },
  { id: "n5-phone-2", night: 5, at: "04:00", tell: { kind: "secondPhone", seconds: 40 } },
  { id: "n5-figure-window", night: 5, at: "04:20", tell: { kind: "figure", stage: "window", seconds: 150 } },
  { id: "n5-knock", night: 5, at: "05:00", tell: { kind: "knock" }, rule: 6 },
  { id: "n5-key", night: 5, at: "05:00", tell: { kind: "managerKey" } },
];

/**
 * The test night (?test): one of every kind, in a sensible order, spread evenly across the night.
 * Nothing here is reachable from normal play.
 */
export const TEST_NIGHT: Anomaly[] = (() => {
  const tells: Array<{ id: string; tell: Tell; rule?: number }> = [
    // First, and slow, so it can be looked at properly.
    { id: "t-hanging", tell: { kind: "hanging", seconds: 300, tiltAfter: 6, flickerAfter: 14 } },
    { id: "t-figure-shelter", tell: { kind: "figure", stage: "shelter", seconds: 90 } },
    { id: "t-wrong", tell: { kind: "wrongCustomer" }, rule: 2 },
    { id: "t-peeker", tell: { kind: "peeker", seconds: 40 } },
    { id: "t-cart", tell: { kind: "cart", seconds: 70 } },
    { id: "t-lingerer", tell: { kind: "lingerer" } },
    { id: "t-clock", tell: { kind: "clockLie", seconds: 45, minutes: 13 } },
    { id: "t-figure-road", tell: { kind: "figure", stage: "road", seconds: 90 } },
    { id: "t-spill", tell: { kind: "spill", x: 3.1, z: 1.8 } },
    { id: "t-lights", tell: { kind: "lightsOut", seconds: 30 }, rule: 3 },
    { id: "t-figure-lot", tell: { kind: "figure", stage: "lot", seconds: 90 } },
    { id: "t-phone", tell: { kind: "phone", seconds: 25 }, rule: 5 },
    { id: "t-light", tell: { kind: "lightFollow", seconds: 90 } },
    { id: "t-figure-window", tell: { kind: "figure", stage: "window", seconds: 60 } },
    { id: "t-hanging-rush", tell: { kind: "hanging", seconds: 120, rush: true } },
    { id: "t-phone-2", tell: { kind: "secondPhone", seconds: 40 } },
    { id: "t-peeker-2", tell: { kind: "peeker", seconds: 40 } },
    { id: "t-knock", tell: { kind: "knock" }, rule: 6 },
    { id: "t-key", tell: { kind: "managerKey" } },
  ];
  // 23:20 → 05:40, evenly.
  const first = 23 * 60 + 20;
  const last = 29 * 60 + 40;
  return tells.map((t, i) => {
    const m = Math.round(first + ((last - first) * i) / (tells.length - 1));
    const hh = Math.floor(m / 60) % 24;
    const mm = m % 60;
    return { ...t, night: 5, at: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` };
  });
})();
