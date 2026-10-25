import { TUNING, type RegularId } from "@/config/tuning";
import { answerPhone, phoneRinging, tickAnomalies, useFuseBox } from "@/game/anomalies";
import { shelfSlots, slotById } from "@/game/layout";
import { randomBetween, randomInt } from "@/game/rng";
import { breakRule, checkDoorRule, doorOpenForCustomers, doorPromptLabel } from "@/game/rules";
import { addScore, notify, tickClock, type Action, type Customer, type GameState } from "@/game/state";

const C = TUNING.chores;
const S = TUNING.score;

// --- Per-frame update ------------------------------------------------------------------------

/** One simulation step. dt in real seconds (already scaled for debug speed). */
export function tick(state: GameState, dt: number): void {
  if (state.status !== "running") return;
  tickClock(state, dt);
  if ((state.status as string) === "over") {
    decideEnding(state);
    return;
  }
  if (state.endless) return; // night 6: the clock turns, nothing else does
  schedule(state);
  moveCustomers(state, dt);
  applyRunningCosts(state, dt);
  tickAnomalies(state, dt);
  checkDoorRule(state);
}

/** Night 5 runs faster: intervals shrink by the night's pace. */
function interval(state: GameState, range: readonly [number, number]): number {
  const pace = TUNING.nightPace[state.night] ?? 1;
  return randomBetween(state, ...range) / pace;
}

function schedule(state: GameState): void {
  const t = state.elapsed;
  if (t >= state.next.restock) {
    emptyRandomSlot(state);
    state.next.restock = t + interval(state, C.restock.every);
  }
  if (t >= state.next.customer) {
    if (doorOpenForCustomers(state)) spawnCustomer(state);
    state.next.customer = t + interval(state, C.customer.every);
  }
  if (t >= state.next.spill) {
    spawnSpill(state);
    state.next.spill = t + interval(state, C.spill.every);
  }
  if (t >= state.next.ping) {
    // Never stack pings: if one is still up, push the next one out instead.
    if (!state.ping) {
      state.ping = { feed: randomInt(state, TUNING.cameras.feeds.length), age: 0, watched: 0 };
      notify(state, `The monitor wants CAM ${state.ping.feed + 1}`);
    }
    state.next.ping = t + interval(state, C.ping.every);
  }
}

/** At 06:00 (or an early leave): what kind of ending this night gets. */
export function decideEnding(state: GameState): void {
  if (state.ending) return;
  const total = state.strikes + state.rulesBroken.length;
  const lastNight = state.night >= TUNING.night.count;
  const bad = total >= TUNING.rules.strikesToLose || (lastNight && state.rulesBroken.length > 0);
  state.ending = bad ? "bad" : "good";
}

function applyRunningCosts(state: GameState, dt: number): void {
  // Empty shelves.
  for (const slot of Object.values(state.slots)) {
    if (!slot.filled && state.elapsed - slot.emptySince > S.restock.grace) addScore(state, -S.restock.perSecond * dt);
  }
  // Waiting customers.
  for (const cu of state.customers) {
    if (cu.phase !== "queued") continue;
    cu.waited += dt;
    if (cu.waited > S.serve.grace) addScore(state, -S.serve.perSecond * dt);
    if (cu.waited > S.serve.patience) {
      if (cu.wrong) {
        // Not a real customer. They are just gone, with no fuss.
        leave(state, cu);
        cu.phase = "gone";
      } else {
        addScore(state, -S.serve.walkout);
        state.stats.walkouts++;
        notify(state, "A customer gave up and left");
        leave(state, cu);
      }
    }
  }
  // Spills.
  for (const sp of state.spills) {
    sp.age += dt;
    if (sp.age > S.mop.grace) addScore(state, -S.mop.perSecond * dt);
  }
  // Camera ping: expires if ignored; resolves after the right feed has been watched long enough.
  if (state.ping) {
    state.ping.age += dt;
    if (state.viewingFeed === state.ping.feed) {
      state.ping.watched += dt;
      if (state.ping.watched >= C.ping.confirmSeconds) {
        addScore(state, S.ping.reward);
        state.stats.pingsAnswered++;
        notify(state, "Camera checked");
        state.ping = null;
      }
    } else if (state.ping.age > C.ping.expires) {
      addScore(state, -S.ping.missed);
      state.stats.pingsMissed++;
      notify(state, "You missed a camera check");
      state.ping = null;
    }
  }
}

// --- Restock ---------------------------------------------------------------------------------

