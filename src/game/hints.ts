import { customerAtTill, emptySlotIds } from "@/game/chores";
import type { GameState } from "@/game/state";

/**
 * One-time nudges for the first night: each fires the first time its situation comes up.
 * They are part of the state so a resumed night doesn't repeat them.
 */
interface Hint {
  id: string;
  when: (s: GameState) => boolean;
  text: string;
}

const HINTS: Hint[] = [
  {
    id: "note",
    when: (s) => s.elapsed > 4,
    text: "There's a note from management by the till. Press E on it to read it.",
  },
  {
    id: "greet",
    when: (s) => customerAtTill(s) !== undefined && !customerAtTill(s)!.greeted,
    text: "Press G to greet a customer when they reach the till. Management likes that.",
  },
  {
    id: "restock",
    when: (s) => emptySlotIds(s).length > 0 && s.carrying === 0,
    text: "Some shelves are empty. Boxes are in the back room — hold E on the pile to take one.",
  },
  {
    id: "carrying",
    when: (s) => s.carrying > 0,
    text: "The empty slots are tagged while you carry a box; hold E on one to fill it. Q puts the box down anywhere.",
  },
  {
    id: "serve",
    when: (s) => customerAtTill(s) !== undefined,
    text: "Someone's at the till. Stand behind the counter and hold E to serve them.",
  },
  {
    id: "mop",
    when: (s) => s.spills.length > 0,
    text: "There's a spill on the floor. Find it and hold E to mop it up.",
  },
  {
    id: "ping",
    when: (s) => s.ping !== null,
    text: "The monitor is beeping. Press E at it, then pick the feed that's flashing (1–4). E to leave.",
  },
];

/** Returns a hint to show now, marking it as shown. Only on night 1. */
export function nextHint(state: GameState): string | null {
  if (state.night !== 1 || state.status !== "running") return null;
  for (const h of HINTS) {
    if (state.hintsShown.includes(h.id)) continue;
    if (h.when(state)) {
      state.hintsShown.push(h.id);
      return h.text;
    }
  }
  return null;
}
