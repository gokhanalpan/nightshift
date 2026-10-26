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

describe("night 4 — the hanging man", () => {
  it("is still, tilts after a few seconds of being watched, flickers, changes, and is gone when looked away from and back", () => {
    const s = running(4);
    s.player = { x: -3.9, z: -1.5, yaw: 0 }; // facing the door, away from the aisles
    runUntil(s, "02:41");
    expect(s.hanging?.stage).toBe("still");
    tick(s, 5);
    expect(s.hanging?.stage).toBe("still"); // not being looked at
    const h = s.hanging!;
    const at = { x: -3.9, z: -1.5, yaw: Math.atan2(-(h.x + 3.9), -(h.z + 1.5)) };
    s.player = at;
    tick(s, TUNING.hanging.tiltAfter + 0.1);
    expect(s.hanging?.stage).toBe("tilt");
    tick(s, TUNING.hanging.flickerAfter - TUNING.hanging.tiltAfter);
    expect(s.hanging?.stage).toBe("out");
    tick(s, TUNING.hanging.outSeconds + 0.05);
    expect(s.hanging?.stage).toBe("changed");
    // Keep looking: he stays. Look away, look back: gone.
    tick(s, 3);
    expect(s.hanging?.stage).toBe("changed");
    s.player = { x: -3.9, z: -1.5, yaw: 0 };
    tick(s, 0.5);
    expect(s.hanging?.lookedAway).toBe(true);
    s.player = at;
    tick(s, 0.1);
    expect(s.hanging).toBeNull();
  });

  it("on night 5 he rushes the player instead of vanishing", () => {
    const s = running(5);
    s.player = { x: -3.9, z: -1.5, yaw: 0 };
    runUntil(s, "01:41");
    const h = s.hanging!;
    expect(h.rush).toBe(true);
    const at = { x: -3.9, z: -1.5, yaw: Math.atan2(-(h.x + 3.9), -(h.z + 1.5)) };
    s.player = at;
    for (let t = 0; t < TUNING.hanging.flickerAfter + TUNING.hanging.outSeconds + 0.3; t += 0.1) tick(s, 0.1);
    expect(s.hanging?.stage).toBe("changed");
    s.player = { x: -3.9, z: -1.5, yaw: 0 };
    tick(s, 0.5);
    s.player = at;
    tick(s, 0.1);
    expect(s.hanging?.stage).toBe("rush");
    tick(s, TUNING.hanging.rushSeconds + 0.1);
    expect(s.hanging).toBeNull();
  });
});