export function emptyRandomSlot(state: GameState): string | null {
  const filled = shelfSlots().filter((s) => state.slots[s.id]!.filled);
  if (filled.length === 0) return null;
  const pick = filled[randomInt(state, filled.length)]!;
  state.slots[pick.id] = { filled: false, emptySince: state.elapsed };
  return pick.id;
}

/** Called once at the start of a night so there is something to do straight away. */
export function seedInitialEmpties(state: GameState): void {
  for (let i = 0; i < C.restock.initialEmpty; i++) emptyRandomSlot(state);
}

export function emptySlotIds(state: GameState): string[] {
  return Object.keys(state.slots).filter((id) => !state.slots[id]!.filled);
}

// --- Customers -------------------------------------------------------------------------------

function spawnCustomer(state: GameState): void {
  const inStore = state.customers.filter((c) => c.phase !== "leaving" && c.phase !== "gone");
  if (inStore.length >= C.customer.maxQueue) return;
  const ids = Object.keys(TUNING.regulars) as RegularId[];
  const free = ids.filter((id) => !inStore.some((c) => c.regular === id));
  if (free.length === 0) return;
  // Someone who hasn't been in yet, when possible, so all five show up over the night.
  const fresh = free.filter((id) => !state.visited.includes(id));
  const pool = fresh.length > 0 ? fresh : free;
  spawnRegular(state, pool[randomInt(state, pool.length)]!, {});
}

export interface SpawnOptions {
  wrong?: boolean;
  onCamera?: boolean;
  silent?: boolean;
  repeat?: boolean;
  /** Appear directly at the till instead of walking in. */
  atTill?: boolean;
}

/** Put a regular in the store. Normal customers walk in and shop; anomalies use the options. */
export function spawnRegular(state: GameState, regular: RegularId, opts: SpawnOptions): Customer {
  const inStore = state.customers.filter((c) => c.phase !== "leaving" && c.phase !== "gone");
  const wrong = opts.wrong ?? false;
  const repeat = opts.repeat ?? state.visited.includes(regular);
  state.visited.push(regular);
  const atTill = (opts.atTill ?? false) && !customerAtTill(state);
  const queueIndex = atTill ? 0 : inStore.length;
  // Everyone already queued behind a till-arrival shifts back a spot.
  if (atTill) {
    for (const c of inStore) {
      if (c.phase === "queued" || c.phase === "toQueue") {
        c.queueIndex = Math.min(C.queue.length - 1, c.queueIndex + 1);
        c.phase = "toQueue";
        c.path = queuePath(c);
      } else {
        c.queueIndex = Math.min(C.queue.length - 1, c.queueIndex + 1);
      }
    }
  }
  const shelf = wrong ? null : pickShelfStop(state, regular);
  const q = C.queue[Math.min(C.queue.length - 1, queueIndex)]!;
  const cu: Customer = {
    id: state.nextId++,
    x: atTill ? q.x : C.doorPath.outside.x,
    z: atTill ? q.z : C.doorPath.outside.z,
    yaw: 0,
    phase: atTill ? "queued" : "entering",
    queueIndex,
    waited: 0,
    path: atTill
      ? []
      : shelf
        ? [
            { x: C.doorPath.inside.x, z: C.doorPath.inside.z },
            { x: shelf.x, z: C.corridorZ },
            { x: shelf.x, z: shelf.z },
          ]
        : [{ x: C.doorPath.inside.x, z: C.doorPath.inside.z }],
    shelf,
    browse: 0,
    look: randomInt(state, 1000),
    regular,
    wrong,
    onCamera: opts.onCamera ?? true,
    silent: opts.silent ?? false,
    repeat,
    greeted: false,
    vanishes: wrong,
  };
  state.customers.push(cu);
  return cu;
}

/** A filled slot on one of this regular's shelf faces, and the aisle spot in front of it. */
function pickShelfStop(state: GameState, regular: RegularId): Customer["shelf"] {
  const faces: ReadonlyArray<{ row: number; side: number }> = TUNING.regulars[regular].faces;
  let candidates = shelfSlots().filter((sl) => {
    if (!state.slots[sl.id]!.filled) return false;
    if (state.customers.some((c) => c.shelf?.slotId === sl.id)) return false;
    return faces.some((f) => f.row === sl.row && f.side === sl.side);
  });
  if (candidates.length === 0) {
    candidates = shelfSlots().filter(
      (sl) => state.slots[sl.id]!.filled && C.shopFaces.some((f) => f.row === sl.row && f.side === sl.side),
    );
  }
  if (candidates.length === 0) return null;
  const sl = candidates[randomInt(state, candidates.length)]!;
  return { slotId: sl.id, x: sl.x + sl.side * C.browseOffset, z: sl.z };
}

