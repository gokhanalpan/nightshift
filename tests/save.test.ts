import { describe, expect, it } from "vitest";
import { finishNight, loadSave, snapshotNight, writeSave, emptySave, SAVE_KEY } from "@/game/save";
import { createState, startNight, tickClock } from "@/game/state";

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

describe("save", () => {
  it("round-trips a running night and resumes at the same clock", () => {
    const st = fakeStorage();
    const s = createState(2);
    startNight(s);
    tickClock(s, 123);
    writeSave(snapshotNight(emptySave(), s), st);
    const loaded = loadSave(st);
    expect(loaded.snapshot?.night).toBe(2);
    expect(loaded.snapshot?.elapsed).toBe(123);
  });

  it("drops the snapshot and advances the night when a shift ends", () => {
    const st = fakeStorage();
    const s = createState(1);
    startNight(s);
    s.score = 71.6;
    tickClock(s, 10_000);
    writeSave(finishNight(snapshotNight(emptySave(), s), s), st);
    const loaded = loadSave(st);
    expect(loaded.snapshot).toBeNull();
    expect(loaded.progress.night).toBe(2);
    expect(loaded.progress.scores[1]).toBe(72);
  });

  it("fills in fields an older build's snapshot doesn't have", () => {
    const st = fakeStorage();
    const s = createState(1);
    startNight(s);
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete old.hintsShown;
    old.viewingFeed = 2;
    st.setItem(SAVE_KEY, JSON.stringify({ version: 1, progress: { night: 1, scores: {} }, snapshot: old, savedAt: 1 }));
    const loaded = loadSave(st);
    expect(loaded.snapshot?.hintsShown).toEqual([]);
    expect(loaded.snapshot?.viewingFeed).toBeNull();
  });

  it("ignores garbage", () => {
    const st = fakeStorage();
    st.setItem(SAVE_KEY, "{not json");
    expect(loadSave(st).progress.night).toBe(1);
    st.setItem(SAVE_KEY, JSON.stringify({ version: 99 }));
    expect(loadSave(st).snapshot).toBeNull();
  });
});
