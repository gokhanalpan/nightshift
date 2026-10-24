/** mulberry32: tiny seeded generator. State is one number so it can live in the game state. */
export function nextRandom(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomBetween(state: { rng: number }, lo: number, hi: number): number {
  return lo + nextRandom(state) * (hi - lo);
}

export function randomInt(state: { rng: number }, n: number): number {
  return Math.min(n - 1, Math.floor(nextRandom(state) * n));
}

export function seedForNight(night: number): number {
  return (night * 7919 + 12345) | 0;
}