function queuePath(cu: Customer): Array<{ x: number; z: number }> {
  // Anomalies can push the line past its marked spots; extras share the last one.
  const q = C.queue[Math.min(C.queue.length - 1, cu.queueIndex)]!;
  return [
    { x: cu.x, z: C.doorPath.inside.z },
    { x: q.x, z: q.z },
  ];
}

function moveCustomers(state: GameState, dt: number): void {
  for (const cu of state.customers) {
    if (cu.phase === "gone" || cu.phase === "queued") continue;

    if (cu.phase === "browsing") {
      cu.browse -= dt;
      if (cu.browse <= 0) {
        // They take the item: the slot empties and restocking it becomes a chore.
        if (cu.shelf) {
          const slot = state.slots[cu.shelf.slotId];
          if (slot?.filled) state.slots[cu.shelf.slotId] = { filled: false, emptySince: state.elapsed };
        }
        cu.phase = "toQueue";
        cu.path = queuePath(cu);
      }
      continue;
    }

    // Locked out: anyone still outside turns around.
    if (cu.phase === "entering" && state.doorLocked && cu.z < C.doorPath.inside.z - 0.6) {
      cu.phase = "leaving";
      cu.shelf = null;
      cu.path = [{ x: C.doorPath.outside.x, z: C.doorPath.outside.z }];
      continue;
    }

    const target = cu.path[0];
    if (!target) {
      if (cu.phase === "entering") {
        if (cu.shelf) {
          cu.phase = "browsing";
          const [bLo, bHi] = TUNING.regulars[cu.regular].browse;
          cu.browse = randomBetween(state, bLo, bHi);
          // Face the shelf, which is beside them.
          cu.yaw = cu.shelf.x < cu.x ? -Math.PI / 2 : Math.PI / 2;
        } else {
          cu.phase = "toQueue";
          cu.path = queuePath(cu);
        }
      } else if (cu.phase === "toQueue") {
        cu.phase = "queued";
        cu.yaw = 0; // face the counter
      } else if (cu.phase === "leaving") {
        cu.phase = "gone";
      }
      continue;
    }
    const dx = target.x - cu.x;
    const dz = target.z - cu.z;
    const dist = Math.hypot(dx, dz);
    const step = TUNING.regulars[cu.regular].walkSpeed * dt;
    if (dist <= step) {
      cu.x = target.x;
      cu.z = target.z;
      cu.path.shift();
    } else {
      cu.x += (dx / dist) * step;
      cu.z += (dz / dist) * step;
      cu.yaw = Math.atan2(dx, dz);
    }
  }
  state.customers = state.customers.filter((c) => c.phase !== "gone");
}

function leave(state: GameState, cu: Customer): void {
  cu.phase = "leaving";
  cu.shelf = null;
  cu.path = [
    { x: cu.x, z: C.doorPath.inside.z },
    { x: C.doorPath.inside.x, z: C.doorPath.inside.z },
    { x: C.doorPath.outside.x, z: C.doorPath.outside.z },
  ];
  // Everyone behind shuffles forward one spot.
  for (const other of state.customers) {
    if (other === cu || other.phase === "leaving" || other.phase === "gone") continue;
    if (other.queueIndex > cu.queueIndex) {
      other.queueIndex--;
      if (other.phase === "queued" || other.phase === "toQueue") {
        other.phase = "toQueue";
        other.path = queuePath(other);
      }
      // entering/browsing customers build their queue path when they finish at the shelf
    }
  }
}

/** The customer at the till, if there is one and they have arrived. */
export function customerAtTill(state: GameState): Customer | undefined {
  return state.customers.find((c) => c.phase === "queued" && c.queueIndex === 0);
}

// --- Spills ----------------------------------------------------------------------------------

function spawnSpill(state: GameState): void {
  const free = C.spillPoints.filter((p) => !state.spills.some((s) => s.x === p.x && s.z === p.z));
  if (free.length === 0) return;
  const p = free[randomInt(state, free.length)]!;
  state.spills.push({ id: state.nextId++, x: p.x, z: p.z, age: 0 });
}

// --- Interactables ---------------------------------------------------------------------------

export interface Interactable {
  action: Action;
  x: number;
  y: number;
  z: number;
  /** Prompt shown to the player. */
  label: string;
}

