import { type Anomaly, type FigureStage, type Tell } from "@/config/anomalies";
import { TUNING, clockToMinutes, type RegularId } from "@/config/tuning";
import { spawnRegular } from "@/game/chores";
import { randomInt } from "@/game/rng";
import { breakRule } from "@/game/rules";
import { anomaliesFor, clockMinutes, notify, type GameState } from "@/game/state";

/** Fire every anomaly for tonight whose time has come, and run the ones that last. */
export function tickAnomalies(state: GameState, dt: number): void {
  if (state.status !== "running" || state.endless) return;
  const now = clockMinutes(state);
  for (const a of anomaliesFor(state)) {
    if (state.anomaliesFired.includes(a.id)) continue;
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
  runHanging(state, dt);
  runLingerers(state, dt);
  runCart(state, dt);
  runClockLie(state);
  runLightFollow(state, dt);
}

/** A regular who isn't in the store right now. */
function pickFreeRegular(state: GameState): RegularId | null {
  const ids = Object.keys(TUNING.regulars) as RegularId[];
  const inStore = new Set(state.customers.filter((c) => c.phase !== "leaving" && c.phase !== "gone").map((c) => c.regular));
  const free = ids.filter((id) => !inStore.has(id));
  if (free.length === 0) return null;
  return free[randomInt(state, free.length)]!;
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
    case "hanging":
      placeHanging(state, t.seconds ?? 90, t.rush ?? false, t.tiltAfter, t.flickerAfter);
      break;
    case "spill":
      if (!state.spills.some((s) => s.x === t.x && s.z === t.z)) state.spills.push({ id: state.nextId++, x: t.x, z: t.z, age: 0 });
      break;
    case "lightsOut":
      state.lights = { out: true, restoreAt: state.elapsed + t.seconds, fuseUsed: false };
      break;
    case "phone":
      state.phone = { until: state.elapsed + t.seconds, answered: false, second: false, answeredAt: 0 };
      break;
    case "secondPhone":
      state.phone = { until: state.elapsed + (t.seconds ?? 40), answered: false, second: true, answeredAt: 0 };
      break;
    case "wrongCustomer": {
      const regular = t.regular ?? pickFreeRegular(state);
      if (!regular) break;
      // Their camera image stands one aisle over: toward +X if they're on the left, else toward -X.
      const off = TUNING.wrongCustomerOffset;
      const cu = spawnRegular(state, regular, {});
      cu.camOffset = { x: off, z: 0 };
      cu.wrong = true; // the feeds jitter faintly while they're in
      break;
    }
    case "lingerer": {
      const regular = t.regular ?? pickFreeRegular(state);
      if (!regular) break;
      spawnRegular(state, regular, { lingers: true });
      break;
    }
    case "cart": {
      const st = TUNING.cart.stations[0]!;
      state.cart = { stage: 0, x: st.x, z: st.z, awayFor: 0, until: state.elapsed + (t.seconds ?? 70), besideAt: null };
      break;
    }
    case "clockLie":
      state.clockLie = { until: state.elapsed + (t.seconds ?? 45), minutes: t.minutes ?? 13 };
      break;
    case "lightFollow":
      state.lightFollow = { t: 0, until: state.elapsed + (t.seconds ?? 90) };
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

// --- The hanging man -------------------------------------------------------------------------

export function placeHanging(state: GameState, seconds: number, rush: boolean, tiltAfter?: number, flickerAfter?: number): void {
  if (state.hanging) return;
  const H = TUNING.hanging;
  const { x: px, z: pz, yaw } = state.player;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  // Prefer somewhere in front of the player but not centred, and not too close.
  let best: { x: number; z: number } = H.spots[0]!;
  let bestScore = -Infinity;
  for (const sp of H.spots) {
    const dx = sp.x - px;
    const dz = sp.z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist < 3) continue;
    const dot = (dx * fx + dz * fz) / dist;
    const score = dot > 0.85 ? 0 : dot > 0.1 ? 2 - Math.abs(dot - 0.5) : dot;
    if (score > bestScore) {
      bestScore = score;
      best = sp;
    }
  }
  state.hanging = {
    x: best.x,
    z: best.z,
    until: state.elapsed + seconds,
    lookedFor: 0,
    stage: "still",
    stageT: 0,
    lookedAway: false,
    rush,
    rushTo: null,
    tiltAfter: tiltAfter ?? H.tiltAfter,
    flickerAfter: flickerAfter ?? H.flickerAfter,
  };
}

/** Cosine between the player's view and the man. */
function lookDot(state: GameState, x: number, z: number): { dot: number; dist: number } {
  const { x: px, z: pz, yaw } = state.player;
  const dx = x - px;
  const dz = z - pz;
  const dist = Math.hypot(dx, dz) || 1;
  return { dot: (dx * -Math.sin(yaw) + dz * -Math.cos(yaw)) / dist, dist };
}

function runHanging(state: GameState, dt: number): void {
  const h = state.hanging;
  if (!h) return;
  const H = TUNING.hanging;
  const { dot, dist } = lookDot(state, h.x, h.z);
  const looking = dot >= H.lookCos && dist <= H.maxDistance;
  h.stageT += dt;
  if (looking && h.stage !== "out" && h.stage !== "rush") h.lookedFor += dt;

  switch (h.stage) {
    case "still":
      if (h.lookedFor >= h.tiltAfter) {
        h.stage = "tilt";
        h.stageT = 0;
      }
      break;
    case "tilt":
      if (h.lookedFor >= h.flickerAfter) {
        h.stage = "out";
        h.stageT = 0;
      }
      break;
    case "out":
      if (h.stageT >= H.outSeconds) {
        h.stage = "changed";
        h.stageT = 0;
      }
      break;
    case "changed":
      if (dot < H.lookAwayCos) h.lookedAway = true;
      if (h.lookedAway && looking) {
        if (h.rush) {
          h.stage = "rush";
          h.stageT = 0;
          h.rushTo = { x: state.player.x, z: state.player.z };
        } else {
          state.hanging = null; // look away, look back: gone
          return;
        }
      }
      break;
    case "rush":
      if (h.stageT >= H.rushSeconds) {
        state.hanging = null;
        return;
      }
      break;
  }
  if (state.elapsed >= h.until && h.stage !== "rush") state.hanging = null;
}

// --- The customer who doesn't leave ----------------------------------------------------------

function runLingerers(state: GameState, dt: number): void {
  const L = TUNING.lingerer;
  for (const cu of state.customers) {
    if (cu.phase !== "lingering") continue;
    const { dot } = lookDot(state, cu.x, cu.z);
    if (dot < L.lookAwayCos) cu.lingerAway += dt;
    else cu.lingerAway = 0;
    if (cu.lingerAway >= L.awaySeconds) {
      cu.lingerAway = 0;
      cu.lingerStep++;
      const st = L.steps[cu.lingerStep];
      if (!st) {
        cu.phase = "gone";
        continue;
      }
      cu.x = st.x;
      cu.z = st.z;
    }
    // Back to the player, always.
    cu.yaw = Math.atan2(-(state.player.x - cu.x), -(state.player.z - cu.z));
  }
}

// --- The cart --------------------------------------------------------------------------------

function runCart(state: GameState, dt: number): void {
  const c = state.cart;
  if (!c) return;
  const C = TUNING.cart;
  if (c.besideAt !== null) {
    if (state.elapsed - c.besideAt >= C.besideSeconds) state.cart = null;
    return;
  }
  const { dot } = lookDot(state, c.x, c.z);
  if (dot < C.lookAwayCos) c.awayFor += dt;
  else if (c.awayFor >= C.awaySeconds) {
    // Looked away long enough, now looking back: it has moved.
    c.awayFor = 0;
    c.stage++;
    const st = C.stations[c.stage];
    if (st) {
      c.x = st.x;
      c.z = st.z;
    } else {
      // Beside the player, on their right.
      const yaw = state.player.yaw;
      c.x = state.player.x + Math.cos(yaw) * C.besideOffset;
      c.z = state.player.z - Math.sin(yaw) * C.besideOffset;
      c.besideAt = state.elapsed;
    }
  } else {
    c.awayFor = 0;
  }
  if (state.elapsed >= c.until) state.cart = null;
}

// --- The clock that lies ---------------------------------------------------------------------

function runClockLie(state: GameState): void {
  if (state.clockLie && state.elapsed >= state.clockLie.until) state.clockLie = null;
}

// --- The light that follows ------------------------------------------------------------------

function runLightFollow(state: GameState, dt: number): void {
  const l = state.lightFollow;
  if (!l) return;
  l.t += dt;
  if (state.elapsed >= l.until) state.lightFollow = null;
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
  state.phone.answeredAt = state.elapsed;
  state.phone.until = state.elapsed + (state.phone.second ? 22 : 10);
  breakRule(state, 5);
}

export function phoneRinging(state: GameState): boolean {
  return state.phone !== null && !state.phone.answered;
}

/** Entering the back room after the knock breaks rule 6. */
export function checkBackRoomRule(state: GameState, playerX: number): void {
  if (state.knocked && playerX > TUNING.store.width / 2 + 0.3) breakRule(state, 6);
}
