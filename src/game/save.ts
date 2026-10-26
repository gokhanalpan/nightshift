import { TUNING } from "@/config/tuning";
import { createState, type GameState } from "@/game/state";

/**
 * Everything persistent lives under one key. The game state is plain data, so a mid-night
 * snapshot is just the state itself; progress is what survives from night to night.
 * Export/import later is a matter of handing this object to the player as a file.
 */
export const SAVE_KEY = "night-shift:save";
const VERSION = 1;

export interface Progress {
  /** The next night to play (1 at a fresh start). */
  night: number;
  /** Manager score at the end of each finished night, by night number. */
  scores: Record<number, number>;
  /** Rules broken so far this week. */
  strikes: number;
}

export interface SaveFile {
  version: number;
  progress: Progress;
  /** The night in progress, if the player quit mid-shift. */
  snapshot: GameState | null;
  savedAt: number;
}

export function emptySave(): SaveFile {
  return { version: VERSION, progress: { night: 1, scores: {}, strikes: 0 }, snapshot: null, savedAt: 0 };
}

export function loadSave(storage: Storage | null = safeStorage()): SaveFile {
  if (!storage) return emptySave();
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw) as Partial<SaveFile>;
    if (parsed.version !== VERSION || !parsed.progress) return emptySave();
    const snapshot = isUsableSnapshot(parsed.snapshot) ? normalizeSnapshot(parsed.snapshot) : null;
    return {
      version: VERSION,
      progress: {
        night: clampNight(parsed.progress.night),
        scores: parsed.progress.scores ?? {},
        strikes: typeof parsed.progress.strikes === "number" ? parsed.progress.strikes : 0,
      },
      snapshot,
      savedAt: parsed.savedAt ?? 0,
    };
  } catch {
    return emptySave();
  }
}

export function writeSave(save: SaveFile, storage: Storage | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify({ ...save, savedAt: Date.now() }));
  } catch {
    // Private mode or full storage: the game still plays, it just won't remember.
  }
}

export function clearSave(storage: Storage | null = safeStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

/** Store the running night so a reload picks up where it left off. */
export function snapshotNight(save: SaveFile, state: GameState): SaveFile {
  const snapshot = state.status === "running" ? structuredClone(state) : null;
  return { ...save, snapshot };
}

/** A night has ended: record the score, move on, and drop the snapshot. */
export function finishNight(save: SaveFile, state: GameState): SaveFile {
  const scores = { ...save.progress.scores, [state.night]: Math.round(state.score) };
  const night = clampNight(state.night + 1);
  const strikes = save.progress.strikes + state.rulesBroken.length;
  return { ...save, progress: { night, scores, strikes }, snapshot: null };
}

/**
 * Fill in anything a snapshot from an older build is missing, and never resume mid-action
 * or inside camera mode. New state fields must have defaults in createState for this to work.
 */
function normalizeSnapshot(snap: GameState): GameState {
  const fresh = createState(snap.night, typeof snap.strikes === "number" ? snap.strikes : 0);
  const carrying = typeof snap.carrying === "number" ? snap.carrying : snap.carrying ? 1 : 0;
  const customers = (Array.isArray(snap.customers) ? snap.customers : [])
    .filter((c) => typeof c.regular === "string" && c.regular in TUNING.regulars)
    .map((c) => ({
      ...c,
      path: Array.isArray(c.path) ? c.path : [],
      shelf: c.shelf ?? null,
      browse: typeof c.browse === "number" ? c.browse : 0,
      waited: typeof c.waited === "number" ? c.waited : 0,
      wrong: c.wrong ?? false,
      onCamera: c.onCamera ?? true,
      silent: c.silent ?? false,
      repeat: c.repeat ?? false,
      greeted: c.greeted ?? false,
      vanishes: c.vanishes ?? false,
      camOffset: c.camOffset ?? null,
      lingers: c.lingers ?? false,
      lingerStep: c.lingerStep ?? 0,
      lingerAway: c.lingerAway ?? 0,
    }));
  return {
    ...fresh,
    ...snap,
    carrying,
    length: fresh.length,
    droppedBox: snap.droppedBox ?? null,
    customers,
    spills: Array.isArray(snap.spills) ? snap.spills : [],
    slots: { ...fresh.slots, ...(snap.slots ?? {}) },
    stats: { ...fresh.stats, ...(snap.stats ?? {}) },
    next: { ...fresh.next, ...(snap.next ?? {}) },
    hintsShown: Array.isArray(snap.hintsShown) ? snap.hintsShown : [],
    lights: { ...fresh.lights, ...(snap.lights ?? {}) },
    player: { ...fresh.player, ...(snap.player ?? {}) },
    peeker: snap.peeker ?? null,
    hanging: null,
    cart: null,
    clockLie: null,
    lightFollow: null,
    viewingFeed: null,
    action: null,
    reading: false,
    testNight: false,
  };
}

function isUsableSnapshot(s: unknown): s is GameState {
  if (!s || typeof s !== "object") return false;
  const g = s as Partial<GameState>;
  return (
    typeof g.night === "number" &&
    typeof g.elapsed === "number" &&
    g.status === "running" &&
    typeof g.score === "number" &&
    typeof g.slots === "object" &&
    Array.isArray(g.customers) &&
    Array.isArray(g.spills)
  );
}

function clampNight(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 1;
  return Math.min(TUNING.night.count + 1, Math.max(1, v));
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}