/** Everything the player could use right now, given what they are carrying and what is waiting. */
export function listInteractables(state: GameState): Interactable[] {
  if (state.status !== "running" || state.viewingFeed !== null || state.reading) return [];
  const out: Interactable[] = [];
  const p = TUNING.interact.points;
  const pr = TUNING.props;

  // Things that aren't chores.
  out.push({ action: { kind: "readNote" }, x: pr.note.x, y: pr.note.y, z: pr.note.z, label: "Read the note" });
  if (!state.endless) {
    out.push({ action: { kind: "door" }, x: pr.frontDoor.x, y: pr.frontDoor.y, z: pr.frontDoor.z, label: doorPromptLabel(state) });
  }
  if (state.knocked && !state.doorLocked) {
    out.push({ action: { kind: "leave" }, x: pr.frontDoor.x, y: pr.frontDoor.y + 0.4, z: pr.frontDoor.z, label: "Leave" });
  }
  if (state.lights.out && !state.endless) {
    out.push({ action: { kind: "fuse" }, x: pr.fuseBox.x, y: pr.fuseBox.y, z: pr.fuseBox.z, label: "Reset the fuses" });
  }
  if (phoneRinging(state)) {
    out.push({ action: { kind: "phone" }, x: pr.phone.x, y: pr.phone.y, z: pr.phone.z, label: "Answer the phone" });
  }
  if (state.keyVisible && !state.hasKey) {
    out.push({ action: { kind: "takeKey" }, x: pr.managerKey.x, y: pr.managerKey.y, z: pr.managerKey.z, label: "Take the key" });
  }
  if (state.hasKey) {
    out.push({ action: { kind: "managerDoor" }, x: pr.managerDoor.x, y: pr.managerDoor.y, z: pr.managerDoor.z, label: "Unlock MANAGER" });
  }
  if (state.endless) return out;

  if (state.carrying > 0) {
    out.push({ action: { kind: "putBack" }, x: p.stockPile.x, y: p.stockPile.y, z: p.stockPile.z, label: "Put the box back" });
    for (const id of emptySlotIds(state)) {
      const s = slotById(id);
      if (s) {
        const left = state.carrying === 1 ? "last one" : `${state.carrying} left`;
        out.push({ action: { kind: "restock", slotId: id }, x: s.x, y: s.y, z: s.z, label: `Restock (${left})` });
      }
    }
  } else {
    if (emptySlotIds(state).length > 0 && !state.droppedBox) {
      out.push({ action: { kind: "takeBox" }, x: p.stockPile.x, y: p.stockPile.y, z: p.stockPile.z, label: "Take a box" });
    }
    if (state.droppedBox) {
      const b = state.droppedBox;
      out.push({ action: { kind: "pickUp" }, x: b.x, y: 0.2, z: b.z, label: "Pick up the box" });
    }
  }

  const cu = customerAtTill(state);
  if (cu && state.carrying === 0) {
    out.push({ action: { kind: "serve", customerId: cu.id }, x: p.till.x, y: p.till.y, z: p.till.z, label: "Serve" });
  }

  if (state.carrying === 0) {
    for (const sp of state.spills) {
      out.push({ action: { kind: "mop", spillId: sp.id }, x: sp.x, y: 0.1, z: sp.z, label: "Mop up" });
    }
    out.push({ action: { kind: "cameras" }, x: p.monitor.x, y: p.monitor.y, z: p.monitor.z, label: "Check cameras" });
  }
  return out;
}

export function actionDuration(action: Action): number {
  const d = TUNING.interact.duration;
  switch (action.kind) {
    case "takeBox":
      return d.takeBox;
    case "restock":
      return d.restock;
    case "serve":
      return d.serve;
    case "mop":
      return d.mop;
    case "fuse":
      return 1.5;
    case "leave":
      return 1.0;
    default:
      return 0; // presses: cameras, door, phone, key, manager door, note
  }
}

/** Q: set the box down where the player stands. */
export function dropBox(state: GameState, x: number, z: number): boolean {
  if (state.carrying === 0 || state.droppedBox) return false;
  state.droppedBox = { x, z, items: state.carrying };
  state.carrying = 0;
  return true;
}

/** Shelf rows (1-based, from the left wall) that currently have an empty slot. */
export function emptyRows(state: GameState): number[] {
  const rows = new Set<number>();
  for (const id of emptySlotIds(state)) {
    const sl = slotById(id);
    if (sl) rows.add(sl.row + 1);
  }
  return [...rows].sort();
}

/** G at the till. A prompt greeting is a small plus; greeting a repeat breaks rule 4. */
export function greet(state: GameState): boolean {
  const cu = customerAtTill(state);
  if (!cu || cu.greeted) return false;
  cu.greeted = true;
  if (cu.repeat) breakRule(state, 4);
  else if (cu.waited <= TUNING.rules.greetWindow) {
    addScore(state, TUNING.rules.greetReward);
    notify(state, "Greeted");
  }
  return true;
}

