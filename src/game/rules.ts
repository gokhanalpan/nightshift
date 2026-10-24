import { TUNING, clockToMinutes } from "@/config/tuning";
import { addScore, clockMinutes, notify, type GameState } from "@/game/state";

const R = TUNING.rules;

export interface NoteLine {
  text: string;
  crossed: boolean;
}

/** What the note by the till says tonight. Blank on night 6. */
export function noteLines(night: number): NoteLine[] {
  if (night > TUNING.night.count) return [];
  const count = Math.min(R.lines.length, 2 + night);
  const crossed = night >= R.crossedOutFrom.night ? R.crossedOutFrom.lines : [];
  return R.lines.slice(0, count).map((text, i) => ({ text, crossed: (crossed as readonly number[]).includes(i) }));
}

/** A rule only counts once it is on the note. */
export function ruleActive(night: number, rule: number): boolean {
  return rule >= 1 && rule <= noteLines(night).length;
}

/** Mark a rule broken, once per night. The player only gets a vague nudge; the tally comes at 06:00. */
export function breakRule(state: GameState, rule: number): void {
  if (!ruleActive(state.night, rule) || state.rulesBroken.includes(rule)) return;
  state.rulesBroken.push(rule);
  addScore(state, -R.brokenPenalty);
  notify(state, "Something feels off.");
}

export function ruleBroken(state: GameState, rule: number): boolean {
  return state.rulesBroken.includes(rule);
}

/**
 * Rule 1: the door should be locked from 02:00 and open again from 05:00. Checked every tick;
 * the grace window keeps it fair for someone walking back from the back room.
 */
export function checkDoorRule(state: GameState): void {
  if (state.night > TUNING.night.count || ruleBroken(state, 1)) return;
  const now = clockMinutes(state);
  const lock = clockToMinutes(R.lockAt);
  const unlock = clockToMinutes(R.unlockAt);
  const g = R.doorGraceMinutes;
  if (now > lock + g && now < unlock - g && !state.doorLocked) breakRule(state, 1);
  if (now > unlock + g && state.doorLocked) breakRule(state, 1);
}

/** Whether customers can come in right now (the door is open to them). */
export function doorOpenForCustomers(state: GameState): boolean {
  return !state.doorLocked;
}

/** Whether the lock/unlock prompt at the door makes sense right now. */
export function doorPromptLabel(state: GameState): string {
  return state.doorLocked ? "Unlock the door" : "Lock the door";
}
