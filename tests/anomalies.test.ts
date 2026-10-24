import { describe, expect, it } from "vitest";
import { ANOMALIES } from "@/config/anomalies";
import { TUNING, clockToMinutes, type RegularId } from "@/config/tuning";
import { customerAtTill, greet, performAction, spawnRegular, tick } from "@/game/chores";
import { noteLines } from "@/game/rules";
import { clockMinutes, createState, startNight } from "@/game/state";

function running(night: number) {
  const s = createState(night);
  startNight(s);
  return s;
}

/** Run until the wall clock reaches "HH:MM". */
function runUntil(s: ReturnType<typeof createState>, hhmm: string, step = 0.25) {
  const target = clockToMinutes(hhmm);
  let guard = 0;
  while (clockMinutes(s) < target && s.status === "running" && guard++ < 100_000) tick(s, step);
}

describe("clock helpers", () => {
  it("maps evening and morning times onto one axis", () => {
    expect(clockToMinutes("23:00")).toBe(1380);
    expect(clockToMinutes("02:30")).toBe(1590);
    expect(clockToMinutes("06:00")).toBe(1800);
  });
});

describe("regulars", () => {
  it("all five show up on a normal night, nobody twice while they're still inside", () => {
    const s = running(1);
    runUntil(s, "06:00");
    const seen = new Set<RegularId>(s.visited);
    expect(seen.size).toBe(5);
    expect(s.customers.every((c) => c.onCamera)).toBe(true);
  });

  it("stop coming in while the door is locked", () => {
    const s = running(1);
    performAction(s, { kind: "door" });
    expect(s.doorLocked).toBe(true);
    runUntil(s, "01:30");
    expect(s.customers.length).toBe(0);
  });
});

describe("the rules note", () => {
  it("grows a line each night and is blank on night 6", () => {
    expect(noteLines(1).length).toBe(3);
    expect(noteLines(5).length).toBe(7);
    expect(noteLines(5)[6]!.text).toMatch(/night 6/);
    expect(noteLines(4).filter((l) => l.crossed).length).toBe(2);
    expect(noteLines(6).length).toBe(0);
  });
});

describe("rule 1 — the door", () => {
  it("is broken by leaving the door open past 02:00, and kept by locking in time", () => {
    const open = running(1);
    runUntil(open, "02:20");
    expect(open.rulesBroken).toContain(1);

    const locked = running(1);
    runUntil(locked, "01:50");
    performAction(locked, { kind: "door" });
    runUntil(locked, "04:50");
    expect(locked.rulesBroken).not.toContain(1);
    performAction(locked, { kind: "door" });
    runUntil(locked, "06:00");
    expect(locked.rulesBroken).toEqual([]);
    expect(locked.ending).toBe("good");
  });
});

describe("night 1", () => {
  it("the figure stands at the shelter around 03:00 and is gone once seen on CAM 3", () => {
    const s = running(1);
    runUntil(s, "03:01");
    expect(s.figure?.stage).toBe("shelter");
    performAction(s, { kind: "cameras" });
    s.viewingFeed = 2;
    tick(s, 0.25);
    expect(s.figure?.seenOnCam).toBe(true);
    s.viewingFeed = null;
    tick(s, 0.25);
    expect(s.figure).toBeNull();
  });
});

describe("night 2", () => {
  it("hoodie guy comes in off-camera; serving him breaks rule 2", () => {
    const s = running(2);
    runUntil(s, "00:41");
    const ghost = s.customers.find((c) => c.regular === "hoodie" && !c.onCamera);
    expect(ghost).toBeDefined();
    // Clear the line so he is the one who reaches the till.
    for (const c of s.customers) if (c.id !== ghost!.id) c.phase = "gone";
    ghost!.queueIndex = 0;
    ghost!.path = ghost!.path.length ? [ghost!.path[0]!] : [];
    let guard = 0;
    while (customerAtTill(s)?.id !== ghost!.id && guard++ < 2000) tick(s, 0.25);
    expect(customerAtTill(s)?.id).toBe(ghost!.id);
    performAction(s, { kind: "serve", customerId: ghost!.id });
    expect(s.rulesBroken).toContain(2);
  });
});