export function sameAction(a: Action, b: Action): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "restock":
      return a.slotId === (b as typeof a).slotId;
    case "serve":
      return a.customerId === (b as typeof a).customerId;
    case "mop":
      return a.spillId === (b as typeof a).spillId;
    default:
      return true;
  }
}

/**
 * Advance the held action. `holding` is whether E is down and the same target is still in view.
 * Returns true on the frame the action completes.
 */
export function holdAction(state: GameState, action: Action | null, holding: boolean, dt: number): boolean {
  if (!holding || !action) {
    state.action = null;
    return false;
  }
  if (!state.action || !sameAction(state.action.action, action)) {
    state.action = { action, progress: 0 };
  }
  const duration = actionDuration(action);
  if (duration <= 0) {
    state.action = null;
    return performAction(state, action);
  }
  state.action.progress = Math.min(1, state.action.progress + dt / duration);
  if (state.action.progress >= 1) {
    state.action = null;
    return performAction(state, action);
  }
  return false;
}

/** Apply an action's effect. Returns false if it no longer makes sense. */
export function performAction(state: GameState, action: Action): boolean {
  switch (action.kind) {
    case "takeBox": {
      if (state.carrying > 0) return false;
      state.carrying = C.restock.boxItems;
      return true;
    }
    case "putBack": {
      if (state.carrying === 0) return false;
      state.carrying = 0;
      return true;
    }
    case "pickUp": {
      if (state.carrying > 0 || !state.droppedBox) return false;
      state.carrying = state.droppedBox.items;
      state.droppedBox = null;
      return true;
    }
    case "restock": {
      const slot = state.slots[action.slotId];
      if (state.carrying === 0 || !slot || slot.filled) return false;
      slot.filled = true;
      state.carrying--;
      state.stats.restocked++;
      addScore(state, S.restock.reward);
      notify(state, "Restocked");
      return true;
    }
    case "serve": {
      const cu = customerAtTill(state);
      if (!cu || cu.id !== action.customerId) return false;
      if (!cu.onCamera) breakRule(state, 2);
      state.stats.served++;
      addScore(state, S.serve.reward);
      if (cu.onCamera) notify(state, "Served");
      leave(state, cu);
      if (cu.vanishes) cu.phase = "gone";
      return true;
    }
    case "door": {
      state.doorLocked = !state.doorLocked;
      notify(state, state.doorLocked ? "Door locked" : "Door unlocked");
      return true;
    }
    case "leave": {
      if (!state.knocked || state.doorLocked) return false;
      state.status = "over";
      decideEnding(state);
      return true;
    }
    case "fuse": {
      if (!state.lights.out) return false;
      useFuseBox(state);
      return true;
    }
    case "phone": {
      if (!phoneRinging(state)) return false;
      answerPhone(state);
      return true;
    }
    case "takeKey": {
      if (!state.keyVisible || state.hasKey) return false;
      state.hasKey = true;
      notify(state, "A key. MANAGER is scratched into it.");
      return true;
    }
    case "managerDoor": {
      if (!state.hasKey) return false;
      state.status = "over";
      state.ending = "secret";
      return true;
    }
    case "readNote": {
      state.reading = true;
      return true;
    }
    case "mop": {
      const i = state.spills.findIndex((s) => s.id === action.spillId);
      if (i < 0) return false;
      state.spills.splice(i, 1);
      state.stats.mopped++;
      addScore(state, S.mop.reward);
      notify(state, "Mopped up");
      return true;
    }
    case "cameras": {
      openCameras(state);
      return true;
    }
  }
}

// --- Camera mode -----------------------------------------------------------------------------

export function openCameras(state: GameState): void {
  state.viewingFeed = 0;
}

export function selectFeed(state: GameState, feed: number): void {
  if (state.viewingFeed === null) return;
  if (feed >= 0 && feed < TUNING.cameras.feeds.length) state.viewingFeed = feed;
}

export function closeCameras(state: GameState): void {
  state.viewingFeed = null;
}

// --- Summary for the HUD ---------------------------------------------------------------------

export function pendingSummary(state: GameState): string[] {
  const parts: string[] = [];
  const empties = emptySlotIds(state).length;
  if (empties > 0) parts.push(`Restock ${empties} · row ${emptyRows(state).join(", ")}`);
  const waiting = state.customers.filter((c) => c.phase === "queued" || c.phase === "toQueue").length;
  if (waiting > 0) parts.push(`Customers ${waiting}`);
  if (state.spills.length > 0) parts.push(`Spill${state.spills.length > 1 ? "s" : ""} ${state.spills.length}`);
  if (state.ping) parts.push(`Camera ${state.ping.feed + 1}`);
  return parts;
}
