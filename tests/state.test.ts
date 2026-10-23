import { describe, expect, it } from "vitest";
import { TUNING } from "@/config/tuning";
import { readDebugOptions } from "@/config/tuning";
import {
  clockMinutes,
  clockString,
  createState,
  formatClock,
  isNightOver,
  nightProgress,
  startNight,
  tick,
} from "@/game/state";

describe("night clock", () => {
  it("starts at 23:00 and waits until the night is started", () => {
    const s = createState(1);
    expect(clockString(s)).toBe("23:00");
    tick(s, 100);
    expect(s.elapsed).toBe(0);
    expect(clockString(s)).toBe("23:00");
  });

  it("runs 23:00 → 06:00 over the real length of a night", () => {
    const s = createState(1);
    startNight(s);
    tick(s, TUNING.night.realSeconds / 2);
    expect(nightProgress(s)).toBeCloseTo(0.5);
    expect(clockString(s)).toBe("02:30");
    tick(s, TUNING.night.realSeconds / 2);
    expect(clockString(s)).toBe("06:00");
    expect(isNightOver(s)).toBe(true);
  });

  it("never runs past 06:00", () => {
    const s = createState(3);
    startNight(s);
    tick(s, TUNING.night.realSeconds * 5);
    expect(s.elapsed).toBe(TUNING.night.realSeconds);
    expect(clockMinutes(s)).toBe(TUNING.night.clockEnd);
    tick(s, 10);
    expect(clockString(s)).toBe("06:00");
  });

  it("formats minutes past midnight with a leading zero", () => {
    expect(formatClock(23 * 60 + 5)).toBe("23:05");
    expect(formatClock(24 * 60 + 7)).toBe("00:07");
    expect(formatClock(27 * 60 + 59.9)).toBe("03:59");
  });
});

describe("debug options", () => {
  it("defaults to night 1 at normal speed", () => {
    expect(readDebugOptions("")).toEqual({ night: 1, timeScale: 1 });
  });

  it("reads ?night and ?speed and clamps nonsense", () => {
    expect(readDebugOptions("?night=4&speed=10")).toEqual({ night: 4, timeScale: 10 });
    expect(readDebugOptions("?night=99")).toEqual({ night: TUNING.night.count + 1, timeScale: 1 });
    expect(readDebugOptions("?night=abc&speed=-3")).toEqual({ night: 1, timeScale: 1 });
  });
});
