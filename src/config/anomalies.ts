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

  // Night 2 — something at the end of an aisle; the figure across the road; a spill nobody made.
  { id: "n2-peeker", night: 2, at: "00:50", tell: { kind: "peeker", seconds: 45 } },
  { id: "n2-figure-road", night: 2, at: "02:30", tell: { kind: "figure", stage: "road", seconds: 300 } },
  { id: "n2-spill-far", night: 2, at: "03:40", tell: { kind: "spill", x: 3.1, z: 1.8 } },

  // Night 3 — lights out; the fuse box or the till; it's inside more often.
  { id: "n3-peeker-a", night: 3, at: "00:30", tell: { kind: "peeker", seconds: 40 } },
  { id: "n3-lights", night: 3, at: "02:30", tell: { kind: "lightsOut", seconds: 45 }, rule: 3 },
  { id: "n3-figure-road", night: 3, at: "04:10", tell: { kind: "figure", stage: "road", seconds: 240 } },
  { id: "n3-peeker-b", night: 3, at: "05:10", tell: { kind: "peeker", seconds: 40 } },

  // Night 4 — the phone; the figure at the window.
  { id: "n4-figure-lot", night: 4, at: "00:40", tell: { kind: "figure", stage: "lot", seconds: 200 } },
  { id: "n4-peeker-a", night: 4, at: "01:50", tell: { kind: "peeker", seconds: 50 } },
  { id: "n4-phone", night: 4, at: "03:10", tell: { kind: "phone", seconds: 28 }, rule: 5 },
  { id: "n4-figure-window", night: 4, at: "04:00", tell: { kind: "figure", stage: "window", seconds: 90 } },
  { id: "n4-peeker-b", night: 4, at: "04:50", tell: { kind: "peeker", seconds: 50 } },

  // Night 5 — everything, faster; the knock; the key.
  { id: "n5-peeker-a", night: 5, at: "23:40", tell: { kind: "peeker", seconds: 45 } },
  { id: "n5-figure-lot", night: 5, at: "01:00", tell: { kind: "figure", stage: "lot", seconds: 240 } },
  { id: "n5-lights", night: 5, at: "02:20", tell: { kind: "lightsOut", seconds: 35 }, rule: 3 },
  { id: "n5-phone", night: 5, at: "03:05", tell: { kind: "phone", seconds: 30 }, rule: 5 },
  { id: "n5-peeker-b", night: 5, at: "03:40", tell: { kind: "peeker", seconds: 45 } },
  { id: "n5-figure-window", night: 5, at: "04:20", tell: { kind: "figure", stage: "window", seconds: 150 } },
  { id: "n5-knock", night: 5, at: "05:00", tell: { kind: "knock" }, rule: 6 },
  { id: "n5-key", night: 5, at: "05:00", tell: { kind: "managerKey" } },
];
