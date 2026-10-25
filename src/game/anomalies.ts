import { ANOMALIES, type Anomaly, type FigureStage, type Tell } from "@/config/anomalies";
import { TUNING, clockToMinutes } from "@/config/tuning";
import { breakRule } from "@/game/rules";
import { clockMinutes, notify, type GameState } from "@/game/state";

/** Fire every anomaly for tonight whose time has come, and run the ones that last. */
export function tickAnomalies(state: GameState, dt: number): void {
  if (state.status !== "running" || state.endless) return;
  const now = clockMinutes(state);
  for (const a of ANOMALIES) {
    if (a.night !== state.night || state.anomaliesFired.includes(a.id)) continue;
    if (now >= clockToMinutes(a.at)) {
      state.anomaliesFired.push(a.id);
      perform(state, a);
    }
  }
  runFigure(state);
  runLights(state);
  runPhone(state);
  runBackRoomFigure(state);
  runPeeker(state, dt);
}

function perform(state: GameState, a: Anomaly): void {
  const t: Tell = a.tell;
  switch (t.kind) {
    case "figure": {
      // Every rule broken earlier in the week brings it one stage closer.
      const order: FigureStage[] = ["shelter", "road", "lot", "window"];
      const idx = Math.min(order.length - 1, order.indexOf(t.stage) + state.strikes);
      state.figure = { stage: order[idx]!, until: state.elapsed + t.seconds, seenOnCam: false };
      break;
    }
    case "peeker":
      placePeeker(state, t.seconds ?? 45);
      break;
    case "spill":
      if (!state.spills.some((s) => s.x === t.x && s.z === t.z)) state.spills.push({ id: state.nextId++, x: t.x, z: t.z, age: 0 });
      break;
    case "lightsOut":
      state.lights = { out: true, restoreAt: state.elapsed + t.seconds, fuseUsed: false };
      break;
    case "phone":
      state.phone = { until: state.elapsed + t.seconds, answered: false };
      break;
    case "knock":
      state.knocked = true;
      notify(state, "Knock. Knock. Knock.");
      break;
    case "managerKey":
      state.keyVisible = true;
      break;
  }
}

function runFigure(state: GameState): void {
  const f = state.figure;
  if (!f) return;
  if (state.viewingFeed === 2) f.seenOnCam = true;
  const gone = state.elapsed >= f.until || (f.seenOnCam && state.viewingFeed === null);
  if (gone) state.figure = null;
}

function runLights(state: GameState): void {
  const l = state.lights;
  if (!l.out || state.endless) return;
  if (state.elapsed >= l.restoreAt) {
    l.out = false;
    // The player waited. When the lights return, it is standing at the end of an aisle.
    placePeeker(state, 40);
  }
}

/** The fuse box was used while the lights were out. */
export function useFuseBox(state: GameState): void {
  const l = state.lights;
  if (!l.out) return;
  l.out = false;
  l.fuseUsed = true;
  breakRule(state, 3);
  // Something is standing in the back room when the lights come back, then it walks out.
  state.backRoomFigure = state.elapsed + 4;
}

// --- The peeker ------------------------------------------------------------------------------

/**
 * Put it somewhere in the player's field of view but off to the side, far enough away to be
 * a shape at the end of an aisle rather than a jump scare.
 */
export function placePeeker(state: GameState, seconds: number): void {
  if (state.peeker) return;
  const P = TUNING.peeker;
  const { x: px, z: pz, yaw } = state.player;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  let best: (typeof P.spots)[number] | null = null;
  let bestScore = -Infinity;
  for (const sp of P.spots) {
    const dx = sp.x - px;
    const dz = sp.z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist < P.minDistance) continue;
    const dot = (dx * fx + dz * fz) / dist;
    // Best: in view but not centred. Behind the player is fine too, just lower.
    const score = dot > 0.9 ? -1 : dot > 0.15 ? 2 - Math.abs(dot - 0.55) : dot;
    if (score > bestScore) {
      bestScore = score;
      best = sp;
    }
  }
  if (!best) best = P.spots[0]!;
  state.peeker = { x: best.x, z: best.z, hideX: best.hideX, hideZ: best.hideZ, phase: "watching", seenFor: 0, until: state.elapsed + seconds, hideStart: 0 };
}

function runPeeker(state: GameState, dt: number): void {
  const pk = state.peeker;
  if (!pk) return;
  const P = TUNING.peeker;
  if (pk.phase === "watching") {
    const { x: px, z: pz, yaw } = state.player;
    const dx = pk.x - px;
    const dz = pk.z - pz;
    const dist = Math.hypot(dx, dz) || 1;
    const dot = (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / dist;
    pk.seenFor = dot >= P.lookCos ? pk.seenFor + dt : 0;
    if (pk.seenFor >= P.lookSeconds) {
      pk.phase = "hiding";
      pk.hideStart = state.elapsed;
    } else if (state.elapsed >= pk.until) {
      state.peeker = null;
    }
  } else if (state.elapsed - pk.hideStart >= P.hideSeconds) {
    state.peeker = null;
  }
}

function runBackRoomFigure(state: GameState): void {
  if (state.backRoomFigure !== null && state.elapsed >= state.backRoomFigure) state.backRoomFigure = null;
}

function runPhone(state: GameState): void {
  const p = state.phone;
  if (!p) return;
  // Stays around after being answered (the line is open), then goes quiet.
  if (state.elapsed >= p.until) state.phone = null;
}

export function answerPhone(state: GameState): void {
  if (!state.phone || state.phone.answered) return;
  state.phone.answered = true;
  state.phone.until = state.elapsed + 10;
  breakRule(state, 5);
}

export function phoneRinging(state: GameState): boolean {
  return state.phone !== null && !state.phone.answered;
}

/** Entering the back room after the knock breaks rule 6. */
export function checkBackRoomRule(state: GameState, playerX: number): void {
  if (state.knocked && playerX > TUNING.store.width / 2 + 0.3) breakRule(state, 6);
}
