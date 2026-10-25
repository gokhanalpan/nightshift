import { describe, expect, it } from "vitest";
import { ANOMALIES } from "@/config/anomalies";
import { TUNING, clockToMinutes, type RegularId } from "@/config/tuning";
import { greet, performAction, spawnRegular, tick } from "@/game/chores";
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
    expect(s.customers.every((c) => !c.wrong)).toBe(true);
  });

  it("turn back if the door is locked while they're still outside", () => {
    const s = running(1);
    runUntil(s, "23:25");
    const cu = s.customers.find((c) => c.phase === "entering" && c.z < -4.5);
    if (cu) {
      performAction(s, { kind: "door" });
      tick(s, 0.5);
      expect(cu.phase).toBe("leaving");
    }
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
    runUntil(open, "02:45");
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

describe("night 2 — the peeker", () => {
  it("appears off to the side, slips away when looked at, and is gone", () => {
    const s = running(2);
    s.player = { x: -3.9, z: -1.5, yaw: Math.PI }; // at the till, facing the aisles
    runUntil(s, "00:51");
    expect(s.peeker?.phase).toBe("watching");
    const pk = s.peeker!;
    // Look straight at it.
    s.player = { x: -3.9, z: -1.5, yaw: Math.atan2(-(pk.x + 3.9), -(pk.z + 1.5)) };
    tick(s, 0.2);
    expect(s.peeker?.phase).toBe("watching");
    tick(s, 0.2);
    expect(s.peeker?.phase).toBe("hiding");
    tick(s, TUNING.peeker.hideSeconds + 0.1);
    expect(s.peeker).toBeNull();
  });

  it("gives up by itself if never looked at", () => {
    const s = running(2);
    s.player = { x: -3.9, z: -1.5, yaw: 0 }; // facing the door, away from it
    runUntil(s, "00:51");
    expect(s.peeker).not.toBeNull();
    tick(s, 50);
    expect(s.peeker).toBeNull();
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

  it("a greeted repeat breaks rule 4 once the rule is on the note", () => {
    const s = running(4);
    for (const c of s.customers) c.phase = "gone";
    s.visited.push("kid");
    spawnRegular(s, "kid", { atTill: true, repeat: true });
    greet(s);
    expect(s.rulesBroken).toContain(4);
  });

  it("waiting brings the lights back by themselves, with something at the end of an aisle", () => {
    const s = running(3);
    runUntil(s, "02:31");
    tick(s, 46);
    expect(s.lights.out).toBe(false);
    expect(s.rulesBroken).not.toContain(3);
    expect(s.peeker?.phase).toBe("watching");
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

  it("a rule broken early in the week is a strike, not the end; on night 5 it is", () => {
    const one = running(2);
    one.rulesBroken.push(1);
    runUntil(one, "06:00");
    expect(one.ending).toBe("good");

    const many = createState(4, 4);
    startNight(many);
    many.rulesBroken.push(2);
    runUntil(many, "06:00");
    expect(many.ending).toBe("good");

    const last = createState(5, 0);
    startNight(last);
    last.rulesBroken.push(1);
    runUntil(last, "06:00");
    expect(last.ending).toBe("bad");
  });

  it("leaving after the knock ends the night; a broken rule makes it bad", () => {
    const s = running(5);
    runUntil(s, "05:01");
    s.rulesBroken.push(3);
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
