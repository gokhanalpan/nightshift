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
  /** A regular comes in who does not show up on the cameras. `repeat` picks someone who has already been in tonight. */
  | { kind: "wrongCustomer"; regular?: RegularId; repeat?: boolean; atTill?: boolean; silent?: boolean }
  /** A spill with nobody near it. */
  | { kind: "spill"; x: number; z: number }
  /** Lights go out for `seconds`, then come back by themselves — unless the fuse box is used. */
  | { kind: "lightsOut"; seconds: number; thenAtTill?: RegularId }
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

  // Night 2 — hoodie guy isn't on camera; the figure is across the road; a spill nobody made.
  { id: "n2-hoodie-ghost", night: 2, at: "00:40", tell: { kind: "wrongCustomer", regular: "hoodie" }, rule: 2 },
  { id: "n2-figure-road", night: 2, at: "02:30", tell: { kind: "figure", stage: "road", seconds: 300 } },
  { id: "n2-spill-far", night: 2, at: "03:40", tell: { kind: "spill", x: 3.1, z: 1.8 } },

  // Night 3 — lights out; the fuse box or the till; the old woman twice.
  { id: "n3-lights", night: 3, at: "02:30", tell: { kind: "lightsOut", seconds: 45, thenAtTill: "oldwoman" }, rule: 3 },
  { id: "n3-figure-road", night: 3, at: "04:10", tell: { kind: "figure", stage: "road", seconds: 240 } },

  // Night 4 — the phone; the figure at the window; the kid twice.
  { id: "n4-phone", night: 4, at: "03:10", tell: { kind: "phone", seconds: 28 }, rule: 5 },
  { id: "n4-figure-lot", night: 4, at: "01:20", tell: { kind: "figure", stage: "lot", seconds: 200 } },
  { id: "n4-figure-window", night: 4, at: "04:00", tell: { kind: "figure", stage: "window", seconds: 90 } },
  { id: "n4-kid-twice", night: 4, at: "02:05", tell: { kind: "wrongCustomer", regular: "kid", repeat: true }, rule: 4 },

  // Night 5 — everything, faster; the knock; the key.
  { id: "n5-suit-ghost", night: 5, at: "00:30", tell: { kind: "wrongCustomer", regular: "suit" }, rule: 2 },
  { id: "n5-figure-lot", night: 5, at: "01:00", tell: { kind: "figure", stage: "lot", seconds: 240 } },
  { id: "n5-lights", night: 5, at: "02:20", tell: { kind: "lightsOut", seconds: 35, thenAtTill: "nurse" }, rule: 3 },
  { id: "n5-phone", night: 5, at: "03:05", tell: { kind: "phone", seconds: 30 }, rule: 5 },
  { id: "n5-nurse-twice", night: 5, at: "03:40", tell: { kind: "wrongCustomer", repeat: true, silent: true }, rule: 4 },
  { id: "n5-figure-window", night: 5, at: "04:20", tell: { kind: "figure", stage: "window", seconds: 150 } },
  { id: "n5-knock", night: 5, at: "05:00", tell: { kind: "knock" }, rule: 6 },
  { id: "n5-key", night: 5, at: "05:00", tell: { kind: "managerKey" } },
];