describe("the test night", () => {
  it("fires one of everything and is a fair bit longer", () => {
    const s = createState(5, 0, true);
    startNight(s);
    expect(s.length).toBeGreaterThan(createState(5).length);
    runUntil(s, "06:00");
    const kinds = new Set(s.anomaliesFired.map((id) => id.replace(/^t-/, "").replace(/-\d$/, "")));
    for (const k of ["figure-shelter", "peeker", "figure-road", "spill", "lights", "figure-lot", "hanging", "phone", "figure-window", "knock", "key"]) {
      expect(kinds).toContain(k);
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

describe("the six from the list", () => {
  it("wrong customer: served, breaks rule 2; their camera image is one aisle over", () => {
    const s = running(2);
    runUntil(s, "01:21");
    const cu = s.customers.find((c) => c.camOffset);
    expect(cu).toBeDefined();
    expect(cu!.camOffset!.x).toBe(TUNING.wrongCustomerOffset);
    for (const c of s.customers) if (c.id !== cu!.id) c.phase = "gone";
    cu!.queueIndex = 0;
    cu!.phase = "toQueue";
    cu!.path = [{ x: TUNING.chores.queue[0]!.x, z: TUNING.chores.queue[0]!.z }];
    for (let i = 0; i < 400 && (cu!.phase as string) !== "queued"; i++) tick(s, 0.1);
    expect(cu!.phase).toBe("queued");
    performAction(s, { kind: "serve", customerId: cu!.id });
    expect(s.rulesBroken).toContain(2);
  });

  it("lingerer: served, stays with their back to you, moves when you look away, three moves and gone", () => {
    const s = running(2);
    runUntil(s, "04:21");
    const cu = s.customers.find((c) => c.lingers);
    expect(cu).toBeDefined();
    for (const c of s.customers) if (c.id !== cu!.id) c.phase = "gone";
    cu!.queueIndex = 0;
    cu!.phase = "toQueue";
    cu!.path = [{ x: TUNING.chores.queue[0]!.x, z: TUNING.chores.queue[0]!.z }];
    for (let i = 0; i < 400 && (cu!.phase as string) !== "queued"; i++) tick(s, 0.1);
    performAction(s, { kind: "serve", customerId: cu!.id });
    expect(cu!.phase).toBe("lingering");
    // Looking at them: nothing happens.
    s.player = { x: -3.9, z: -1.5, yaw: Math.atan2(-(cu!.x + 3.9), -(cu!.z + 1.5)) };
    tick(s, 8);
    expect(cu!.lingerStep).toBe(0);
    // Look away: a step each five seconds, then gone.
    s.player = { x: -3.9, z: -1.5, yaw: Math.PI };
    for (let i = 0; i < 60; i++) tick(s, 0.1);
    expect(cu!.lingerStep).toBe(1);
    for (let i = 0; i < 100; i++) tick(s, 0.1);
    expect(cu!.lingerStep).toBe(3);
    expect(s.customers.find((c) => c.id === cu!.id)).toBeUndefined();
  });

  it("cart: closer each time the player looks away and back, then beside them, then gone", () => {
    const s = running(2);
    const st0 = TUNING.cart.stations[0]!;
    s.player = { x: -1.0, z: -2.0, yaw: Math.atan2(-(st0.x + 1.0), -(st0.z + 2.0)) }; // already looking that way
    runUntil(s, "02:51");
    expect(s.cart?.stage).toBe(0);
    const at = () => ({ x: -1.0, z: -2.0, yaw: Math.atan2(-(s.cart!.x + 1.0), -(s.cart!.z + 2.0)) });
    const away = { x: -1.0, z: -2.0, yaw: 0 };
    s.player = at();
    tick(s, 3);
    expect(s.cart?.stage).toBe(0);
    for (let i = 0; i < 3; i++) {
      s.player = away;
      tick(s, 2);
      s.player = at();
      tick(s, 0.1);
      expect(s.cart?.stage).toBe(i + 1);
    }
    expect(s.cart?.besideAt).not.toBeNull();
    tick(s, TUNING.cart.besideSeconds + 0.1);
    expect(s.cart).toBeNull();
  });

  it("clock lie: on for 45 s, 13 minutes, then gone", () => {
    const s = running(3);
    runUntil(s, "01:56");
    expect(s.clockLie?.minutes).toBe(13);
    tick(s, 46);
    expect(s.clockLie).toBeNull();
  });

  it("second phone: answering opens the line longer, breaks rule 5 only once", () => {
    const s = running(5);
    runUntil(s, "01:50");
    performAction(s, { kind: "door" });
    runUntil(s, "03:06");
    performAction(s, { kind: "phone" });
    expect(s.rulesBroken).toEqual([5]);
    runUntil(s, "04:01");
    expect(s.phone?.second).toBe(true);
    performAction(s, { kind: "phone" });
    expect(s.rulesBroken).toEqual([5]);
    expect(s.phone!.until - s.phone!.answeredAt).toBeGreaterThan(15);
  });

  it("light follow: runs its 90 seconds", () => {
    const s = running(5);
    runUntil(s, "00:31");
    expect(s.lightFollow).not.toBeNull();
    tick(s, 30);
    expect(s.lightFollow!.t).toBeGreaterThan(29);
    tick(s, 65);
    expect(s.lightFollow).toBeNull();
  });
});
