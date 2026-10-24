import { describe, expect, it } from "vitest";
import { TUNING } from "@/config/tuning";
import {
  closeCameras,
  customerAtTill,
  emptySlotIds,
  holdAction,
  listInteractables,
  performAction,
  seedInitialEmpties,
  selectFeed,
  tick,
} from "@/game/chores";
import { shelfSlots } from "@/game/layout";
import { createState, startNight } from "@/game/state";

function running(night = 1) {
  const s = createState(night);
  startNight(s);
  return s;
}

function run(s: ReturnType<typeof createState>, seconds: number, step = 0.25) {
  for (let t = 0; t < seconds; t += step) tick(s, step);
}

describe("shelf layout", () => {
  it("has a few hundred slots, all unique", () => {
    const slots = shelfSlots();
    expect(slots.length).toBeGreaterThan(150);
    expect(new Set(slots.map((s) => s.id)).size).toBe(slots.length);
  });
});

describe("restock", () => {
  it("starts with the configured number of empty slots and fills one box at a time", () => {
    const s = running();
    seedInitialEmpties(s);
    expect(emptySlotIds(s).length).toBe(TUNING.chores.restock.initialEmpty);

    const before = s.score;
    const slotId = emptySlotIds(s)[0]!;
    // Can't restock without a box.
    expect(performAction(s, { kind: "restock", slotId })).toBe(false);
    expect(performAction(s, { kind: "takeBox" })).toBe(true);
    expect(s.carrying).toBe(TUNING.chores.restock.boxItems);
    expect(performAction(s, { kind: "restock", slotId })).toBe(true);
    expect(s.carrying).toBe(TUNING.chores.restock.boxItems - 1);
    expect(s.slots[slotId]!.filled).toBe(true);
    expect(s.score).toBe(before + TUNING.score.restock.reward);
  });

  it("offers the stock pile when empty-handed and the empty slots when carrying", () => {
    const s = running();
    seedInitialEmpties(s);
    const kinds = listInteractables(s).map((i) => i.action.kind);
    expect(kinds).toContain("takeBox");
    // No box on offer when there's nothing to fill; a box in hand can go back.
    for (const id of emptySlotIds(s)) s.slots[id] = { filled: true, emptySince: 0 };
    expect(listInteractables(s).map((i) => i.action.kind)).not.toContain("takeBox");
    seedInitialEmpties(s);
    expect(kinds).not.toContain("restock");
    performAction(s, { kind: "takeBox" });
    const carrying = listInteractables(s).map((i) => i.action.kind);
    expect(carrying.filter((k) => k === "restock").length).toBe(TUNING.chores.restock.initialEmpty);
    expect(carrying).not.toContain("takeBox");
    expect(carrying).toContain("putBack");
    performAction(s, { kind: "putBack" });
    expect(s.carrying).toBe(0);
  });

  it("empty shelves cost score after the grace period", () => {
    const s = running();
    seedInitialEmpties(s);
    const before = s.score;
    run(s, TUNING.score.restock.grace + 30);
    expect(s.score).toBeLessThan(before);
  });
});

describe("customers", () => {
  it("walk in, take something off a shelf, queue at the till, and leave when served", () => {
    const s = running();
    const emptyBefore = emptySlotIds(s).length;
    run(s, TUNING.chores.customer.first[1] + 30);
    expect(emptySlotIds(s).length).toBeGreaterThan(emptyBefore);
    const cu = customerAtTill(s);
    expect(cu).toBeDefined();
    expect(cu!.x).toBeCloseTo(TUNING.chores.queue[0]!.x);
    const before = s.score;
    expect(performAction(s, { kind: "serve", customerId: cu!.id })).toBe(true);
    expect(s.score).toBe(before + TUNING.score.serve.reward);
    expect(customerAtTill(s)).toBeUndefined();
    run(s, 10);
    expect(s.customers.find((c) => c.id === cu!.id)).toBeUndefined();
  });

  it("walk out after running out of patience, and the queue shuffles forward", () => {
    const s = running();
    run(s, TUNING.chores.customer.first[1] + 30 + TUNING.score.serve.patience + 15);
    expect(s.stats.walkouts).toBeGreaterThanOrEqual(1);
    for (const c of s.customers) {
      if (c.phase !== "leaving") expect(c.queueIndex).toBeLessThan(TUNING.chores.customer.maxQueue);
    }
    const indices = s.customers.filter((c) => c.phase !== "leaving").map((c) => c.queueIndex).sort();
    expect(new Set(indices).size).toBe(indices.length);
  });
});

describe("spills and cameras", () => {
  it("a spill appears and can be mopped", () => {
    const s = running();
    run(s, TUNING.chores.spill.first[1] + 5);
    expect(s.spills.length).toBeGreaterThanOrEqual(1);
    const id = s.spills[0]!.id;
    expect(performAction(s, { kind: "mop", spillId: id })).toBe(true);
    expect(s.spills.find((sp) => sp.id === id)).toBeUndefined();
    expect(s.stats.mopped).toBe(1);
  });

  it("a ping is answered by watching the right feed, or missed if ignored", () => {
    const s = running();
    run(s, TUNING.chores.ping.first[1] + 5);
    expect(s.ping).not.toBeNull();
    const feed = s.ping!.feed;
    performAction(s, { kind: "cameras" });
    expect(s.viewingFeed).toBe(0);
    selectFeed(s, feed);
    run(s, TUNING.chores.ping.confirmSeconds + 1);
    expect(s.ping).toBeNull();
    expect(s.stats.pingsAnswered).toBe(1);
    closeCameras(s);

    // Ignore the next one.
    run(s, TUNING.chores.ping.every[1] + 5);
    expect(s.ping).not.toBeNull();
    run(s, TUNING.chores.ping.expires - s.ping!.age + 1);
    expect(s.ping).toBeNull();
    expect(s.stats.pingsMissed).toBe(1);
  });
});

describe("hold-to-act", () => {
  it("completes after the duration and resets when released", () => {
    const s = running();
    const action = { kind: "takeBox" as const };
    const d = TUNING.interact.duration.takeBox;
    expect(holdAction(s, action, true, d / 2)).toBe(false);
    expect(s.action?.progress).toBeCloseTo(0.5);
    holdAction(s, action, false, 0.1);
    expect(s.action).toBeNull();
    expect(holdAction(s, action, true, d / 2)).toBe(false);
    expect(holdAction(s, action, true, d / 2 + 0.01)).toBe(true);
    expect(s.carrying).toBeGreaterThan(0);
  });
});