describe("night 3 — lights out", () => {
  it("the fuse box brings the lights back, breaks rule 3 and puts something in the back room", () => {
    const s = running(3);
    runUntil(s, "02:31");
    expect(s.lights.out).toBe(true);
    performAction(s, { kind: "fuse" });
    expect(s.lights.out).toBe(false);
    expect(s.rulesBroken).toContain(3);
    expect(s.backRoomFigure).not.toBeNull();
  });

  it("rules not yet on the note don't count", () => {
    const s = running(1);
    s.visited.push("kid");
    for (const c of s.customers) c.phase = "gone";
    // A repeat on night 1, greeted: rule 4 isn't on the note yet.
    spawnRegular(s, "kid", { atTill: true, repeat: true });
    greet(s);
    expect(s.rulesBroken).toEqual([]);
  });

  it("waiting brings the lights back with the old woman already at the till; greeting her breaks rule 4", () => {
    const s = running(3);
    runUntil(s, "02:31");
    // Clear the till so the test is deterministic about who stands there.
    for (const c of s.customers) c.phase = "gone";
    tick(s, 46);
    expect(s.lights.out).toBe(false);
    const cu = customerAtTill(s);
    expect(cu?.regular).toBe("oldwoman");
    expect(cu?.onCamera).toBe(false);
    expect(cu?.silent).toBe(true);
    greet(s);
    expect(s.rulesBroken).toContain(4);
  });
});

describe("night 4 — the phone", () => {
  it("rings after 03:00; answering breaks rule 5, ignoring it does not", () => {
    const a = running(4);
    runUntil(a, "03:11");
    expect(a.phone).not.toBeNull();
    performAction(a, { kind: "phone" });
    expect(a.rulesBroken).toContain(5);

    const b = running(4);
    runUntil(b, "03:11");
    tick(b, 40);
    expect(b.phone).toBeNull();
    expect(b.rulesBroken).not.toContain(5);
  });
});

describe("night 5", () => {
  it("knocks at 05:00; the key appears; the manager door gives the secret ending", () => {
    const s = running(5);
    runUntil(s, "05:01");
    expect(s.knocked).toBe(true);
    expect(s.keyVisible).toBe(true);
    performAction(s, { kind: "takeKey" });
    expect(s.hasKey).toBe(true);
    performAction(s, { kind: "managerDoor" });
    expect(s.status).toBe("over");
    expect(s.ending).toBe("secret");
  });

  it("a rule broken early in the week is a strike, not the end; three strikes is", () => {
    const one = running(2);
    one.rulesBroken.push(1);
    runUntil(one, "06:00");
    expect(one.ending).toBe("good");

    const three = createState(3, 2);
    startNight(three);
    three.rulesBroken.push(2);
    runUntil(three, "06:00");
    expect(three.ending).toBe("bad");
  });

  it("leaving after the knock ends the night; a broken rule makes it bad", () => {
    const s = running(5);
    runUntil(s, "05:01");
    s.rulesBroken.push(2);
    if (s.doorLocked) performAction(s, { kind: "door" });
    performAction(s, { kind: "leave" });
    expect(s.status).toBe("over");
    expect(s.ending).toBe("bad");
  });

  it("every launch anomaly fires on its night", () => {
    for (const night of [1, 2, 3, 4, 5]) {
      const s = running(night);
      runUntil(s, "06:00");
      const expected = ANOMALIES.filter((a) => a.night === night).map((a) => a.id);
      for (const id of expected) expect(s.anomaliesFired).toContain(id);
    }
  });
});

describe("night 6", () => {
  it("never ends and nothing comes in", () => {
    const s = running(TUNING.night.count + 1);
    expect(s.endless).toBe(true);
    expect(s.lights.out).toBe(true);
    for (let i = 0; i < 4000; i++) tick(s, 0.25);
    expect(s.status).toBe("running");
    expect(s.customers.length).toBe(0);
    expect(noteLines(s.night).length).toBe(0);
  });
});
