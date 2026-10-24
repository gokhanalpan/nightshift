import { ANOMALIES, type Anomaly, type FigureStage, type Tell } from "@/config/anomalies";
import { TUNING, clockToMinutes, type RegularId } from "@/config/tuning";
import { customerAtTill, spawnRegular } from "@/game/chores";
import { randomInt } from "@/game/rng";
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
  void dt;
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
    case "wrongCustomer": {
      const regular = t.regular ?? pickRepeat(state);
      const repeat = t.repeat ?? state.visited.includes(regular);
      spawnRegular(state, regular, {
        wrong: true,
        onCamera: false,
        silent: t.silent ?? false,
        repeat,
        atTill: t.atTill ?? false,
      });
      break;
    }
    case "spill":
      if (!state.spills.some((s) => s.x === t.x && s.z === t.z)) state.spills.push({ id: state.nextId++, x: t.x, z: t.z, age: 0 });
      break;
    case "lightsOut":
      state.lights = { out: true, restoreAt: state.elapsed + t.seconds, thenAtTill: t.thenAtTill ?? null, fuseUsed: false };
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

/** Someone who has already been in tonight; failing that, anyone. */
function pickRepeat(state: GameState): RegularId {
  const ids = Object.keys(TUNING.regulars) as RegularId[];
  const pool = state.visited.length > 0 ? state.visited : ids;
  return pool[randomInt(state, pool.length)]!;
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
    if (l.thenAtTill && !customerAtTill(state)) {
      // The player waited. Someone is already standing at the till when the lights return.
      spawnRegular(state, l.thenAtTill, { wrong: true, onCamera: false, silent: true, repeat: true, atTill: true });
    }
    l.thenAtTill = null;
  }
}

/** The fuse box was used while the lights were out. */
export function useFuseBox(state: GameState): void {
  const l = state.lights;
  if (!l.out) return;
  l.out = false;
  l.fuseUsed = true;
  l.thenAtTill = null;
  breakRule(state, 3);
  // Something is standing in the back room when the lights come back, then it walks out.
  state.backRoomFigure = state.elapsed + 4;
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
