import { TUNING } from "@/config/tuning";

/**
 * The whole game state, kept apart from rendering. Everything the renderer shows is
 * derived from this; everything the player does ends up changing it.
 *
 * Step 1 only needs the night and the clock. Chores, score, rules and anomalies
 * get added to this object in later build steps.
 */
export type NightStatus = "waiting" | "running" | "over";

export interface GameState {
  /** 1..5 normally; 6 is the bad ending's endless night. */
  night: number;
  /** Real seconds into the night, 0 ≤ elapsed ≤ TUNING.night.realSeconds. */
  elapsed: number;
  status: NightStatus;
}

export function createState(night = 1): GameState {
  return { night, elapsed: 0, status: "waiting" };
}

export function startNight(state: GameState): void {
  if (state.status === "waiting") state.status = "running";
}

/** Advance the night by dt real seconds. Does nothing unless the night is running. */
export function tick(state: GameState, dt: number): void {
  if (state.status !== "running" || dt <= 0) return;
  state.elapsed = Math.min(TUNING.night.realSeconds, state.elapsed + dt);
  if (state.elapsed >= TUNING.night.realSeconds) state.status = "over";
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

/** True on the frame the clock first reaches 06:00. */
export function isNightOver(state: GameState): boolean {
  return state.status === "over";
}
